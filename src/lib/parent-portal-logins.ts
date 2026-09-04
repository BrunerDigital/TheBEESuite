import { randomBytes } from "node:crypto";
import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { DEFAULT_PARENT_INITIAL_PASSWORD, PARENT_PORTAL_INVITE_MODE } from "@/lib/parent-portal-invitations";
import { prisma } from "@/lib/prisma";
import {
  isSupabaseAuthCompatibleEmail,
  updateSupabaseAuthUserEmailByCurrentEmail,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

type ParentPortalProvisionResult =
  | {
      ok: true;
      userId: string;
      linkedGuardianIds: string[];
      created: boolean;
      reactivated: boolean;
      credentialCreated: boolean;
      requiresSetupLink: boolean;
    }
  | { ok: false; reason: string; status?: number };

type ParentPortalDisableResult =
  | {
      ok: true;
      unlinkedUserId: string | null;
      deactivatedUser: boolean;
    }
  | { ok: false; reason: string; status?: number };

type ParentPortalEmailChangeResult =
  | { ok: true; userId: string; previousEmail: string; newEmail: string; updatedGuardianIds: string[] }
  | { ok: false; reason: string; status?: number };

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hasConflictingGuardianFamilyLinks(
  targetFamilyId: string,
  matches: Array<{ familyId: string }>,
) {
  return matches.some((match) => match.familyId !== targetFamilyId);
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
  inviteMode = PARENT_PORTAL_INVITE_MODE,
  preparedWithoutInvite = false,
}: {
  customFields: unknown;
  loginEmail: string;
  linkedBy?: string | null;
  linkedReason?: string;
  registrationApproval?: boolean;
  inviteMode?: string;
  preparedWithoutInvite?: boolean;
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
      inviteMode,
      loginEmail,
      registrationApproval: registrationApproval || parentPortal.registrationApproval === true,
      ...(preparedWithoutInvite
        ? {
            preparedWithoutInvite: true,
            preparedWithoutInviteAt: new Date().toISOString(),
          }
        : {}),
    },
  } as Prisma.InputJsonObject;
}

export function parentPortalInvitationSentFields(customFields: unknown) {
  const fields = asRecord(customFields);
  const parentPortal = asRecord(fields.parentPortal);
  return {
    ...fields,
    parentPortal: {
      ...parentPortal,
      preparedWithoutInvite: false,
      invitationSentAt: new Date().toISOString(),
    },
  } as Prisma.InputJsonObject;
}

export async function ensureParentPortalLoginForGuardian({
  guardianId,
  linkedBy,
  linkedReason,
  registrationApproval = false,
  resetToInitialPassword = false,
  randomizeNewCredential = false,
  inviteMode = PARENT_PORTAL_INVITE_MODE,
  prepareWithoutInvite = false,
}: {
  guardianId: string;
  linkedBy?: string | null;
  linkedReason?: string;
  registrationApproval?: boolean;
  resetToInitialPassword?: boolean;
  randomizeNewCredential?: boolean;
  inviteMode?: string;
  prepareWithoutInvite?: boolean;
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
  if (!isSupabaseAuthCompatibleEmail(email)) return { ok: false, status: 400, reason: "guardian_email_invalid" };
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
    select: { id: true, familyId: true, userId: true, customFields: true },
  });
  if (hasConflictingGuardianFamilyLinks(guardian.family.id, matchingGuardians)) {
    return { ok: false, status: 409, reason: "guardian_email_multiple_families" };
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, tenantId: true, role: true, isActive: true, mustResetPassword: true },
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
    password: prepareWithoutInvite || randomizeNewCredential
      ? randomBytes(48).toString("base64url")
      : DEFAULT_PARENT_INITIAL_PASSWORD,
    role: UserRole.PARENT_GUARDIAN,
    source: PARENT_PORTAL_INVITE_MODE,
    updateExistingPassword: resetToInitialPassword || (randomizeNewCredential && !existingUser),
  });
  const credentialCreated = !("alreadyExisted" in authUser && authUser.alreadyExisted);
  const requiresSetupLink = prepareWithoutInvite
    || (randomizeNewCredential && credentialCreated)
    || Boolean(existingUser?.mustResetPassword && !resetToInitialPassword);

  const parentUser = existingUser
    ? await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        email,
        name: guardian.fullName,
        role: UserRole.PARENT_GUARDIAN,
        isActive: true,
        organizationId: center.organizationId,
        mustResetPassword: requiresSetupLink,
        sessionVersion: { increment: 1 },
      },
      select: { id: true },
    })
    : await prisma.user.create({
      data: {
        tenantId: center.organization.tenantId,
        organizationId: center.organizationId,
        email,
        name: guardian.fullName,
        role: UserRole.PARENT_GUARDIAN,
        isActive: true,
        mustResetPassword: requiresSetupLink,
      },
      select: { id: true },
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
        inviteMode,
        preparedWithoutInvite: prepareWithoutInvite,
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
    requiresSetupLink,
  };
}

export async function changeParentPortalLoginEmail({
  guardianId,
  newEmail,
  actorEmail,
  allowedCenterIds,
}: {
  guardianId: string;
  newEmail: string;
  actorEmail?: string | null;
  allowedCenterIds: string[];
}): Promise<ParentPortalEmailChangeResult> {
  const normalizedNewEmail = normalizeEmail(newEmail);
  if (!isSupabaseAuthCompatibleEmail(normalizedNewEmail)) {
    return { ok: false, status: 400, reason: "guardian_email_invalid" };
  }
  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    select: {
      id: true,
      familyId: true,
      email: true,
      userId: true,
      family: {
        select: {
          billingEmail: true,
          centerId: true,
        },
      },
    },
  });
  if (!guardian?.userId) return { ok: false, status: 409, reason: "parent_portal_login_not_linked" };
  const [parentUser, familyCenter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: guardian.userId },
      select: { id: true, tenantId: true, role: true, email: true },
    }),
    guardian.family.centerId
      ? prisma.center.findUnique({
          where: { id: guardian.family.centerId },
          select: { organization: { select: { tenantId: true } } },
        })
      : null,
  ]);
  if (!parentUser || parentUser.role !== UserRole.PARENT_GUARDIAN) {
    return { ok: false, status: 409, reason: "linked_parent_user_not_found" };
  }
  if (!familyCenter || parentUser.tenantId !== familyCenter.organization.tenantId) {
    return { ok: false, status: 409, reason: "user_tenant_mismatch" };
  }
  const previousEmail = normalizeEmail(parentUser.email || guardian.email || "");
  if (!isSupabaseAuthCompatibleEmail(previousEmail)) {
    return { ok: false, status: 409, reason: "existing_parent_login_email_invalid" };
  }
  if (previousEmail === normalizedNewEmail) {
    return { ok: true, userId: parentUser.id, previousEmail, newEmail: normalizedNewEmail, updatedGuardianIds: [guardian.id] };
  }

  const [conflictingUser, tenantCenters, linkedGuardians] = await Promise.all([
    prisma.user.findFirst({
      where: { email: { equals: normalizedNewEmail, mode: "insensitive" }, id: { not: parentUser.id } },
      select: { id: true },
    }),
    prisma.center.findMany({
      where: { organization: { tenantId: parentUser.tenantId } },
      select: { id: true },
    }),
    prisma.guardian.findMany({
      where: { userId: parentUser.id },
      select: {
        id: true,
        familyId: true,
        customFields: true,
        family: { select: { centerId: true, billingEmail: true } },
      },
    }),
  ]);
  if (conflictingUser) return { ok: false, status: 409, reason: "new_email_already_in_use" };
  const tenantCenterIds = new Set(tenantCenters.map((item) => item.id));
  if (linkedGuardians.some((item) => !item.family.centerId || !tenantCenterIds.has(item.family.centerId))) {
    return { ok: false, status: 409, reason: "linked_guardian_tenant_mismatch" };
  }
  const allowedCenterIdSet = new Set(allowedCenterIds);
  if (linkedGuardians.some((item) => !item.family.centerId || !allowedCenterIdSet.has(item.family.centerId))) {
    return { ok: false, status: 403, reason: "linked_guardian_scope_mismatch" };
  }
  const conflictingGuardian = await prisma.guardian.findFirst({
    where: {
      email: { equals: normalizedNewEmail, mode: "insensitive" },
      id: { notIn: linkedGuardians.map((item) => item.id) },
      family: { centerId: { in: [...tenantCenterIds] } },
    },
    select: { id: true },
  });
  if (conflictingGuardian) return { ok: false, status: 409, reason: "new_email_already_in_use" };

  const authChange = await updateSupabaseAuthUserEmailByCurrentEmail({ currentEmail: previousEmail, newEmail: normalizedNewEmail });
  if (!authChange.ok) return { ok: false, status: 502, reason: authChange.error };

  try {
    await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.updateMany({
        where: { id: parentUser.id, email: { equals: previousEmail, mode: "insensitive" } },
        data: { email: normalizedNewEmail, sessionVersion: { increment: 1 } },
      });
      if (updatedUser.count !== 1) throw new Error("The parent login changed before the email update completed.");
      for (const linkedGuardian of linkedGuardians) {
        await tx.guardian.update({
          where: { id: linkedGuardian.id },
          data: {
            email: normalizedNewEmail,
            customFields: parentPortalLinkedFields({
              customFields: linkedGuardian.customFields,
              loginEmail: normalizedNewEmail,
              linkedBy: actorEmail,
              linkedReason: "parent_portal_email_change",
            }),
          },
        });
      }
      const billingFamilyIds = [...new Set(linkedGuardians.flatMap((item) => (
        item.family.billingEmail?.trim().toLowerCase() === previousEmail ? [item.familyId] : []
      )))];
      if (billingFamilyIds.length) {
        await tx.family.updateMany({ where: { id: { in: billingFamilyIds } }, data: { billingEmail: normalizedNewEmail } });
      }
    });
  } catch (error) {
    const rollback = await updateSupabaseAuthUserEmailByCurrentEmail({
      currentEmail: normalizedNewEmail,
      newEmail: previousEmail,
      metadataSource: "parent_portal_email_change_rollback",
    });
    if (!rollback.ok) throw new Error(`Parent email update failed and Auth rollback also failed: ${rollback.error}`);
    throw error;
  }

  return {
    ok: true,
    userId: parentUser.id,
    previousEmail,
    newEmail: normalizedNewEmail,
    updatedGuardianIds: linkedGuardians.map((item) => item.id),
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

