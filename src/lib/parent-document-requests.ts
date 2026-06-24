import { UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { isEmail, sendEmail } from "@/lib/integrations";
import { notificationExpiresAt } from "@/lib/notification-policy";
import { buildParentPortalUrl, getParentPortalDefaultPassword, PARENT_PORTAL_INVITE_MODE } from "@/lib/parent-portal-invitations";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword, getAppBaseUrl } from "@/lib/supabase-auth";

export const PARENT_DOCUMENT_REQUEST_EMAIL_PURPOSE = "parent_document_request_email";

type GuardianRecipient = {
  id: string;
  fullName: string;
  email: string | null;
  userId: string | null;
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
  portalUrl,
}: {
  recipientLabel: string;
  familyName: string;
  childName?: string | null;
  centerLabel: string;
  documentName: string;
  actionLabel: string;
  portalUrl: string;
}) {
  const defaultPassword = getParentPortalDefaultPassword();
  const subjectLine = childName ? `${documentName} for ${childName}` : `${documentName} for ${familyName}`;
  return [
    `Hi ${recipientLabel || "there"},`,
    "",
    `${centerLabel} is requesting ${subjectLine} in The BEE Suite.`,
    `Please open the parent portal to ${actionLabel} the requested information.`,
    "Your submission will go directly back to the school document record for director review.",
    "",
    `Open the branded parent form: ${portalUrl}`,
    `Sign in with the guardian email where you received this message. Use ${defaultPassword} as your default password if you have not changed it yet.`,
    "",
    "If you were not expecting this request, please contact the school before continuing.",
  ].join("\n");
}

async function ensureParentPortalLoginForRecipient({
  recipient,
  guardians,
  center,
}: {
  recipient: ParentDocumentRequestRecipient;
  guardians: GuardianRecipient[];
  center: {
    organizationId: string;
    organization: { tenantId: string };
  };
}) {
  const matchingGuardians = guardians.filter((guardian) => normalizeEmail(guardian.email) === recipient.email);
  const primaryGuardian = matchingGuardians[0];
  const existingUser = await prisma.user.findUnique({
    where: { email: recipient.email },
    select: { id: true, tenantId: true, role: true, isActive: true },
  });

  if (existingUser && existingUser.tenantId !== center.organization.tenantId) {
    return { ok: false as const, error: "A parent email is already assigned outside this tenant." };
  }
  if (existingUser && existingUser.role !== UserRole.PARENT_GUARDIAN) {
    return { ok: false as const, error: "A parent email is already assigned to a non-parent user." };
  }

  let parentUserId = existingUser?.id ?? "";
  let created = false;
  let reactivated = false;
  if (!existingUser) {
    const defaultPassword = getParentPortalDefaultPassword();
    if (defaultPassword.length < 8) {
      return { ok: false as const, error: "Parent portal default password is not configured." };
    }
    await upsertSupabaseAuthUserWithPassword({
      email: recipient.email,
      name: primaryGuardian?.fullName ?? recipient.label,
      password: defaultPassword,
      role: UserRole.PARENT_GUARDIAN,
      source: PARENT_PORTAL_INVITE_MODE,
    });
    const parentUser = await prisma.user.create({
      data: {
        tenantId: center.organization.tenantId,
        organizationId: center.organizationId,
        email: recipient.email,
        name: primaryGuardian?.fullName ?? recipient.label,
        role: UserRole.PARENT_GUARDIAN,
        isActive: true,
        mustResetPassword: false,
      },
      select: { id: true },
    });
    parentUserId = parentUser.id;
    created = true;
  } else if (!existingUser.isActive) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { isActive: true, mustResetPassword: false },
    });
    reactivated = true;
  }

  if (parentUserId && matchingGuardians.length) {
    await prisma.guardian.updateMany({
      where: { id: { in: matchingGuardians.map((guardian) => guardian.id) } },
      data: { userId: parentUserId },
    });
  }

  return { ok: true as const, userId: parentUserId, created, reactivated };
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
              guardians: { select: { id: true, fullName: true, email: true, userId: true }, orderBy: { fullName: "asc" } },
            },
          },
        },
      },
      family: {
        select: {
          id: true,
          name: true,
          centerId: true,
          guardians: { select: { id: true, fullName: true, email: true, userId: true }, orderBy: { fullName: "asc" } },
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
      center,
    });
    if (!login.ok) {
      results.push({ email: recipient.email, ok: false, configured: true, error: login.error });
      continue;
    }
    if (login.created || login.reactivated) parentAccountsLinked += 1;
    if (login.userId) linkedUserIds.add(login.userId);

    const text = buildParentDocumentRequestEmailText({
      recipientLabel: recipient.label,
      familyName: family.name,
      childName: document.child?.fullName,
      centerLabel,
      documentName: document.name,
      actionLabel,
      portalUrl,
    });
    const email = await sendEmail({
      to: [recipient.email],
      subject,
      text,
      replyTo: center.email,
      fromName: `${centerLabel} via The BEE Suite`,
      categories: [PARENT_DOCUMENT_REQUEST_EMAIL_PURPOSE],
      customArgs: { documentId: document.id, familyId: family.id, centerId: center.id },
      tenantId: center.organization.tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId: center.organization.tenantId,
      centerId: center.id,
      purpose: PARENT_DOCUMENT_REQUEST_EMAIL_PURPOSE,
      to: [recipient.email],
      subject,
      text,
      replyTo: center.email,
      fromName: `${centerLabel} via The BEE Suite`,
      result: email,
      metadata: { documentId: document.id, familyId: family.id, portalUrl },
    });
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
