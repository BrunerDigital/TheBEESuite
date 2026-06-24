import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import {
  buildParentPortalInvitationText,
  buildParentPortalSetupUrl,
  getParentPortalDefaultPassword,
  PARENT_PORTAL_INVITE_MODE,
} from "@/lib/parent-portal-invitations";
import { canInviteGuardianToPortal } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import {
  getAppBaseUrl,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

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

  let auth:
    | { ok: true; created?: boolean; updated?: boolean; defaultPasswordSet?: boolean; emailSent?: boolean }
    | { ok: false; error?: string; defaultPasswordSet?: boolean; emailSent?: boolean };
  const appBaseUrl = getAppBaseUrl(request.url);
  const defaultPassword = getParentPortalDefaultPassword();

  if (defaultPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "Parent portal default password is not configured." }, { status: 500 });
  }

  try {
    const upsert = await upsertSupabaseAuthUserWithPassword({
      email,
      name: guardian.fullName,
      password: defaultPassword,
      role: UserRole.PARENT_GUARDIAN,
      source: PARENT_PORTAL_INVITE_MODE,
    });
    auth = {
      ok: true,
      created: upsert.created,
      updated: upsert.updated,
      defaultPasswordSet: true,
    };
  } catch (error) {
    auth = { ok: false, error: error instanceof Error ? error.message : "Supabase auth setup failed." };
  }

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error || "Parent portal auth setup failed." }, { status: 502 });
  }

  const parentUser = await prisma.user.upsert({
    where: { email },
    update: {
      name: guardian.fullName,
      role: UserRole.PARENT_GUARDIAN,
      isActive: true,
      organizationId: center.organizationId,
      mustResetPassword: false,
      sessionVersion: { increment: 1 },
    },
    create: {
      tenantId: center.organization.tenantId,
      organizationId: center.organizationId,
      email,
      name: guardian.fullName,
      role: UserRole.PARENT_GUARDIAN,
      isActive: true,
      mustResetPassword: false,
    },
  });

  const updatedGuardian = await prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      userId: parentUser.id,
      customFields: {
        ...(guardian.customFields && typeof guardian.customFields === "object" && !Array.isArray(guardian.customFields)
          ? guardian.customFields
          : {}),
        parentPortal: {
          linkedAt: new Date().toISOString(),
          linkedBy: user.email,
          inviteMode: PARENT_PORTAL_INVITE_MODE,
          loginEmail: email,
        },
      },
    },
  });

  const portalUrl = buildParentPortalSetupUrl(appBaseUrl);
  const invitationText = buildParentPortalInvitationText({
    guardianName: guardian.fullName,
    centerLabel: center.crmLocationId ?? center.name,
    email,
    portalUrl,
  });
  const emailCopy = await sendEmail({
    to: [email],
    subject: "Your The BEE Suite parent portal is ready",
    text: invitationText,
    fromName: "The BEE Suite",
    categories: ["parent_invitation_email"],
    customArgs: { guardianId: guardian.id, familyId: guardian.familyId, centerId: center.id },
    tenantId: user.tenantId,
  });
  await recordEmailDeliveryAttempt({
    tenantId: user.tenantId,
    centerId: center.id,
    purpose: "parent_invitation_email",
    to: [email],
    subject: "Your The BEE Suite parent portal is ready",
    text: invitationText,
    fromName: "The BEE Suite",
    result: emailCopy,
    metadata: { guardianId: guardian.id, familyId: guardian.familyId },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "parent_portal.guardian_invited",
    resource: "Guardian",
    resourceId: guardian.id,
    metadata: {
      familyId: guardian.familyId,
      parentUserId: parentUser.id,
      email,
      authMode: PARENT_PORTAL_INVITE_MODE,
      defaultPasswordSet: "defaultPasswordSet" in auth ? auth.defaultPasswordSet : false,
      emailCopySent: emailCopy.ok,
    },
  });

  if (!emailCopy.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: emailCopy.error || "The parent portal user was linked, but the login email could not be sent. Try Send Parent Login again.",
        auth: { ...auth, emailSent: false },
        emailCopy,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    guardian: {
      id: updatedGuardian.id,
      fullName: updatedGuardian.fullName,
      email: updatedGuardian.email,
      userId: parentUser.id,
    },
    auth: { ...auth, emailSent: true },
    emailCopy,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
