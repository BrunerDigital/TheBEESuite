import { UserRole, type Prisma } from "@prisma/client";
import { roleLabel } from "@/lib/notification-preferences";

export type TeamPermissionsScope = {
  tenantId: string;
  tenantWide: boolean;
  visibleCenterIds: string[];
  at: Date;
};

/** One visibility boundary for directory rows, nested grants, and device actions. */
export function teamAccessGrantWhere(scope: TeamPermissionsScope): Prisma.UserAccessGrantWhereInput {
  return {
    tenantId: scope.tenantId,
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: scope.at } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: scope.at } }] },
      { OR: scope.tenantWide ? [
        { scopeType: "TENANT" },
        { scopeType: "BRAND", brand: { tenantId: scope.tenantId } },
        { scopeType: "ORGANIZATION", organization: { tenantId: scope.tenantId } },
        { scopeType: "OWNER_GROUP", ownerGroup: { tenantId: scope.tenantId } },
        { scopeType: "CENTER", center: { organization: { tenantId: scope.tenantId } } },
      ] : [
        { scopeType: "CENTER", centerId: { in: scope.visibleCenterIds }, center: { organization: { tenantId: scope.tenantId } } },
        { scopeType: "OWNER_GROUP", ownerGroup: { tenantId: scope.tenantId, centers: { some: { organization: { tenantId: scope.tenantId }, id: { in: scope.visibleCenterIds } } } } },
      ] },
    ],
  };
}

export function teamStaffProfileWhere(scope: TeamPermissionsScope): Prisma.StaffProfileWhereInput {
  return {
    center: { organization: { tenantId: scope.tenantId } },
    ...(scope.tenantWide ? {} : { centerId: { in: scope.visibleCenterIds } }),
  };
}

export function teamUserWhere(scope: TeamPermissionsScope): Prisma.UserWhereInput {
  return {
    tenantId: scope.tenantId,
    ...(scope.tenantWide ? {} : { OR: [
      { staffProfile: { centerId: { in: scope.visibleCenterIds }, center: { organization: { tenantId: scope.tenantId } } } },
      { accessGrants: { some: teamAccessGrantWhere(scope) } },
    ] }),
  };
}

export function teamDeviceSessionWhere(scope: TeamPermissionsScope): Prisma.DeviceSessionWhereInput {
  return { tenantId: scope.tenantId, user: { is: teamUserWhere(scope) } };
}

export function normalizeTeamSearch(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export function searchedTeamUserWhere(scope: TeamPermissionsScope, value: unknown): Prisma.UserWhereInput {
  const query = normalizeTeamSearch(value);
  const authorized = teamUserWhere(scope);
  if (!query) return authorized;
  const matchingRoles = Object.values(UserRole).filter((role) =>
    `${role.replaceAll("_", " ")} ${roleLabel(role)}`.toLowerCase().includes(query.toLowerCase()));
  return { AND: [authorized, { OR: [
    { name: { contains: query, mode: "insensitive" } },
    { email: { contains: query, mode: "insensitive" } },
    ...(matchingRoles.length ? [{ role: { in: matchingRoles } }] : []),
  ] }] };
}
