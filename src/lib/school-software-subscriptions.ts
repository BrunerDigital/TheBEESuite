import { UserRole, type Prisma, type PrismaClient } from "@prisma/client";

type PrismaLike = PrismaClient | Prisma.TransactionClient;
const billableRoles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN] as const;

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function textField(fields: unknown, key: string) {
  const value = record(fields)[key];
  return typeof value === "string" ? value : "";
}

export async function countCenterBillableUsers(db: PrismaLike, centerId: string, now = new Date()) {
  return db.user.count({
    where: {
      isActive: true,
      role: { in: [...billableRoles] },
      OR: [
        { staffProfile: { is: { centerId } } },
        { accessGrants: { some: { centerId, isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } } },
      ],
    },
  });
}

export async function saveSoftwareSubscriptionSnapshot(db: PrismaLike, centerId: string, snapshot: {
  id: string; status: string; priceId: string | null; itemId: string | null; quantity: number;
  currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; latestInvoiceId: string | null;
}, extra: Record<string, unknown> = {}) {
  const center = await db.center.findUnique({ where: { id: centerId }, select: { customFields: true } });
  if (!center) return;
  await db.center.update({
    where: { id: centerId },
    data: { customFields: {
      ...record(center.customFields),
      stripeSoftwareSubscriptionId: snapshot.id,
      stripeSoftwareSubscriptionStatus: snapshot.status,
      stripeSoftwarePriceId: snapshot.priceId,
      stripeSoftwareSubscriptionItemId: snapshot.itemId,
      stripeSoftwareQuantity: snapshot.quantity,
      stripeSoftwareCurrentPeriodStart: snapshot.currentPeriodStart,
      stripeSoftwareCurrentPeriodEnd: snapshot.currentPeriodEnd,
      stripeSoftwareCancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      stripeSoftwareLatestInvoiceId: snapshot.latestInvoiceId,
      stripeSoftwareSubscriptionSyncedAt: new Date().toISOString(),
      ...extra,
    } },
  });
}
