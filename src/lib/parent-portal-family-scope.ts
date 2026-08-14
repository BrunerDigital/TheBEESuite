import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";

export type ParentPortalFamilyScope =
  | { ok: true; familyId: string; guardianIds: string[] }
  | { ok: false; reason: "no_linked_family" | "multiple_linked_families" | "requested_family_not_linked"; familyIds: string[] };

export function resolveParentPortalFamilyScope(
  guardians: Array<{ id: string; familyId: string; currentChildCount?: number }>,
  requestedFamilyId?: string | null,
): ParentPortalFamilyScope {
  const currentFamilyIds = Array.from(new Set(
    guardians
      .filter((guardian) => (guardian.currentChildCount ?? 0) > 0)
      .map((guardian) => guardian.familyId),
  ));
  const familyIds = currentFamilyIds.length > 0
    ? currentFamilyIds
    : Array.from(new Set(guardians.map((guardian) => guardian.familyId)));
  const selectedFamilyId = requestedFamilyId
    ? familyIds.includes(requestedFamilyId) ? requestedFamilyId : null
    : familyIds.length === 1 ? familyIds[0] : null;
  if (!selectedFamilyId) {
    return {
      ok: false,
      reason: requestedFamilyId && familyIds.length
        ? "requested_family_not_linked"
        : familyIds.length ? "multiple_linked_families" : "no_linked_family",
      familyIds,
    };
  }
  return {
    ok: true,
    familyId: selectedFamilyId,
    guardianIds: guardians
      .filter((guardian) => guardian.familyId === selectedFamilyId)
      .map((guardian) => guardian.id),
  };
}

export async function getParentPortalTenantCenterIds(tenantId: string) {
  return (await prisma.center.findMany({
    where: { organization: { tenantId } },
    select: { id: true },
  })).map((center) => center.id);
}

export function parentPortalTenantFamilyWhere(tenantCenterIds: string[]): Prisma.FamilyWhereInput {
  return {
    OR: [
      { centerId: { in: tenantCenterIds } },
      {
        children: {
          some: {
            ...currentlyEnrolledChildWhere(),
            classroom: { centerId: { in: tenantCenterIds } },
          },
        },
      },
    ],
  };
}

export async function getParentPortalFamilyScope(userId: string, tenantId: string, requestedFamilyId?: string | null) {
  const tenantCenterIds = await getParentPortalTenantCenterIds(tenantId);
  const guardians = await prisma.guardian.findMany({
    where: { userId, family: parentPortalTenantFamilyWhere(tenantCenterIds) },
    select: {
      id: true,
      familyId: true,
      family: {
        select: {
          _count: {
            select: { children: { where: currentlyEnrolledChildWhere() } },
          },
        },
      },
    },
  });
  return resolveParentPortalFamilyScope(guardians.map((guardian) => ({
    id: guardian.id,
    familyId: guardian.familyId,
    currentChildCount: guardian.family._count.children,
  })), requestedFamilyId);
}
