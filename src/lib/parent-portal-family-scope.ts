import { prisma } from "@/lib/prisma";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";

export type ParentPortalFamilyScope =
  | { ok: true; familyId: string; guardianIds: string[] }
  | { ok: false; reason: "no_linked_family" | "multiple_linked_families"; familyIds: string[] };

export function resolveParentPortalFamilyScope(
  guardians: Array<{ id: string; familyId: string; currentChildCount?: number }>,
): ParentPortalFamilyScope {
  const currentFamilyIds = Array.from(new Set(
    guardians
      .filter((guardian) => (guardian.currentChildCount ?? 0) > 0)
      .map((guardian) => guardian.familyId),
  ));
  const familyIds = currentFamilyIds.length > 0
    ? currentFamilyIds
    : Array.from(new Set(guardians.map((guardian) => guardian.familyId)));
  if (familyIds.length !== 1) {
    return {
      ok: false,
      reason: familyIds.length ? "multiple_linked_families" : "no_linked_family",
      familyIds,
    };
  }
  return {
    ok: true,
    familyId: familyIds[0],
    guardianIds: guardians
      .filter((guardian) => guardian.familyId === familyIds[0])
      .map((guardian) => guardian.id),
  };
}

export async function getParentPortalFamilyScope(userId: string) {
  const guardians = await prisma.guardian.findMany({
    where: { userId },
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
  })));
}
