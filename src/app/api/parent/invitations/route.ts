import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import {
  buildParentPortalInvitationHtml,
  buildParentPortalInvitationText,
  buildParentLoginUrl,
  PARENT_PORTAL_INVITE_MODE,
} from "@/lib/parent-portal-invitations";
import { ensureParentPortalLoginForGuardian } from "@/lib/parent-portal-logins";
import { canInviteGuardianToPortal } from "@/lib/portal-guardrails";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { getAppBaseUrl } from "@/lib/supabase-auth";
import { buildManualEmailCopy } from "@/lib/manual-email-copy";
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
      { ok: false, error: "Custom temporary passwords are not accepted. Parent access uses the school-issued first-login password." },
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
          name: true,
          brand: { select: { name: true, slug: true } },
          tenant: { select: { name: true, slug: true } },
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
    const defaultPinData = !guardian.checkInPinHash
      ? defaultGuardianPinUpdate({ guardianId: guardian.id, phone: guardian.phone, setById: user.id })
      : null;
    if (!guardian.checkInPinHash && !defaultPinData) {
      return NextResponse.json({ ok: false, error: "Add a phone number with at least 4 digits before sending the parent app invite." }, { status: 400 });
    }

    const provisioned = await ensureParentPortalLoginForGuardian({
      guardianId: guardian.id,
      linkedBy: user.email,
      linkedReason: "direct_parent_invitation",
      resetToInitialPassword: true,
    });
    if (!provisioned.ok) {
      return NextResponse.json({ ok: false, error: provisioned.reason }, { status: provisioned.status ?? 502 });
    }

    if (defaultPinData) {
      await prisma.guardian.update({ where: { id: guardian.id }, data: defaultPinData });
    }

    const updatedGuardian = await prisma.guardian.findUnique({ where: { id: guardian.id } });
    const appBaseUrl = getAppBaseUrl(request.url);
    const loginUrl = buildParentLoginUrl(appBaseUrl);
    const branding = resolveWorkspaceBranding({
      tenantName: center.organization.tenant.name,
      tenantSlug: center.organization.tenant.slug,
      brandName: center.organization.brand?.name,
      brandSlug: center.organization.brand?.slug,
      organizationName: center.organization.name,
    });
    const invitationText = buildParentPortalInvitationText({
      guardianName: guardian.fullName,
      centerLabel: center.crmLocationId ?? center.name,
      email,
      loginUrl,
    });
    const invitationHtml = buildParentPortalInvitationHtml({
      guardianName: guardian.fullName,
      centerLabel: center.crmLocationId ?? center.name,
      email,
      loginUrl,
      branding,
    });
    const subject = `${center.crmLocationId ?? center.name}: your parent app is ready`;
    const manualCopy = buildManualEmailCopy({ to: email, subject, body: invitationText });
    const emailCopy = await sendEmail({
      to: [email],
      subject,
      text: invitationText,
      html: invitationHtml,
      fromName: branding.name,
      disableClickTracking: true,
      categories: ["parent_invitation_email"],
      customArgs: { guardianId: guardian.id, familyId: guardian.familyId, centerId: center.id },
      tenantId: user.tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId: user.tenantId,
      centerId: center.id,
      purpose: "parent_invitation_email",
      to: [email],
      subject,
      text: invitationText,
      html: invitationHtml,
      fromName: branding.name,
      result: emailCopy,
      metadata: { guardianId: guardian.id, familyId: guardian.familyId, brand: branding.kind },
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
        initialPasswordIssued: true,
        kioskPinDefaultedFromPhone: Boolean(defaultPinData),
        emailBrand: branding.kind,
        emailCopySent: emailCopy.ok,
      },
    });

    if (!emailCopy.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: emailCopy.error || "The parent account was linked, but the invitation email could not be sent. Use the manual email copy provided.",
          auth: { created: provisioned.created, credentialCreated: provisioned.credentialCreated, emailSent: false },
          emailCopy,
          manualCopy,
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
      emailCopy,
      manualCopy,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Parent portal setup could not be prepared." },
      { status: 502 },
    );
  }
}

export const POST = withApiLogging("POST", POSTHandler);
