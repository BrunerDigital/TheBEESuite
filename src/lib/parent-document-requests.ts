import { writeAuditLog } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { isEmail, sendEmail } from "@/lib/integrations";
import { notificationExpiresAt } from "@/lib/notification-policy";
import { buildParentPortalUrl } from "@/lib/parent-portal-invitations";
import {
  ensureParentPortalLoginForGuardian,
  parentPortalAccessDisabled,
} from "@/lib/parent-portal-logins";
import { issueParentPortalSetupLink, recordParentPortalSetupLinkDelivery } from "@/lib/parent-portal-setup-links";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/supabase-auth";

export const PARENT_DOCUMENT_REQUEST_EMAIL_PURPOSE = "parent_document_request_email";

type GuardianRecipient = {
  id: string;
  fullName: string;
  email: string | null;
  userId: string | null;
  customFields?: unknown;
};

type ParentDocumentRequestRecipient = {
  email: string;
  label: string;
  guardianIds: string[];
  userIds: string[];
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function documentActionLabel(storageKey?: string | null) {
  const key = (storageKey ?? "").toLowerCase();
  if (key.includes("signature")) return "review and sign";
  return "upload or submit";
}

export function parentDocumentRequestRecipientOptions(guardians: GuardianRecipient[]) {
  const recipients = new Map<string, ParentDocumentRequestRecipient>();

  for (const guardian of guardians) {
    if (parentPortalAccessDisabled(guardian.customFields)) continue;
    const email = normalizeEmail(guardian.email);
    if (!isEmail(email)) continue;
    const current = recipients.get(email);
    if (current) {
      if (!current.guardianIds.includes(guardian.id)) current.guardianIds.push(guardian.id);
      if (guardian.userId && !current.userIds.includes(guardian.userId)) current.userIds.push(guardian.userId);
      continue;
    }
    recipients.set(email, {
      email,
      label: guardian.fullName || "Parent/guardian",
      guardianIds: [guardian.id],
      userIds: guardian.userId ? [guardian.userId] : [],
    });
  }

  return Array.from(recipients.values()).sort((left, right) => left.label.localeCompare(right.label));
}

export function buildParentDocumentRequestEmailText({
  recipientLabel,
  familyName,
  childName,
  centerLabel,
  documentName,
  actionLabel,
  accessUrl,
  setupLinkExpiresAt,
}: {
  recipientLabel: string;
  familyName: string;
  childName?: string | null;
  centerLabel: string;
  documentName: string;
  actionLabel: string;
  accessUrl: string;
  setupLinkExpiresAt?: Date | null;
}) {
  const subjectLine = childName ? `${documentName} for ${childName}` : `${documentName} for ${familyName}`;
  return [
    `Hi ${recipientLabel || "there"},`,
    "",
    `${centerLabel} is requesting ${subjectLine} in The BEE Suite.`,
    `Please open the parent portal to ${actionLabel} the requested information.`,
    "Your submission will go directly back to the school document record for director review.",
    "",
    setupLinkExpiresAt
      ? `Create your password with this private one-time link: ${accessUrl}`
      : `Open the branded parent form: ${accessUrl}`,
    setupLinkExpiresAt
      ? `The link expires at ${setupLinkExpiresAt.toISOString()} and stops working after use.`
      : "Sign in with the guardian email where you received this message and your private password.",
    "",
    "If you were not expecting this request, please contact the school before continuing.",
  ].join("\n");
}

async function ensureParentPortalLoginForRecipient({
  recipient,
  guardians,
}: {
  recipient: ParentDocumentRequestRecipient;
  guardians: GuardianRecipient[];
}) {
  const matchingGuardians = guardians.filter((guardian) => normalizeEmail(guardian.email) === recipient.email);
  const primaryGuardian = matchingGuardians[0];
  if (!primaryGuardian) {
    return { ok: false as const, error: "No linkable parent guardian was found for this recipient." };
  }
  const login = await ensureParentPortalLoginForGuardian({
    guardianId: primaryGuardian.id,
    linkedReason: "parent_document_request",
  });
  if (!login.ok) {
    return { ok: false as const, error: login.reason };
  }

  return {
    ok: true as const,
    userId: login.userId,
    created: login.created,
    reactivated: login.reactivated,
    credentialCreated: login.credentialCreated,
  };
}

export async function sendParentDocumentRequestEmailForDocument({
  documentId,
  user,
  requestUrl,
}: {
  documentId: string;
  user: CurrentUser;
  requestUrl: string;
}) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      name: true,
      type: true,
      storageKey: true,
      child: {
        select: {
          fullName: true,
          family: {
            select: {
              id: true,
              name: true,
              centerId: true,
              guardians: { select: { id: true, fullName: true, email: true, userId: true, customFields: true }, orderBy: { fullName: "asc" } },
            },
          },
        },
      },
      family: {
        select: {
          id: true,
          name: true,
          centerId: true,
          guardians: { select: { id: true, fullName: true, email: true, userId: true, customFields: true }, orderBy: { fullName: "asc" } },
        },
      },
    },
  });

  if (!document) {
    return { ok: false as const, status: 404, error: "Document request was not found." };
  }
  const family = document.family ?? document.child?.family ?? null;
  if (!family?.centerId) {
    return { ok: false as const, status: 400, error: "Document request is not linked to a school family." };
  }
  const center = await prisma.center.findUnique({
    where: { id: family.centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      email: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
  });
  if (!center) {
    return { ok: false as const, status: 404, error: "School was not found for this document request." };
  }

  const recipients = parentDocumentRequestRecipientOptions(family.guardians);
  if (!recipients.length) {
    return { ok: false as const, status: 400, error: "Add a parent/guardian personal email before sending this request." };
  }

  const centerLabel = center.crmLocationId ?? center.name;
  const portalUrl = `${buildParentPortalUrl(getAppBaseUrl(requestUrl))}#documents`;
  const subject = `${centerLabel}: ${document.name} requested`;
  const actionLabel = documentActionLabel(document.storageKey);
  const results: Array<{ email: string; ok: boolean; configured: boolean; error?: string }> = [];
  let emailsSent = 0;
  let notificationsCreated = 0;
  let parentAccountsLinked = 0;
  const linkedUserIds = new Set<string>();

  for (const recipient of recipients) {
    const login = await ensureParentPortalLoginForRecipient({
      recipient,
      guardians: family.guardians,
    });
    if (!login.ok) {
      results.push({ email: recipient.email, ok: false, configured: true, error: login.error });
      continue;
    }
    if (login.created || login.reactivated) parentAccountsLinked += 1;
    if (login.userId) linkedUserIds.add(login.userId);

    const needsSetupLink = login.created || login.reactivated || login.credentialCreated;
    const setupLink = needsSetupLink
      ? await issueParentPortalSetupLink({
          requestUrl,
          user,
          parentUserId: login.userId,
          guardianId: recipient.guardianIds[0],
          email: recipient.email,
          centerId: center.id,
          familyId: family.id,
          reason: "parent_document_request",
        })
      : null;
    if (setupLink && !setupLink.ok) {
      results.push({ email: recipient.email, ok: false, configured: true, error: setupLink.error });
      continue;
    }

    const text = buildParentDocumentRequestEmailText({
      recipientLabel: recipient.label,
      familyName: family.name,
      childName: document.child?.fullName,
      centerLabel,
      documentName: document.name,
      actionLabel,
      accessUrl: setupLink?.ok ? setupLink.setupUrl : portalUrl,
      setupLinkExpiresAt: setupLink?.ok ? setupLink.expiresAt : null,
    });
    const email = await sendEmail({
      to: [recipient.email],
      subject,
      text,
      replyTo: center.email,
      fromName: `${centerLabel} via The BEE Suite`,
      categories: [PARENT_DOCUMENT_REQUEST_EMAIL_PURPOSE],
      customArgs: { documentId: document.id, familyId: family.id, centerId: center.id, ...(setupLink?.ok ? { setupTokenId: setupLink.tokenId } : {}) },
      tenantId: center.organization.tenantId,
    });
    const deliveryAuditText = setupLink?.ok
      ? text.replace(setupLink.setupUrl, "[private setup link redacted]")
      : text;
    await recordEmailDeliveryAttempt({
      tenantId: center.organization.tenantId,
      centerId: center.id,
      purpose: PARENT_DOCUMENT_REQUEST_EMAIL_PURPOSE,
      to: [recipient.email],
      subject,
      text: deliveryAuditText,
      replyTo: center.email,
      fromName: `${centerLabel} via The BEE Suite`,
      result: email,
      metadata: { documentId: document.id, familyId: family.id, accessMode: setupLink?.ok ? "one_time_setup_link" : "existing_parent_login", ...(setupLink?.ok ? { setupTokenId: setupLink.tokenId } : {}) },
    });
    if (setupLink?.ok) await recordParentPortalSetupLinkDelivery({ tokenId: setupLink.tokenId, delivered: email.ok });
    if (email.ok) emailsSent += 1;
    results.push({ email: recipient.email, ok: email.ok, configured: email.configured, error: email.error });
  }

  const notificationUserIds = Array.from(linkedUserIds).filter(Boolean);
  if (notificationUserIds.length) {
    const created = await prisma.notification.createMany({
      data: notificationUserIds.map((userId) => ({
        userId,
        title: `Document requested: ${document.name}`,
        body: `${centerLabel} requested ${document.name}. Open the parent portal documents form to complete it.`,
        type: "document",
        priority: "normal",
        expiresAt: notificationExpiresAt(new Date(), 30),
      })),
    });
    notificationsCreated = created.count;
  }

  await writeAuditLog(user, {
    centerId: center.id,
    action: "parent_document.request_email.sent",
    resource: "Document",
    resourceId: document.id,
    metadata: {
      familyId: family.id,
      requestedEmails: recipients.map((recipient) => recipient.email),
      emailsSent,
      notificationsCreated,
      parentAccountsLinked,
      failedEmails: results.filter((result) => !result.ok).map((result) => result.email),
    },
  });

  const allFailed = results.length > 0 && emailsSent === 0;
  return {
    ok: !allFailed,
    status: allFailed ? 502 : 200,
    documentId: document.id,
    familyId: family.id,
    emailsSent,
    notificationsCreated,
    parentAccountsLinked,
    results,
    error: allFailed ? "Parent document request emails could not be sent." : undefined,
  };
}
