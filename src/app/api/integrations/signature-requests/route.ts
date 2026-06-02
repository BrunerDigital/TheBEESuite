import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus } from "@prisma/client";
import { canAccessAllCenters, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { resolveSignatureRecipient, validateSignatureChildTarget } from "@/lib/document-guardrails";
import { sendEmail } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
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
      guardians: { select: { email: true } },
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
      storageKey: "signature_provider_pending",
    },
  });

  const email = await sendEmail({
    to: [recipient.email],
    subject: `Signature requested: ${name}`,
    text: `A Kid City USA document signature has been requested for ${family.name}.\n\nDocument: ${name}\nType: ${type}\n\nA DocuSign-style provider can be connected from The Bee Suite integrations.`,
    fromName: "Kid City USA",
  });

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
      provider: "signature_placeholder",
    },
  });

  return NextResponse.json({ ok: true, document, email }, { status: 201 });
}
