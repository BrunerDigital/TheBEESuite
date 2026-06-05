import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { canInviteGuardianToPortal } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import {
  ensureSupabaseAuthUser,
  getPasswordResetRedirectUrl,
  requestSupabasePasswordReset,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

export async function POST(request: NextRequest) {
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
  if (temporaryPassword && temporaryPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "Temporary passwords must be at least 8 characters." }, { status: 400 });
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
    | { ok: true; created?: boolean; updated?: boolean; alreadyExisted?: boolean; passwordResetSent?: boolean; emailSent?: boolean }
    | { ok: false; error?: string; passwordResetSent?: boolean; emailSent?: boolean };

  try {
    if (temporaryPassword) {
      const authResult = await upsertSupabaseAuthUserWithPassword({
        email,
        name: guardian.fullName,
        password: temporaryPassword,
        role: UserRole.PARENT_GUARDIAN,
        source: "bee_suite_parent_portal_invite",
      });
      auth = { ok: true, created: authResult.created, updated: authResult.updated };
    } else {
      const ensure = await ensureSupabaseAuthUser({ email, name: guardian.fullName });
      if (!ensure.ok) {
        auth = { ok: false, error: ensure.error };
      } else {
        const reset = await requestSupabasePasswordReset(email, getPasswordResetRedirectUrl(request.url));
        auth = {
          ok: reset.ok,
          created: ensure.created,
          alreadyExisted: ensure.alreadyExisted,
          passwordResetSent: reset.ok,
          error: reset.ok ? undefined : `Password reset email returned ${reset.status}.`,
        };
      }
    }
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
      mustResetPassword: true,
      sessionVersion: { increment: 1 },
    },
    create: {
      tenantId: center.organization.tenantId,
      organizationId: center.organizationId,
      email,
      name: guardian.fullName,
      role: UserRole.PARENT_GUARDIAN,
      isActive: true,
      mustResetPassword: true,
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
          inviteMode: temporaryPassword ? "temporary_password" : "password_reset",
        },
      },
    },
  });

  const invitationText = [
    `Hi ${guardian.fullName},`,
    "",
    `Your parent portal for ${center.crmLocationId ?? center.name} is ready.`,
    temporaryPassword
      ? "Use the temporary password provided by your school director, then reset it after signing in."
      : "Use the password reset email from The BEE Suite to set your password.",
    `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/parent-portal`,
  ].join("\n");
  const emailCopy = await sendEmail({
    to: [email],
    subject: "Your The BEE Suite parent portal is ready",
    text: invitationText,
    fromName: "The BEE Suite",
    categories: ["parent_invitation_email"],
    customArgs: { guardianId: guardian.id, familyId: guardian.familyId, centerId: center.id },
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
      authMode: temporaryPassword ? "temporary_password" : "password_reset",
      resetSent: "passwordResetSent" in auth ? auth.passwordResetSent : false,
      emailCopySent: emailCopy.ok,
    },
  });

  return NextResponse.json({
    ok: true,
    guardian: {
      id: updatedGuardian.id,
      fullName: updatedGuardian.fullName,
      email: updatedGuardian.email,
      userId: parentUser.id,
    },
    auth,
    emailCopy,
  });
}
