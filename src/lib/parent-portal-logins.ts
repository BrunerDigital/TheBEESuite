import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { isEmail } from "@/lib/integrations";
import { DEFAULT_PARENT_INITIAL_PASSWORD, PARENT_PORTAL_INVITE_MODE } from "@/lib/parent-portal-invitations";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

type ParentPortalProvisionResult =
  | {
      ok: true;
      userId: string;
      linkedGuardianIds: string[];
      created: boolean;
      reactivated: boolean;
      credentialCreated: boolean;
    }
  | { ok: false; reason: string; status?: number };

type ParentPortalDisableResult =
  | {
      ok: true;
      unlinkedUserId: string | null;
      deactivatedUser: boolean;
    }
  | { ok: false; reason: string; status?: number };

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function parentPortalAccessDisabled(customFields: unknown) {
  const parentPortal = asRecord(asRecord(customFields).parentPortal);
  return parentPortal.accessDisabled === true || parentPortal.loginEnabled === false;
}

export function parentPortalAccessFields({
  customFields,
  enabled,
  actorEmail,
}: {
  customFields: unknown;
  enabled: boolean;
  actorEmail?: string | null;
}) {
  const fields = asRecord(customFields);
  const parentPortal = asRecord(fields.parentPortal);
  const now = new Date().toISOString();
  return {
    ...fields,
    parentPortal: {
      ...parentPortal,
      loginEnabled: enabled,
      accessDisabled: !enabled,
      accessUpdatedAt: now,
      accessUpdatedBy: actorEmail || null,
    },
  } as Prisma.InputJsonObject;
}

export function parentPortalLinkedFields({
  customFields,
  loginEmail,
  linkedBy,
  linkedReason = "default_parent_portal_access",
  registrationApproval = false,
}: {
  customFields: unknown;
  loginEmail: string;
  linkedBy?: string | null;
  linkedReason?: string;
  registrationApproval?: boolean;
}) {
  const fields = asRecord(customFields);
  const parentPortal = asRecord(fields.parentPortal);
  return {
    ...fields,
    parentPortal: {
      ...parentPortal,
      loginEnabled: true,
      accessDisabled: false,
      linkedAt: new Date().toISOString(),
      linkedBy: linkedBy || linkedReason,
      inviteMode: PARENT_PORTAL_INVITE_MODE,
      loginEmail,
      registrationApproval: registrationApproval || parentPortal.registrationApproval === true,
    },
  } as Prisma.InputJsonObject;
}

export async function ensureParentPortalLoginForGuardian({
  guardianId,
  linkedBy,
  linkedReason,
  registrationApproval = false,
  resetToInitialPassword = false,
}: {
  guardianId: string;
  linkedBy?: string | null;
  linkedReason?: string;
  registrationApproval?: boolean;
  resetToInitialPassword?: boolean;
}): Promise<ParentPortalProvisionResult> {
  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: {
      family: {
        select: {
          id: true,
          centerId: true,
        },
      },
    },
  });
  if (!guardian) return { ok: false, status: 404, reason: "guardian_not_found" };
  if (parentPortalAccessDisabled(guardian.customFields)) return { ok: false, status: 200, reason: "parent_portal_disabled" };

  const email = normalizeEmail(guardian.email ?? "");
  if (!isEmail(email)) return { ok: false, status: 400, reason: "guardian_email_invalid" };
  const center = guardian.family.centerId
    ? await prisma.center.findUnique({
        where: { id: guardian.family.centerId },
        select: {
          id: true,
          organizationId: true,
          organization: { select: { tenantId: true } },
        },
      })
    : null;
  if (!guardian.family.centerId || !center) return { ok: false, status: 400, reason: "center_not_found" };

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true, role: true, isActive: true },
  });
  if (existingUser && existingUser.tenantId !== center.organization.tenantId) {
    return { ok: false, status: 409, reason: "user_tenant_mismatch" };
  }
  if (existingUser && existingUser.role !== UserRole.PARENT_GUARDIAN) {
    return { ok: false, status: 409, reason: "non_parent_user_exists" };
  }

  const authUser = await upsertSupabaseAuthUserWithPassword({
    email,
    name: guardian.fullName,
    password: DEFAULT_PARENT_INITIAL_PASSWORD,
    role: UserRole.PARENT_GUARDIAN,
    source: PARENT_PORTAL_INVITE_MODE,
    updateExistingPassword: resetToInitialPassword,
  });
  const credentialCreated = !("alreadyExisted" in authUser && authUser.alreadyExisted);

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
    select: { id: true },
  });

  const tenantCenters = await prisma.center.findMany({
    where: { organization: { tenantId: center.organization.tenantId } },
    select: { id: true },
  });
  const tenantCenterIds = tenantCenters.map((item) => item.id);
  const matchingGuardians = await prisma.guardian.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      family: { centerId: { in: tenantCenterIds } },
    },
    select: { id: true, customFields: true },
  });
  const linkableGuardians = matchingGuardians.filter((item) => !parentPortalAccessDisabled(item.customFields));

  await Promise.all(linkableGuardians.map((item) => prisma.guardian.update({
    where: { id: item.id },
    data: {
      userId: parentUser.id,
      customFields: parentPortalLinkedFields({
        customFields: item.customFields,
        loginEmail: email,
        linkedBy,
        linkedReason,
        registrationApproval,
      }),
    },
  })));

  return {
    ok: true,
    userId: parentUser.id,
    linkedGuardianIds: linkableGuardians.map((item) => item.id),
    created: !existingUser,
    reactivated: Boolean(existingUser && !existingUser.isActive),
    credentialCreated,
  };
}

export async function disableParentPortalLoginForGuardian({
  guardianId,
  actorEmail,
  previousUserId,
}: {
  guardianId: string;
  actorEmail?: string | null;
  previousUserId?: string | null;
}): Promise<ParentPortalDisableResult> {
  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    select: { id: true, userId: true, customFields: true },
  });
  if (!guardian) return { ok: false, status: 404, reason: "guardian_not_found" };

  const linkedUserId = previousUserId ?? guardian.userId;
  await prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      userId: null,
      customFields: parentPortalAccessFields({
        customFields: guardian.customFields,
        enabled: false,
        actorEmail,
      }),
    },
  });

  let deactivatedUser = false;
  if (linkedUserId) {
    const remainingLinkedGuardians = await prisma.guardian.findMany({
      where: { userId: linkedUserId },
      select: { customFields: true },
    });
    const hasEnabledGuardian = remainingLinkedGuardians.some((item) => !parentPortalAccessDisabled(item.customFields));
    if (!hasEnabledGuardian) {
      const update = await prisma.user.updateMany({
        where: {
          id: linkedUserId,
          role: UserRole.PARENT_GUARDIAN,
        },
        data: {
          isActive: false,
          sessionVersion: { increment: 1 },
        },
      });
      deactivatedUser = update.count > 0;
    }
  }

  return { ok: true, unlinkedUserId: linkedUserId ?? null, deactivatedUser };
}

