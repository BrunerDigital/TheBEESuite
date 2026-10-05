import { Prisma } from '@prisma/client';
import { jsonRecord } from './billing-guardrails';

export async function reserveFamilyRefundClaim(tx: Prisma.TransactionClient, input: {
  paymentId: string; amountCents: number; reason: string; operationId: string; requestedByUserId: string;
  paymentIntentId: string; connectedAccountId: string | null;
  requestedTotalCents: number; requestPlan: Array<{ paymentId: string; amountCents: number }>; preferredPaymentIds: string[];
}) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${input.paymentId} FOR UPDATE`);
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  const fields = jsonRecord(payment.customFields), previous = jsonRecord(fields.pendingFamilyRefund);
  if (typeof previous.idempotencyKey === 'string') {
    if (previous.amountCents !== input.amountCents || previous.reason !== input.reason
      || previous.paymentIntentId !== input.paymentIntentId || previous.connectedAccountId !== input.connectedAccountId) {
      return { ok: false as const, error: 'A different refund is awaiting processor reconciliation for this payment. Verify it before issuing another refund.' };
    }
    if (typeof previous.operationId !== 'string' || typeof previous.requestedByUserId !== 'string') return { ok: false as const, error: 'The existing refund request needs reconciliation before retrying.' };
    const knownRefund = typeof previous.refundId === 'string' ? { id: previous.refundId, amountCents: input.amountCents, status: typeof previous.status === 'string' ? previous.status : null } : null;
    if (!knownRefund && (!Number.isFinite(Date.parse(String(previous.createdAt))) || Date.now() - Date.parse(String(previous.createdAt)) >= 23 * 60 * 60 * 1000)) {
      return { ok: false as const, error: 'The unresolved refund request needs processor verification before its retry window expires. No new refund was issued.' };
    }
    return { ok: true as const, idempotencyKey: previous.idempotencyKey, operationId: previous.operationId, requestedByUserId: previous.requestedByUserId, knownRefund };
  }
  if (input.amountCents > payment.amountCents - (Number(fields.stripeAmountRefundedCents) || 0)) {
    return { ok: false as const, error: 'The refundable amount changed. Refresh the account before issuing a refund.' };
  }
  const idempotencyKey = `billing-family-refund:${input.operationId}:${payment.id}`;
  await tx.payment.update({ where: { id: payment.id }, data: { customFields: { ...fields,
    pendingFamilyRefund: { amountCents: input.amountCents, reason: input.reason, idempotencyKey, status: 'submitting', operationId: input.operationId, requestedByUserId: input.requestedByUserId, createdAt: new Date().toISOString(), paymentIntentId: input.paymentIntentId, connectedAccountId: input.connectedAccountId,
      requestedTotalCents: input.requestedTotalCents, requestPlan: input.requestPlan, preferredPaymentIds: input.preferredPaymentIds },
  } as Prisma.InputJsonObject } });
  return { ok: true as const, idempotencyKey, operationId: input.operationId, requestedByUserId: input.requestedByUserId, knownRefund: null };
}

export async function recordFamilyRefundClaim(tx: Prisma.TransactionClient, input: {
  paymentId: string; idempotencyKey: string; refundId: string; status: string | null; reconciled?: boolean;
}) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${input.paymentId} FOR UPDATE`);
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  const fields = jsonRecord(payment.customFields), claim = jsonRecord(fields.pendingFamilyRefund);
  if (claim.idempotencyKey !== input.idempotencyKey) return;
  const completed = input.reconciled || input.status === 'failed' || input.status === 'canceled';
  const recorded = { ...claim, refundId: input.refundId, status: input.status, reconciled: input.reconciled === true || claim.reconciled === true };
  const history = jsonRecord(fields.familyRefundClaimsByOperation);
  await tx.payment.update({ where: { id: payment.id }, data: { customFields: { ...fields,
    pendingFamilyRefund: completed ? null : recorded,
    lastFamilyRefundClaim: recorded,
    familyRefundClaimsByOperation: { ...history, [`refund:${String(claim.operationId)}`]: recorded },
  } as Prisma.InputJsonObject } });
}
