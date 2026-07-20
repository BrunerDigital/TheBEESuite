import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus } from "@prisma/client";
import { canAccessAllCenters, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { resolveSignatureRecipient, validateSignatureChildTarget } from "@/lib/document-guardrails";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { buildParentPortalUrl } from "@/lib/parent-portal-invitations";
import { prisma } from "@/lib/prisma";
import { INTERNAL_SIGNATURE_PENDING_KEY, SIGNATURE_CONSENT_TEXT } from "@/lib/signature-capture";
import { getAppBaseUrl } from "@/lib/supabase-auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Signature requests are not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const familyId = clean(body.familyId);
  const childId = clean(body.childId) || null;
  const name = clean(body.name) || "Signature request";
  const type = clean(body.type) || "policy_acknowledgment";
  const recipientEmail = clean(body.email);

  if (!familyId) {
    return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
  }

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: {
      guardians: { select: { email: true, userId: true, user: { select: { isActive: true } } } },
    },
  });

  if (!family) {
    return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });
  }
  if (!canAccessAllCenters(user) && (!family.centerId || !user.centerIds.includes(family.centerId))) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
  }
  const child = childId
    ? await prisma.child.findUnique({ where: { id: childId }, select: { id: true, familyId: true } })
    : null;
  if (childId && !child) {
    return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
  }
  const childGuard = validateSignatureChildTarget({ familyId, childId, childFamilyId: child?.familyId });
  if (!childGuard.ok) {
    return NextResponse.json({ ok: false, error: childGuard.error }, { status: childGuard.status });
  }
  const recipient = resolveSignatureRecipient({
    requestedEmail: recipientEmail,
    billingEmail: family.billingEmail,
    guardianEmails: family.guardians.map((guardian) => guardian.email),
  });
  if (!recipient.ok) {
    return NextResponse.json({ ok: false, error: recipient.error }, { status: recipient.status });
  }

  const document = await prisma.document.create({
    data: {
      familyId,
      childId,
      name,
      type,
      status: DocumentStatus.REQUESTED,
      restricted: type.toLowerCase().includes("medical") || type.toLowerCase().includes("custody"),
      storageKey: INTERNAL_SIGNATURE_PENDING_KEY,
    },
  });

  const portalUrl = buildParentPortalUrl(getAppBaseUrl(request.url));
  const signatureText = [
    `A document signature has been requested for ${family.name} in The BEE Suite.`,
    "",
    `Document: ${name}`,
    `Type: ${type}`,
    "",
    `Open the branded parent form to review and sign: ${portalUrl}#documents`,
    "Sign in with the guardian email where you received this message and your private password. If you have not created one yet or forgot it, use the parent login recovery link.",
    "",
    `Signature consent: ${SIGNATURE_CONSENT_TEXT}`,
  ].join("\n");
  const email = await sendEmail({
    to: [recipient.email],
    subject: `Signature requested: ${name}`,
    text: signatureText,
    fromName: "The BEE Suite",
    categories: ["signature_request_email"],
    customArgs: { documentId: document.id, familyId, childId: childId ?? "" },
    tenantId: user.tenantId,
  });
  await recordEmailDeliveryAttempt({
    tenantId: user.tenantId,
    centerId: family.centerId,
    purpose: "signature_request_email",
    to: [recipient.email],
    subject: `Signature requested: ${name}`,
    text: signatureText,
    fromName: "The BEE Suite",
    result: email,
    metadata: { documentId: document.id, familyId, childId },
  });
  const guardianUserIds = Array.from(new Set(
    family.guardians
      .filter((guardian) => guardian.userId && guardian.user?.isActive)
      .map((guardian) => guardian.userId)
      .filter((userId): userId is string => typeof userId === "string"),
  ));
  await Promise.all(
    guardianUserIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          title: `Signature requested: ${name}`,
          body: `${family.name} has a document ready to sign in the parent portal.`,
          type: "document_signature",
          priority: "high",
        },
      }),
    ),
  );

  await writeAuditLog(user, {
    centerId: family.centerId,
    action: "document.signature.requested",
    resource: "Document",
    resourceId: document.id,
    metadata: {
      familyId,
      childId,
      emailConfigured: email.configured,
      emailSent: email.ok,
      portalUrl,
      provider: "internal_signature_capture",
      parentNotificationCount: guardianUserIds.length,
    },
  });

  return NextResponse.json({ ok: true, document, email }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
