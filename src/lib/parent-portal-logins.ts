import { UserRole } from "@prisma/client";
import {
  getParentPortalDefaultPassword,
  PARENT_PORTAL_INVITE_MODE,
} from "@/lib/parent-portal-invitations";
import { prisma } from "@/lib/prisma";
import {
  supabaseAuthUserExistsByEmail,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

type ParentPortalLoginResult =
  | { ok: true; userId: string; linkedGuardianIds: string[] }
  | { ok: false; reason: string };

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isDefaultParentPortalPassword(password: string) {
  const defaultPassword = getParentPortalDefaultPassword();
  return defaultPassword.length >= 8 && password === defaultPassword;
}

export async function ensureParentPortalDefaultLoginForEmail({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<ParentPortalLoginResult> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !isDefaultParentPortalPassword(password)) {
    return { ok: false, reason: "not_default_parent_login" };
  }

  const existingAuthUser = await supabaseAuthUserExistsByEmail(normalizedEmail);
  if (existingAuthUser) {
    return { ok: false, reason: "auth_user_exists" };
  }

  const guardians = await prisma.guardian.findMany({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
      family: { centerId: { not: null } },
    },
    include: {
      family: {
        select: { id: true, name: true, centerId: true },
      },
    },
    orderBy: { fullName: "asc" },
  });
  if (!guardians.length) {
    return { ok: false, reason: "guardian_not_found" };
  }

  const centerIds = Array.from(new Set(guardians.map((guardian) => guardian.family.centerId).filter((value): value is string => Boolean(value))));
  const centers = await prisma.center.findMany({
    where: { id: { in: centerIds } },
    select: {
      id: true,
      organizationId: true,
      organization: {
        select: { tenantId: true },
      },
    },
  });
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const linkedGuardians = guardians
    .map((guardian) => {
      const center = guardian.family.centerId ? centerById.get(guardian.family.centerId) : null;
      return center ? { guardian, center } : null;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (!linkedGuardians.length) {
    return { ok: false, reason: "center_not_found" };
  }

  const tenantIds = Array.from(new Set(linkedGuardians.map(({ center }) => center.organization.tenantId)));
  if (tenantIds.length !== 1) {
    return { ok: false, reason: "guardian_email_ambiguous" };
  }

  const primary = linkedGuardians[0];
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, tenantId: true, role: true },
  });
  if (existingUser && existingUser.tenantId !== primary.center.organization.tenantId) {
    return { ok: false, reason: "user_tenant_mismatch" };
  }
  if (existingUser && existingUser.role !== UserRole.PARENT_GUARDIAN) {
    return { ok: false, reason: "non_parent_user_exists" };
  }

  const auth = await upsertSupabaseAuthUserWithPassword({
    email: normalizedEmail,
    name: primary.guardian.fullName,
    password,
    role: UserRole.PARENT_GUARDIAN,
    source: PARENT_PORTAL_INVITE_MODE,
    updateExistingPassword: false,
  });
  if ("alreadyExisted" in auth && auth.alreadyExisted) {
    return { ok: false, reason: "auth_user_exists" };
  }

  const parentUser = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      name: primary.guardian.fullName,
      role: UserRole.PARENT_GUARDIAN,
      isActive: true,
      organizationId: primary.center.organizationId,
      mustResetPassword: false,
      sessionVersion: { increment: 1 },
    },
    create: {
      tenantId: primary.center.organization.tenantId,
      organizationId: primary.center.organizationId,
      email: normalizedEmail,
      name: primary.guardian.fullName,
      role: UserRole.PARENT_GUARDIAN,
      isActive: true,
      mustResetPassword: false,
    },
    select: { id: true },
  });

  const now = new Date().toISOString();
  await Promise.all(linkedGuardians.map(({ guardian }) => prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      userId: parentUser.id,
      customFields: {
        ...asRecord(guardian.customFields),
        parentPortal: {
          ...asRecord(asRecord(guardian.customFields).parentPortal),
          linkedAt: now,
          linkedBy: "default_parent_login",
          inviteMode: PARENT_PORTAL_INVITE_MODE,
          loginEmail: normalizedEmail,
        },
      },
    },
  })));

  return {
    ok: true,
    userId: parentUser.id,
    linkedGuardianIds: linkedGuardians.map(({ guardian }) => guardian.id),
  };
}
