import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { resolveWorkspaceBranding, type WorkspaceBranding } from "@/lib/brand-assets";
import { isDemoAccountEmail } from "@/lib/demo-accounts";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { defaultProfilePhotoUrlForRole, readProfilePhotoStorageKey, readProfilePhotoUrl } from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
import { createProfilePhotoSignedUrl, isSupabaseStorageConfigured } from "@/lib/supabase-storage";
import { workspaceScopeContext, type WorkspaceScopeContext } from "@/lib/workspace-scope";
import { readCenterLocationTimeZone } from "@/lib/attendance-state";
import {
  effectiveCenterIdsForWorkspace,
  resolveWorkspaceState,
  type WorkspaceSelectionValue,
  type WorkspaceState,
} from "@/lib/workspace-selection";

export const SESSION_COOKIE = "bee_suite_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AppSession = {
  userId: string;
  email: string;
  role: UserRole;
  exp: number;
  sessionVersion?: number;
  deviceSessionId?: string;
  workspaceSelection?: WorkspaceSelectionValue;
};

export type CurrentUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
  mustResetPassword: boolean;
  centerIds: string[];
  authorizedCenterIds?: string[];
  primaryCenterId: string | null;
  assignedClassroomId: string | null;
  deviceSessionId: string | null;
  accessScope: "platform" | "tenant" | "scoped" | "center" | "none";
  accessGrantCount: number;
  profilePhotoUrl: string | null;
  branding: WorkspaceBranding;
  timeZone?: string;
  timeZonesByCenterId?: Record<string, string>;
  scopeContext?: WorkspaceScopeContext;
  workspace?: WorkspaceState;
};

export function requiresPasswordResetGate(user: { mustResetPassword: boolean; role: UserRole }) {
  return user.mustResetPassword && user.role !== UserRole.TEACHER && user.role !== UserRole.PARENT_GUARDIAN;
}

const tenantWideAccessRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.READ_ONLY_AUDITOR,
]);

const executiveTenantWideRoles = new Set<UserRole>([
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
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

export function readSessionVersion(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function sessionMatchesCurrentVersion(
  session: Pick<AppSession, "sessionVersion">,
  currentVersion: unknown,
) {
  return (session.sessionVersion ?? 0) === readSessionVersion(currentVersion);
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

export function createSessionToken(user: Pick<CurrentUser, "id" | "email" | "role"> & {
  sessionVersion?: number;
  deviceSessionId?: string | null;
  workspaceSelection?: WorkspaceSelectionValue | null;
}) {
  const payload: AppSession = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    sessionVersion: readSessionVersion(user.sessionVersion),
    deviceSessionId: user.deviceSessionId ?? undefined,
    workspaceSelection: user.workspaceSelection ?? undefined,
  };
  const data = base64Url(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

async function resolveCurrentUserProfilePhotoUrl(
  customFields: unknown,
  role: UserRole,
  branding: WorkspaceBranding,
) {
  const fallbackUrl = defaultProfilePhotoUrlForRole(role, branding.kind);
  const storageKey = readProfilePhotoStorageKey(customFields);
  if (storageKey && isSupabaseStorageConfigured()) {
    try {
      return await createProfilePhotoSignedUrl(storageKey);
    } catch {
      return readProfilePhotoUrl(customFields) ?? fallbackUrl;
    }
  }
  return readProfilePhotoUrl(customFields) ?? fallbackUrl;
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

async function sessionDeviceIsActive(session: AppSession, tenantId: string) {
  const deviceSessionId = typeof session.deviceSessionId === "string" ? session.deviceSessionId : "";
  if (!deviceSessionId) return true;

  const deviceSession = await prisma.deviceSession.findFirst({
    where: {
      id: deviceSessionId,
      userId: session.userId,
      tenantId,
    },
    select: {
      id: true,
      revokedAt: true,
      lastSeenAt: true,
    },
  });

  if (!deviceSession || deviceSession.revokedAt) return false;

  if (Date.now() - deviceSession.lastSeenAt.getTime() > 60_000) {
    await prisma.deviceSession.updateMany({
      where: { id: deviceSession.id, revokedAt: null },
      data: { lastSeenAt: new Date() },
    }).catch(() => undefined);
  }

  return true;
}

export async function getCurrentUser(options: { allowPasswordResetRequired?: boolean } = {}): Promise<CurrentUser | null> {
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
      tenant: {
        select: { name: true, slug: true },
      },
      organization: {
        select: {
          name: true,
          brand: {
            select: {
              name: true,
              slug: true,
              settings: {
                select: {
                  brandName: true,
                },
              },
            },
          },
        },
      },
      staffProfile: {
        select: {
          centerId: true,
          classroomId: true,
          classroom: { select: { name: true } },
        },
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
  if (!sessionMatchesCurrentVersion(session, user.sessionVersion)) return null;
  if (!(await sessionDeviceIsActive(session, user.tenantId))) return null;
  if (requiresPasswordResetGate(user) && !options.allowPasswordResetRequired) return null;

  const identityBrandName =
    user.organization?.brand?.settings?.brandName ??
    user.organization?.brand?.name ??
    user.organization?.name ??
    user.tenant.name;
  const profileCenterIds = user.staffProfile?.centerId ? [user.staffProfile.centerId] : [];
  const hasProfileCenterAssignment = profileCenterIds.length > 0;
  let centerIds = profileCenterIds;
  let accessScope: CurrentUser["accessScope"] = profileCenterIds.length ? "center" : "none";
  const activeGrants = user.accessGrants as ActiveAccessGrant[];

  if (user.role === UserRole.PLATFORM_OWNER) {
    const allCenters = await prisma.center.findMany({ select: { id: true } });
    centerIds = allCenters.map((center) => center.id);
    accessScope = "platform";
  } else if (executiveTenantWideRoles.has(user.role)) {
    const tenantCenters = await prisma.center.findMany({
      where: { organization: { tenantId: user.tenantId } },
      select: { id: true },
    });
    centerIds = tenantCenters.map((center) => center.id);
    accessScope = "tenant";
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

  centerIds = hasProfileCenterAssignment
    ? [profileCenterIds[0], ...centerIds.filter((centerId) => centerId !== profileCenterIds[0]).sort()]
    : [...centerIds].sort();
  const authorizedCenterIds = [...centerIds];

  const authorizedCenters = authorizedCenterIds.length
    ? await prisma.center.findMany({
        where: { id: { in: authorizedCenterIds } },
        orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          city: true,
          state: true,
          postalCode: true,
          status: true,
          timezone: true,
          customFields: true,
          organization: {
            select: {
              id: true,
              name: true,
              tenantId: true,
              tenant: { select: { name: true, slug: true } },
              brand: {
                select: {
                  name: true,
                  slug: true,
                  settings: { select: { brandName: true } },
                },
              },
            },
          },
        },
      })
    : [];
  const workspace = resolveWorkspaceState({
    role: user.role,
    authorizedCenters: authorizedCenters.map((center) => ({
      id: center.id,
      name: center.crmLocationId ?? center.name,
      detail: [
        user.role === UserRole.PLATFORM_OWNER ? center.organization.tenant.name : null,
        [center.city, center.state].filter(Boolean).join(", "),
      ].filter(Boolean).join(" · ") || "Authorized school",
      companyName: center.organization.tenant.name,
      status: center.status,
    })),
    requestedSelection: session.workspaceSelection,
  });
  const selectableCenterIds = workspace.options.map((center) => center.id);
  centerIds = effectiveCenterIdsForWorkspace(workspace, selectableCenterIds);
  const effectiveCenters = authorizedCenters.filter((center) => centerIds.includes(center.id));
  const timeZonesByCenterId = Object.fromEntries(effectiveCenters.map((center) => [center.id, readCenterLocationTimeZone(center)]));
  const primaryCenter = authorizedCenters.find((center) => center.id === workspace.activeCenterId)
    ?? effectiveCenters.find((center) => center.id === centerIds[0])
    ?? null;
  const selectedPlatformCenter = user.role === UserRole.PLATFORM_OWNER && workspace.activeCenterId
    ? primaryCenter
    : null;
  const effectiveTenant = selectedPlatformCenter?.organization.tenant ?? user.tenant;
  const effectiveOrganizationId = selectedPlatformCenter?.organization.id ?? user.organizationId;
  const effectiveOrganizationName = selectedPlatformCenter?.organization.name ?? user.organization?.name;
  const effectiveBrand = selectedPlatformCenter?.organization.brand ?? user.organization?.brand;
  const effectiveBrandName = effectiveBrand?.settings?.brandName
    ?? effectiveBrand?.name
    ?? effectiveOrganizationName
    ?? identityBrandName;
  const branding = resolveWorkspaceBranding({
    tenantName: effectiveTenant.name,
    tenantSlug: effectiveTenant.slug,
    brandName: effectiveBrandName,
    brandSlug: effectiveBrand?.slug,
    organizationName: effectiveOrganizationName,
    email: user.email,
  });

  return {
    id: user.id,
    tenantId: selectedPlatformCenter?.organization.tenantId ?? user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: effectiveOrganizationId,
    mustResetPassword: user.mustResetPassword,
    centerIds,
    authorizedCenterIds,
    primaryCenterId: centerIds[0] ?? null,
    assignedClassroomId: user.staffProfile?.classroomId ?? null,
    deviceSessionId: session.deviceSessionId ?? null,
    accessScope,
    accessGrantCount: activeGrants.length,
    profilePhotoUrl: await resolveCurrentUserProfilePhotoUrl(user.customFields, user.role, branding),
    branding,
    timeZone: timeZonesByCenterId[centerIds[0] ?? ""] || "America/New_York",
    timeZonesByCenterId,
    scopeContext: workspaceScopeContext({
      role: user.role,
      accessScope,
      centerCount: centerIds.length,
      primaryCenterName: primaryCenter?.crmLocationId ?? primaryCenter?.name,
      classroomName: user.staffProfile?.classroom?.name,
      workspace,
    }),
    workspace,
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
  if (!user) redirect(loginHrefForNextPath("/dashboard"));
  return user;
}

export function canAccessAllCenters(user: Pick<CurrentUser, "role"> & Partial<Pick<CurrentUser, "accessScope" | "workspace">>) {
  if (user.workspace) {
    return user.workspace.mode === "all"
      && (user.accessScope === "platform" || user.accessScope === "tenant")
      && canUseTenantWideAccessRole(user.role);
  }
  if (user.role === UserRole.PLATFORM_OWNER) return true;
  if (user.accessScope) return user.accessScope === "tenant" && canUseTenantWideAccessRole(user.role);
  return tenantWideAccessRoles.has(user.role);
}

export function canAdministerAllCenters(
  user: Pick<CurrentUser, "role" | "centerIds"> & Partial<Pick<CurrentUser, "accessScope" | "authorizedCenterIds">> & {
    workspace?: { mode?: WorkspaceState["mode"] };
  },
) {
  const hasTenantAuthority = (user.accessScope === "platform" || user.accessScope === "tenant")
    && canUseTenantWideAccessRole(user.role);
  if (!hasTenantAuthority) return false;
  if (!user.workspace) return true;
  return user.workspace.mode === "all" || user.workspace.mode === "fixed";
}

export function messageCenterIdsForUser(
  user: Pick<CurrentUser, "role" | "centerIds" | "primaryCenterId">,
) {
  if (user.role !== UserRole.CENTER_DIRECTOR && user.role !== UserRole.ASSISTANT_DIRECTOR) {
    return user.centerIds;
  }
  return user.primaryCenterId && user.centerIds.includes(user.primaryCenterId)
    ? [user.primaryCenterId]
    : [];
}

export function getLeadScopeWhere(user: CurrentUser) {
  if (user.role === UserRole.PLATFORM_OWNER && canAccessAllCenters(user)) return {};
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

export function deriveClassroomOfflineQueueCredentials(user: Pick<CurrentUser, "id" | "tenantId" | "assignedClassroomId">) {
  const scope = `${user.tenantId}:${user.id}:${user.assignedClassroomId ?? "unassigned"}`;
  const key = createHmac("sha256", getAuthSecret()).update(`classroom-offline-key:${scope}`).digest("base64url");
  const scopeId = createHmac("sha256", getAuthSecret()).update(`classroom-offline-scope:${scope}`).digest("hex").slice(0, 24);
  return { key, scopeId };
}

export function getDashboardCenterScopeWhere(user: CurrentUser) {
  if (user.role === UserRole.CENTER_DIRECTOR || user.role === UserRole.ASSISTANT_DIRECTOR) {
    return user.primaryCenterId
      ? { id: user.primaryCenterId }
      : { id: "__no_authorized_center__" };
  }

  return getLeadScopeWhere(user);
}

export function canAccessCenter(user: Pick<CurrentUser, "role" | "accessScope" | "centerIds"> & Partial<Pick<CurrentUser, "workspace">>, centerId: string) {
  if (user.workspace) return user.centerIds.includes(centerId);
  return (
    user.role === UserRole.PLATFORM_OWNER ||
    (user.accessScope === "tenant" && canUseTenantWideAccessRole(user.role)) ||
    user.centerIds.includes(centerId)
  );
}

export function canAdministerCenter(
  user: Pick<CurrentUser, "centerIds"> & Partial<Pick<CurrentUser, "authorizedCenterIds">> & {
    workspace?: { mode?: WorkspaceState["mode"] };
  },
  centerId: string,
) {
  if (user.workspace?.mode === "center" || user.workspace?.mode === "fixed") {
    return user.centerIds.includes(centerId);
  }
  return (user.authorizedCenterIds ?? user.centerIds).includes(centerId);
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

export function canManageStaffCompensation(user: Pick<CurrentUser, "role">) {
  return operationsWriteRoles.has(user.role);
}

export function canManageClassroomTasks(user: Pick<CurrentUser, "role">) {
  return teacherWriteRoles.has(user.role);
}

export function canManageChildInClassroom(
  user: Pick<CurrentUser, "role"> & Partial<Pick<CurrentUser, "assignedClassroomId">>,
  classroomId: string | null | undefined,
) {
  if (user.role !== UserRole.TEACHER) return true;
  return Boolean(classroomId && user.assignedClassroomId === classroomId);
}

export function canManageBilling(user: Pick<CurrentUser, "role">) {
  return billingWriteRoles.has(user.role);
}

export function canViewDemoFallbackData(user: Partial<Pick<CurrentUser, "email" | "role">>) {
  return isDemoAccountEmail(user.email);
}

export function isParentGuardian(user: Pick<CurrentUser, "role">) {
  return user.role === UserRole.PARENT_GUARDIAN;
}
