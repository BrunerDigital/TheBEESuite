import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentOrOutstandingFamilyWhere } from "@/lib/corporate-view-scope";
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

export function resolveParentPortalPaymentFamilyScope(
  guardians: Array<{ id: string; familyId: string; currentChildCount?: number }>,
  requestedFamilyId?: string | null,
): ParentPortalFamilyScope {
  const eligibleFamilyIds = Array.from(new Set(guardians.map((guardian) => guardian.familyId)));
  const currentFamilyIds = Array.from(new Set(
    guardians
      .filter((guardian) => (guardian.currentChildCount ?? 0) > 0)
      .map((guardian) => guardian.familyId),
  ));
  const defaultFamilyIds = currentFamilyIds.length > 0 ? currentFamilyIds : eligibleFamilyIds;
  const selectedFamilyId = requestedFamilyId
    ? eligibleFamilyIds.includes(requestedFamilyId) ? requestedFamilyId : null
    : defaultFamilyIds.length === 1 ? defaultFamilyIds[0] : null;
  if (!selectedFamilyId) {
    return {
      ok: false,
      reason: requestedFamilyId && eligibleFamilyIds.length
        ? "requested_family_not_linked"
        : defaultFamilyIds.length ? "multiple_linked_families" : "no_linked_family",
      familyIds: requestedFamilyId ? eligibleFamilyIds : defaultFamilyIds,
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

export function selectParentPortalCurrentGuardians<
  T extends { family: { _count: { children: number } } },
>(guardians: T[]) {
  const currentGuardians = guardians.filter((guardian) => guardian.family._count.children > 0);
  return currentGuardians.length ? currentGuardians : guardians;
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
        centerId: null,
        children: {
          some: {
            ...currentlyEnrolledChildWhere(),
            classroom: { centerId: { in: tenantCenterIds } },
          },
          none: {
            ...currentlyEnrolledChildWhere(),
            classroom: { centerId: { notIn: tenantCenterIds } },
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

export async function getParentPortalPaymentFamilyScope(userId: string, tenantId: string, requestedFamilyId?: string | null) {
  const tenantCenterIds = await getParentPortalTenantCenterIds(tenantId);
  const guardians = await prisma.guardian.findMany({
    where: {
      userId,
      family: {
        AND: [
          parentPortalTenantFamilyWhere(tenantCenterIds),
          currentOrOutstandingFamilyWhere(),
        ],
      },
    },
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
  return resolveParentPortalPaymentFamilyScope(guardians.map((guardian) => ({
    id: guardian.id,
    familyId: guardian.familyId,
    currentChildCount: guardian.family._count.children,
  })), requestedFamilyId);
}

export async function getParentPortalPaymentReturn(
  userId: string,
  tenantId: string,
  input: {
    familyId?: string | null;
    paymentStatus?: string | null;
    stripeCheckoutSessionId?: string | null;
    invoiceId?: string | null;
    familyPaymentId?: string | null;
  },
) {
  const familyId = input.familyId?.trim() ?? "";
  const stripeCheckoutSessionId = input.stripeCheckoutSessionId?.trim() ?? "";
  const familyPaymentId = input.familyPaymentId?.trim() ?? "";
  const invoiceId = input.invoiceId?.trim() ?? "";
  if (input.paymentStatus !== "success" || !familyId || !stripeCheckoutSessionId || (!familyPaymentId && !invoiceId)) {
    return null;
  }

  const tenantCenterIds = await getParentPortalTenantCenterIds(tenantId);
  const payment = await prisma.payment.findFirst({
    where: {
      AND: [
        familyPaymentId
          ? { id: familyPaymentId }
          : { customFields: { path: ["invoiceId"], equals: invoiceId } },
        { customFields: { path: ["stripeCheckoutSessionId"], equals: stripeCheckoutSessionId } },
        {
          billingAccount: {
            family: {
              AND: [
                { id: familyId },
                { guardians: { some: { userId } } },
                parentPortalTenantFamilyWhere(tenantCenterIds),
              ],
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  return payment ? { familyId, paymentId: payment.id } : null;
}
