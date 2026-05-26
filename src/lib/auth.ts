import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "bee_suite_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AppSession = {
  userId: string;
  email: string;
  role: UserRole;
  exp: number;
};

export type CurrentUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
  centerIds: string[];
  primaryCenterId: string | null;
  accessScope: "platform" | "tenant" | "scoped" | "center" | "none";
  accessGrantCount: number;
};

const tenantWideAccessRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.READ_ONLY_AUDITOR,
]);

const leadWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
]);

const leadReadRoles = new Set<UserRole>([
  ...leadWriteRoles,
  UserRole.READ_ONLY_AUDITOR,
]);

const operationsWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

const teacherWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.TEACHER,
]);

const billingWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
]);

const executiveDemoRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

const executiveDemoEmails = new Set([
  "brenden@kidcityusa.com",
  "marie@kidcityusa.com",
  "audrey@kidcityusa.com",
  "kayleen@kidcityusa.com",
]);

type ActiveAccessGrant = {
  tenantId: string;
  brandId: string | null;
  organizationId: string | null;
  ownerGroupId: string | null;
  centerId: string | null;
  scopeType: string;
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function canUseTenantWideAccessRole(role: UserRole) {
  return tenantWideAccessRoles.has(role);
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-only-bee-suite-auth-secret";
  throw new Error("AUTH_SECRET is required in production.");
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(input: string) {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function sign(data: string) {
  return base64Url(createHmac("sha256", getAuthSecret()).update(data).digest());
}

function verifySignature(data: string, signature: string) {
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken(user: Pick<CurrentUser, "id" | "email" | "role">) {
  const payload: AppSession = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const data = base64Url(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token?: string) {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature || !verifySignature(data, signature)) return null;

  try {
    const session = JSON.parse(fromBase64Url(data)) as AppSession;
    if (!session.userId || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;
  const now = new Date();

  const user = await prisma.user.findFirst({
    where: {
      id: session.userId,
      email: session.email,
      isActive: true,
    },
    include: {
      staffProfile: {
        select: { centerId: true },
      },
      accessGrants: {
        where: {
          isActive: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
        select: {
          tenantId: true,
          brandId: true,
          organizationId: true,
          ownerGroupId: true,
          centerId: true,
          scopeType: true,
        },
      },
    },
  });

  if (!user) return null;

  const profileCenterIds = user.staffProfile?.centerId ? [user.staffProfile.centerId] : [];
  const hasProfileCenterAssignment = profileCenterIds.length > 0;
  let centerIds = profileCenterIds;
  let accessScope: CurrentUser["accessScope"] = profileCenterIds.length ? "center" : "none";
  const activeGrants = user.accessGrants as ActiveAccessGrant[];

  if (user.role === UserRole.PLATFORM_OWNER) {
    const allCenters = await prisma.center.findMany({ select: { id: true } });
    centerIds = allCenters.map((center) => center.id);
    accessScope = "platform";
  } else if (activeGrants.length) {
    const allowBroadGrantAccess = canUseTenantWideAccessRole(user.role) && !hasProfileCenterAssignment;
    const grantCenterIds = await resolveAccessGrantCenterIds(user.tenantId, activeGrants, user.role, {
      allowBroadGrantAccess,
    });
    const hasAllowedTenantGrant =
      allowBroadGrantAccess &&
      activeGrants.some((grant) => grant.scopeType === "TENANT" && grant.tenantId === user.tenantId);
    centerIds = unique([...profileCenterIds, ...grantCenterIds]);
    accessScope = hasAllowedTenantGrant ? "tenant" : centerIds.length ? "scoped" : "none";
  } else if (tenantWideAccessRoles.has(user.role) && !hasProfileCenterAssignment) {
    const tenantCenters = await prisma.center.findMany({
      where: { organization: { tenantId: user.tenantId } },
      select: { id: true },
    });
    centerIds = tenantCenters.map((center) => center.id);
    accessScope = "tenant";
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    centerIds,
    primaryCenterId: centerIds[0] ?? null,
    accessScope,
    accessGrantCount: activeGrants.length,
  };
}

async function resolveAccessGrantCenterIds(
  tenantId: string,
  grants: ActiveAccessGrant[],
  role: UserRole,
  options: { allowBroadGrantAccess?: boolean } = {},
) {
  const usableGrants = options.allowBroadGrantAccess
    ? grants
    : grants.filter((grant) => grant.scopeType === "CENTER" || Boolean(grant.centerId));

  if (
    options.allowBroadGrantAccess &&
    canUseTenantWideAccessRole(role) &&
    usableGrants.some((grant) => grant.scopeType === "TENANT" && grant.tenantId === tenantId)
  ) {
    const tenantCenters = await prisma.center.findMany({
      where: { organization: { tenantId } },
      select: { id: true },
    });
    return tenantCenters.map((center) => center.id);
  }

  const centerIds = unique(
    usableGrants
      .filter((grant) => grant.scopeType === "CENTER" && grant.centerId)
      .map((grant) => grant.centerId as string),
  );
  const ownerGroupIds = unique(
    usableGrants
      .filter((grant) => grant.scopeType === "OWNER_GROUP" && grant.ownerGroupId)
      .map((grant) => grant.ownerGroupId as string),
  );
  const organizationIds = unique(
    usableGrants
      .filter((grant) => grant.scopeType === "ORGANIZATION" && grant.organizationId)
      .map((grant) => grant.organizationId as string),
  );
  const brandIds = unique(
    usableGrants
      .filter((grant) => grant.scopeType === "BRAND" && grant.brandId)
      .map((grant) => grant.brandId as string),
  );
  const ors = [
    centerIds.length ? { id: { in: centerIds }, organization: { tenantId } } : null,
    ownerGroupIds.length ? { ownerGroupId: { in: ownerGroupIds }, organization: { tenantId } } : null,
    organizationIds.length ? { organizationId: { in: organizationIds }, organization: { tenantId } } : null,
    brandIds.length ? { organization: { tenantId, brandId: { in: brandIds } } } : null,
  ].filter((where): where is NonNullable<typeof where> => Boolean(where));

  if (!ors.length) return [];
  const centers = await prisma.center.findMany({
    where: { OR: ors },
    select: { id: true },
  });
  return centers.map((center) => center.id);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function canAccessAllCenters(user: Pick<CurrentUser, "role"> & Partial<Pick<CurrentUser, "accessScope">>) {
  if (user.role === UserRole.PLATFORM_OWNER) return true;
  if (user.accessScope) return user.accessScope === "tenant" && canUseTenantWideAccessRole(user.role);
  return tenantWideAccessRoles.has(user.role);
}

export function getLeadScopeWhere(user: CurrentUser) {
  if (user.role === UserRole.PLATFORM_OWNER) return {};
  if (canAccessAllCenters(user)) {
    return {
      organization: {
        tenantId: user.tenantId,
      },
    };
  }
  if (!user.centerIds.length) return { id: "__no_authorized_center__" };
  return { id: { in: user.centerIds } };
}

export function canAccessCenter(user: CurrentUser, centerId: string) {
  return (
    user.role === UserRole.PLATFORM_OWNER ||
    (user.accessScope === "tenant" && canUseTenantWideAccessRole(user.role)) ||
    user.centerIds.includes(centerId)
  );
}

export function canManageCrmLeads(user: Pick<CurrentUser, "role">) {
  return leadWriteRoles.has(user.role);
}

export function canViewCrmLeads(user: Pick<CurrentUser, "role">) {
  return leadReadRoles.has(user.role);
}

export function canManageOperations(user: Pick<CurrentUser, "role">) {
  return operationsWriteRoles.has(user.role);
}

export function canManageClassroomTasks(user: Pick<CurrentUser, "role">) {
  return teacherWriteRoles.has(user.role);
}

export function canManageBilling(user: Pick<CurrentUser, "role">) {
  return billingWriteRoles.has(user.role);
}

export function canViewExecutiveDemoData(user: Pick<CurrentUser, "role"> & Partial<Pick<CurrentUser, "email">>) {
  return executiveDemoRoles.has(user.role) || executiveDemoEmails.has(user.email?.toLowerCase() ?? "");
}

export function isParentGuardian(user: Pick<CurrentUser, "role">) {
  return user.role === UserRole.PARENT_GUARDIAN;
}
