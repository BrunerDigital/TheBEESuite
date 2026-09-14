import type { Prisma } from "@prisma/client";
import { authorizeBillingActorForTarget } from "./billing-actor-authorization";

export type FamilyPaymentTarget = { tenantId: string; centerId: string; familyId: string; billingAccountId: string };
type Reader = Pick<Prisma.TransactionClient, "billingAccount" | "center" | "user" | "guardian" | "deviceSession">;
type Actor = Parameters<typeof authorizeBillingActorForTarget>[1];
const validId = (value: string | null) => value === null || /^[A-Za-z0-9_-]{1,191}$/.test(value);

/** Call inside the same snapshot as financial reads; this function never materializes financial or child data. */
export async function readAuthorizedFamilyPaymentTarget(tx: Reader, actor: Actor, input: { billingAccountId: string | null; familyId: string | null }): Promise<FamilyPaymentTarget | null> {
  if (!actor.tenantId || !validId(input.billingAccountId) || !validId(input.familyId) || !input.billingAccountId && !input.familyId) return null;
  const account = await tx.billingAccount.findFirst({ where: {
    ...(input.billingAccountId ? { id: input.billingAccountId } : {}), ...(input.familyId ? { familyId: input.familyId } : {}),
  }, select: { id: true, familyId: true, family: { select: { id: true, centerId: true } } } });
  if (!account?.family.centerId || account.family.id !== account.familyId
    || input.billingAccountId && account.id !== input.billingAccountId || input.familyId && account.familyId !== input.familyId) return null;
  const target = { tenantId: actor.tenantId, centerId: account.family.centerId, familyId: account.familyId, billingAccountId: account.id };
  return await authorizeBillingActorForTarget(tx, actor, target) ? target : null;
}
