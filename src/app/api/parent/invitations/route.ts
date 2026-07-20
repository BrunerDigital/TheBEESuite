import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import {
  buildParentPortalInvitationText,
  PARENT_PORTAL_INVITE_MODE,
} from "@/lib/parent-portal-invitations";
import { ensureParentPortalLoginForGuardian } from "@/lib/parent-portal-logins";
import { issueParentPortalSetupLink, recordParentPortalSetupLinkDelivery } from "@/lib/parent-portal-setup-links";
import { canInviteGuardianToPortal } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const guardianId = clean(body.guardianId);
  const temporaryPassword = clean(body.temporaryPassword);

  if (!guardianId) {
    return NextResponse.json({ ok: false, error: "Guardian ID is required." }, { status: 400 });
  }
  if (temporaryPassword) {
    return NextResponse.json(
      { ok: false, error: "Parent portal passwords use the configured default parent password." },
      { status: 400 },
    );
  }

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: {
      family: true,
    },
  });

  if (!guardian) {
    return NextResponse.json({ ok: false, error: "Guardian not found." }, { status: 404 });
  }

  if (!guardian.family.centerId) {
    return NextResponse.json({ ok: false, error: "Guardian family is not linked to a center." }, { status: 400 });
  }
  const center = await prisma.center.findUnique({
    where: { id: guardian.family.centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      organizationId: true,
      organization: {
        select: {
          tenantId: true,
        },
      },
    },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found for this guardian family." }, { status: 404 });
  }

  const email = normalizeEmail(guardian.email);
  const existingUser = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, tenantId: true, role: true },
      })
    : null;
  const hasCenterAccess = canAccessAllCenters(user) || canAccessCenter(user, center.id);
  const guard = canInviteGuardianToPortal({
    canManageOperations: canManageOperations(user),
    hasCenterAccess,
    guardianEmail: email,
    existingUserTenantId: existingUser?.tenantId,
    targetTenantId: center.organization.tenantId,
    existingUserRole: existingUser?.role,
  });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  try {
    const provisioned = await ensureParentPortalLoginForGuardian({
      guardianId: guardian.id,
      linkedBy: user.email,
      linkedReason: "direct_parent_invitation",
    });
    if (!provisioned.ok) {
      return NextResponse.json({ ok: false, error: provisioned.reason }, { status: provisioned.status ?? 502 });
    }

    const setupLink = await issueParentPortalSetupLink({
      requestUrl: request.url,
      user,
      parentUserId: provisioned.userId,
      guardianId: guardian.id,
      email,
      centerId: center.id,
      familyId: guardian.familyId,
      reason: "direct_parent_invitation",
    });
    if (!setupLink.ok) {
      return NextResponse.json({ ok: false, error: setupLink.error }, { status: 502 });
    }

    const updatedGuardian = await prisma.guardian.findUnique({ where: { id: guardian.id } });
    const invitationText = buildParentPortalInvitationText({
      guardianName: guardian.fullName,
      centerLabel: center.crmLocationId ?? center.name,
      email,
      setupUrl: setupLink.setupUrl,
      expiresAt: setupLink.expiresAt,
    });
    const emailCopy = await sendEmail({
      to: [email],
      subject: "Create your The BEE Suite parent portal password",
      text: invitationText,
      fromName: "The BEE Suite",
      disableClickTracking: true,
      categories: ["parent_invitation_email"],
      customArgs: { guardianId: guardian.id, familyId: guardian.familyId, centerId: center.id, setupTokenId: setupLink.tokenId },
      tenantId: user.tenantId,
    });
    await recordParentPortalSetupLinkDelivery({ tokenId: setupLink.tokenId, delivered: emailCopy.ok });
    await recordEmailDeliveryAttempt({
      tenantId: user.tenantId,
      centerId: center.id,
      purpose: "parent_invitation_email",
      to: [email],
      subject: "Create your The BEE Suite parent portal password",
      text: invitationText,
      fromName: "The BEE Suite",
      result: emailCopy,
      metadata: { guardianId: guardian.id, familyId: guardian.familyId, setupTokenId: setupLink.tokenId },
    });

    await writeAuditLog(user, {
      centerId: center.id,
      action: "parent_portal.guardian_invited",
      resource: "Guardian",
      resourceId: guardian.id,
      metadata: {
        familyId: guardian.familyId,
        parentUserId: provisioned.userId,
        email,
        authMode: PARENT_PORTAL_INVITE_MODE,
        credentialCreated: provisioned.credentialCreated,
        setupTokenId: setupLink.tokenId,
        setupLinkExpiresAt: setupLink.expiresAt.toISOString(),
        emailCopySent: emailCopy.ok,
      },
    });

    if (!emailCopy.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: emailCopy.error || "The parent account was linked, but the private setup email could not be sent. Send a fresh parent setup link.",
          auth: { created: provisioned.created, credentialCreated: provisioned.credentialCreated, emailSent: false },
          emailCopy,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      guardian: {
        id: updatedGuardian?.id ?? guardian.id,
        fullName: updatedGuardian?.fullName ?? guardian.fullName,
        email: updatedGuardian?.email ?? guardian.email,
        userId: provisioned.userId,
      },
      auth: { created: provisioned.created, credentialCreated: provisioned.credentialCreated, emailSent: true },
      setupLink: { expiresAt: setupLink.expiresAt },
      emailCopy,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Parent portal setup could not be prepared." },
      { status: 502 },
    );
  }
}

export const POST = withApiLogging("POST", POSTHandler);
