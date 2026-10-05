import { PaymentStatus, Prisma } from "@prisma/client";
import { canAccessCenter, type CurrentUser } from "@/lib/auth";
import { planFamilyRefundAllocations } from "@/lib/billing-workflows";
import { createStripeRefund, retrieveStripeRefund, retrieveStripeSucceededRefundTotal } from "@/lib/integrations";
import { applyFamilyPaymentRefund } from "@/lib/family-payment-refund";
import { reserveFamilyRefundClaim, recordFamilyRefundClaim } from "@/lib/family-refund-claim";
import { prisma } from "@/lib/prisma";

type RefundAllocation = {
  paymentId: string;
  stripeRefundId: string;
  amountCents: number;
};

export type FamilyRefundResult =
  | {
      ok: true;
      totalCents: number;
      requestedCents: number;
      allocations: RefundAllocation[];
      partial: boolean;
      warning: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      availableCents?: number;
    };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function moneyLabel(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function loadFamilyRefundPlan(
  user: CurrentUser,
  input: {
    familyId: string;
    amountCents: number;
    preferredPaymentIds?: string[];
    operationId?: string;
    reason?: string;
  },
) {
  const account = await prisma.billingAccount.findUnique({
    where: { familyId: input.familyId },
    select: {
      id: true,
      family: { select: { centerId: true, name: true } },
      payments: {
        where: {
          provider: { in: ["stripe", "stripe_terminal"] },
          status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
        },
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          amountCents: true,
          status: true,
          externalIdPlaceholder: true,
          customFields: true,
          ledgerEntries: {
            where: { invoiceId: { not: null } },
            orderBy: { effectiveAt: "desc" },
            take: 1,
            select: { invoiceId: true },
          },
        },
      },
    },
  });

  if (!account) {
    return { ok: false as const, status: 404, error: "Family billing account not found." };
  }
  if (!account.family.centerId || !canAccessCenter(user, account.family.centerId)) {
    return { ok: false as const, status: 403, error: "You do not have access to this family." };
  }

  const candidates = account.payments
    .map((payment) => {
      const fields = jsonObject(payment.customFields);
      const refundedCents = Math.max(0, Number(fields.stripeAmountRefundedCents) || 0);
      const paymentIntentId = clean(fields.stripePaymentIntentId)
        || (clean(payment.externalIdPlaceholder).startsWith("pi_") ? clean(payment.externalIdPlaceholder) : "");
      return {
        ...payment,
        fields,
        refundedCents,
        refundableCents: Math.max(0, payment.amountCents - refundedCents),
        paymentIntentId,
      };
    })
    .filter((payment) => payment.paymentIntentId);
  // Resume the original allocation plan before newly reduced refundable totals
  // can reject a multi-payment request whose earlier allocations already succeeded.
  const matchingPending = candidates.map(payment => jsonObject(payment.fields.pendingFamilyRefund)).find(claim =>
    claim.requestedTotalCents === input.amountCents && claim.reason === input.reason && typeof claim.operationId === "string");
  const operationId = clean(matchingPending?.operationId) || clean(input.operationId);
  const savedClaims = candidates.map(payment => jsonObject(jsonObject(payment.fields.familyRefundClaimsByOperation)[`refund:${operationId}`]));
  if (!matchingPending && savedClaims.some(claim => claim.operationId === operationId
    && (claim.requestedTotalCents !== input.amountCents || claim.reason !== input.reason))) return { ok: false as const, status: 409, error: "A refund request identity cannot be reused for a different amount or reason." };
  const savedRequest = matchingPending || savedClaims.find(claim => claim.operationId === operationId && claim.requestedTotalCents === input.amountCents && claim.reason === input.reason);
  if (savedRequest && Array.isArray(savedRequest.requestPlan)) {
    if (JSON.stringify(savedRequest.preferredPaymentIds) !== JSON.stringify(input.preferredPaymentIds ?? [])) return { ok: false as const, status: 409, error: "The pending refund's payment selection changed. Resume its original request." };
    const allocations: Array<{ payment: typeof candidates[number]; amountCents: number }> = [];
    const completedAllocations: RefundAllocation[] = [];
    const requestPlan: Array<{ paymentId: string; amountCents: number }> = [];
    for (const value of savedRequest.requestPlan) {
      const row = jsonObject(value), payment = candidates.find(candidate => candidate.id === row.paymentId);
      if (!payment || !Number.isSafeInteger(row.amountCents) || Number(row.amountCents) <= 0 || requestPlan.some(item => item.paymentId === payment.id)) return { ok: false as const, status: 409, error: "The saved refund allocation needs review before retrying." };
      const amountCents = Number(row.amountCents);
      requestPlan.push({ paymentId: payment.id, amountCents });
      const previous = jsonObject(jsonObject(payment.fields.familyRefundClaimsByOperation)[`refund:${operationId}`]);
      if (previous.reconciled === true && previous.status === "succeeded" && typeof previous.refundId === "string") completedAllocations.push({ paymentId: payment.id, stripeRefundId: previous.refundId, amountCents });
      else allocations.push({ payment, amountCents });
    }
    if (requestPlan.reduce((total, row) => total + row.amountCents, 0) !== input.amountCents) return { ok: false as const, status: 409, error: "The saved refund total changed. Review the original request." };
    return { ok: true as const, account, refundPlan: { availableCents: input.amountCents, allocations }, requestPlan, completedAllocations, operationId };
  }
  const refundPlan = planFamilyRefundAllocations(
    candidates.filter(payment => payment.refundableCents > 0),
    input.amountCents,
    input.preferredPaymentIds ?? [],
  );

  if (input.amountCents > refundPlan.availableCents) {
    return {
      ok: false as const,
      status: 400,
      error: `The original payment processor can return ${moneyLabel(refundPlan.availableCents)} across this family's completed payments. Use a family credit or manual reimbursement for the remaining ${moneyLabel(input.amountCents - refundPlan.availableCents)}.`,
      availableCents: refundPlan.availableCents,
    };
  }

  return { ok: true as const, account, refundPlan, completedAllocations: [] as RefundAllocation[], operationId: clean(input.operationId),
    requestPlan: refundPlan.allocations.map(row => ({ paymentId: row.payment.id, amountCents: row.amountCents })) };
}

export async function validateFamilyRefundAvailability(
  user: CurrentUser,
  input: {
    familyId: string;
    amountCents: number;
    preferredPaymentIds?: string[];
    operationId?: string;
    reason?: string;
  },
) {
  const result = await loadFamilyRefundPlan(user, input);
  if (!result.ok) return result;
  return {
    ok: true as const,
    centerId: result.account.family.centerId as string,
    familyName: result.account.family.name,
    availableCents: result.refundPlan.availableCents,
  };
}

export async function issueFamilyRefund(
  user: CurrentUser,
  input: {
    familyId: string;
    amountCents: number;
    reason: string;
    preferredPaymentIds?: string[];
    operationId: string;
    tenantId?: string;
  },
): Promise<FamilyRefundResult> {
  const prepared = await loadFamilyRefundPlan(user, input);
  if (!prepared.ok) return prepared;

  const { account, refundPlan } = prepared;
  const allocations: RefundAllocation[] = [...prepared.completedAllocations];
  let stoppedReason: string | null = null;
  for (const planned of refundPlan.allocations) {
    const payment = planned.payment;
    const connectedAccountId = clean(payment.fields.stripeConnectedAccountId) || null;
    const claim = await prisma.$transaction(tx => reserveFamilyRefundClaim(tx, {
      paymentId: payment.id, amountCents: planned.amountCents, reason: input.reason, operationId: prepared.operationId || input.operationId, requestedByUserId: user.id,
      paymentIntentId: payment.paymentIntentId, connectedAccountId,
      requestedTotalCents: input.amountCents, requestPlan: prepared.requestPlan, preferredPaymentIds: input.preferredPaymentIds ?? [],
    }));
    if (!claim.ok) {
      if (!allocations.length) return { ok: false, status: 409, error: claim.error };
      stoppedReason = claim.error; break;
    }
    const refund = claim.knownRefund ? (claim.knownRefund.status === "succeeded"
      ? { ok: true, configured: true, refund: claim.knownRefund, error: undefined }
      : await retrieveStripeRefund({ refundId: claim.knownRefund.id, connectedAccountId, tenantId: input.tenantId ?? user.tenantId })) : await createStripeRefund({
      paymentIntentId: payment.paymentIntentId,
      amountCents: planned.amountCents,
      reason: input.reason,
      connectedAccountId,
      idempotencyKey: claim.idempotencyKey,
      tenantId: input.tenantId ?? user.tenantId,
      metadata: {
        paymentId: payment.id,
        familyId: input.familyId,
        requestedByUserId: claim.requestedByUserId,
        operationId: claim.operationId,
      },
    });
    if (!refund.ok || !refund.refund?.id) {
      if (!allocations.length) {
        return {
          ok: false,
          status: refund.configured ? 502 : 503,
          error: refund.error || "Refund could not be issued.",
        };
      }
      break;
    }

    const refundRecord = refund.refund;
    await prisma.$transaction(tx => recordFamilyRefundClaim(tx, { paymentId: payment.id,
      idempotencyKey: claim.idempotencyKey, refundId: refundRecord.id, status: refundRecord.status }));
    if (refundRecord.status !== "succeeded") {
      stoppedReason = `Processor refund ${refundRecord.id} is ${refundRecord.status || "unconfirmed"}; it has not been recorded as completed. Check its processor status before retrying.`;
      if (!allocations.length) return { ok: false, status: 409, error: stoppedReason };
      break;
    }
    const refundedAmountCents = refundRecord.amountCents;
    const invoiceId = payment.ledgerEntries[0]?.invoiceId ?? null;
    const totalRefundedCents = await retrieveStripeSucceededRefundTotal({ paymentIntentId: payment.paymentIntentId,
      connectedAccountId, tenantId: input.tenantId ?? user.tenantId });
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`);
      await applyFamilyPaymentRefund(tx, {
        paymentId: payment.id, chargeId: clean(payment.fields.stripeChargeId),
        paymentIntentId: payment.paymentIntentId, eventId: `director-refund:${refundRecord.id}`,
        cumulativeRefundedCents: totalRefundedCents, invoiceId, refundId: refundRecord.id,
      });
      await recordFamilyRefundClaim(tx, { paymentId: payment.id, idempotencyKey: claim.idempotencyKey,
        refundId: refundRecord.id, status: refundRecord.status, reconciled: true });
    });
    allocations.push({
      paymentId: payment.id,
      stripeRefundId: refundRecord.id,
      amountCents: refundedAmountCents,
    });
  }

  const totalCents = allocations.reduce((total, allocation) => total + allocation.amountCents, 0);
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId ?? user.tenantId,
      centerId: account.family.centerId,
      userId: user.id,
      action: "billing.family.refunded",
      resource: "Family",
      resourceId: input.familyId,
      metadata: {
        requestedAmountCents: input.amountCents,
        refundedAmountCents: totalCents,
        reason: input.reason,
        familyId: input.familyId,
        operationId: input.operationId,
        paymentIds: allocations.map((item) => item.paymentId),
        stripeRefundIds: allocations.map((item) => item.stripeRefundId),
      },
    },
  });
  if (account.family.centerId) {
    await prisma.center.update({ where: { id: account.family.centerId }, data: { updatedAt: new Date() } });
  }

  return {
    ok: true,
    totalCents,
    requestedCents: input.amountCents,
    allocations,
    partial: totalCents < input.amountCents,
    warning: totalCents < input.amountCents
      ? `${moneyLabel(totalCents)} was sent. ${stoppedReason || "The payment processor stopped the remaining allocation."}`
      : null,
  };
}
