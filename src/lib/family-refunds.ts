import { PaymentStatus, type Prisma } from "@prisma/client";
import { canAccessCenter, type CurrentUser } from "@/lib/auth";
import { planFamilyRefundAllocations } from "@/lib/billing-workflows";
import { createStripeRefund } from "@/lib/integrations";
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
    .filter((payment) => payment.refundableCents > 0 && payment.paymentIntentId);
  const refundPlan = planFamilyRefundAllocations(
    candidates,
    input.amountCents,
    input.preferredPaymentIds ?? [],
  );

  if (input.amountCents > refundPlan.availableCents) {
    return {
      ok: false as const,
      status: 400,
      error: `Stripe can return ${moneyLabel(refundPlan.availableCents)} across this family's completed payments. Use a family credit or manual reimbursement for the remaining ${moneyLabel(input.amountCents - refundPlan.availableCents)}.`,
      availableCents: refundPlan.availableCents,
    };
  }

  return { ok: true as const, account, refundPlan };
}

export async function validateFamilyRefundAvailability(
  user: CurrentUser,
  input: {
    familyId: string;
    amountCents: number;
    preferredPaymentIds?: string[];
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
  const allocations: RefundAllocation[] = [];
  for (const planned of refundPlan.allocations) {
    const payment = planned.payment;
    const connectedAccountId = clean(payment.fields.stripeConnectedAccountId) || null;
    const refund = await createStripeRefund({
      paymentIntentId: payment.paymentIntentId,
      amountCents: planned.amountCents,
      reason: input.reason,
      connectedAccountId,
      idempotencyKey: `billing-family-refund:${input.operationId}:${payment.id}`,
      tenantId: input.tenantId ?? user.tenantId,
      metadata: {
        paymentId: payment.id,
        familyId: input.familyId,
        requestedByUserId: user.id,
        operationId: input.operationId,
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
    const refundedAmountCents = refundRecord.amountCents;
    const totalRefundedCents = payment.refundedCents + refundedAmountCents;
    const invoiceId = payment.ledgerEntries[0]?.invoiceId ?? null;
    await prisma.$transaction(async (tx) => {
      const updatedAccount = await tx.billingAccount.update({
        where: { id: account.id },
        data: { balanceCents: { increment: refundedAmountCents } },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: totalRefundedCents >= payment.amountCents ? PaymentStatus.REFUNDED : PaymentStatus.PAID,
          customFields: {
            ...payment.fields,
            stripeAmountRefundedCents: totalRefundedCents,
            stripeFullyRefunded: totalRefundedCents >= payment.amountCents,
            latestStripeRefundId: refundRecord.id,
            latestRefundReason: input.reason,
            latestRefundedBy: user.email,
            latestFamilyRefundOperationId: input.operationId,
            status: totalRefundedCents >= payment.amountCents ? "refunded" : "partially_refunded",
          } satisfies Prisma.InputJsonObject,
        },
      });
      if (invoiceId) {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: PaymentStatus.OPEN },
        });
      }
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: account.id,
          invoiceId,
          paymentId: payment.id,
          type: "refund",
          description: `Refund: ${input.reason}`,
          amountCents: refundedAmountCents,
          balanceAfterCents: updatedAccount.balanceCents,
          sourceSystem: "stripe",
          externalId: `stripe-refund:${refundRecord.id}`,
          metadata: {
            stripeRefundId: refundRecord.id,
            stripePaymentIntentId: payment.paymentIntentId,
            refundReason: input.reason,
            refundedBy: user.email,
            totalRefundedCents,
            familyRefundOperationId: input.operationId,
          },
        },
      });
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

  return {
    ok: true,
    totalCents,
    requestedCents: input.amountCents,
    allocations,
    partial: totalCents < input.amountCents,
    warning: totalCents < input.amountCents
      ? `${moneyLabel(totalCents)} was sent before Stripe stopped the remaining allocation.`
      : null,
  };
}
