import { PaymentStatus, Prisma } from "@prisma/client";
import { jsonRecord } from "./billing-guardrails";

export function familyRefundDelta(input: { principalCents: number; previouslyRefundedCents: number; providerRefundedCents: number }) {
  const previous = Math.max(0, Math.round(input.previouslyRefundedCents));
  const cumulative = Math.max(previous, Math.max(0, Math.round(input.providerRefundedCents)));
  return { cumulativeRefundedCents: cumulative, principalDeltaCents: Math.max(0,
    Math.min(input.principalCents, cumulative) - Math.min(input.principalCents, previous)) };
}

/** Called with the Payment locked, after a verified refund. No provider calls. */
export async function applyFamilyPaymentRefund(tx: Prisma.TransactionClient, input: {
  paymentId: string; chargeId: string; paymentIntentId: string | null; eventId: string;
  cumulativeRefundedCents: number; invoiceId: string | null;
  refundId?: string;
}) {
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${payment.billingAccountId} FOR UPDATE`);
  const fields = jsonRecord(payment.customFields);
  const appliedRefundIds = Array.isArray(fields.appliedStripeRefundIds) ? fields.appliedStripeRefundIds.filter((id): id is string => typeof id === "string") : [];
  if (input.refundId && appliedRefundIds.includes(input.refundId)) return { cumulativeRefundedCents: Number(fields.stripeAmountRefundedCents) || 0, principalDeltaCents: 0 };
  const linkedInvoice = input.invoiceId ? await tx.invoice.findUnique({ where: { id: input.invoiceId } }) : null;
  const invoiceId = linkedInvoice?.billingAccountId === payment.billingAccountId ? linkedInvoice.id : null;
  const delta = familyRefundDelta({ principalCents: payment.amountCents,
    previouslyRefundedCents: Number(fields.stripeAmountRefundedCents) || 0, providerRefundedCents: input.cumulativeRefundedCents });
  // Older/out-of-order refund events cannot lower the high-water mark.
  await tx.payment.update({ where: { id: payment.id }, data: {
    status: delta.cumulativeRefundedCents >= payment.amountCents ? PaymentStatus.REFUNDED : payment.status,
    customFields: { ...fields, stripeChargeId: input.chargeId || fields.stripeChargeId || null,
      appliedStripeRefundIds: input.refundId ? [...appliedRefundIds, input.refundId] : appliedRefundIds,
      stripePaymentIntentId: input.paymentIntentId || fields.stripePaymentIntentId || null,
      stripeEventId: input.eventId, stripeAmountRefundedCents: delta.cumulativeRefundedCents,
      stripeFullyRefunded: delta.cumulativeRefundedCents >= payment.amountCents,
      status: delta.cumulativeRefundedCents >= payment.amountCents ? "refunded" : "partially_refunded",
    } as Prisma.InputJsonObject,
  } });
  if (!delta.principalDeltaCents) return delta;
  const account = await tx.billingAccount.update({ where: { id: payment.billingAccountId },
    data: { balanceCents: { increment: delta.principalDeltaCents } } });
  // Never resurrect a voided invoice or another household's invoice.
  if (invoiceId) await tx.invoice.updateMany({ where: { id: invoiceId,
    billingAccountId: payment.billingAccountId, status: PaymentStatus.PAID }, data: { status: PaymentStatus.OPEN } });
  // A refunded advance payment may already have settled future invoices with credit.
  // Reopen only enough credit-settled invoices to represent the restored debt.
  if (!invoiceId && account.balanceCents > 0) {
    const open = await tx.invoice.aggregate({ where: { billingAccountId: payment.billingAccountId, status: PaymentStatus.OPEN }, _sum: { totalCents: true } });
    let representedCents = open._sum.totalCents ?? 0;
    if (representedCents < account.balanceCents) {
      const creditInvoices = await tx.invoice.findMany({ where: { billingAccountId: payment.billingAccountId,
        status: PaymentStatus.PAID, customFields: { path: ["paidByAccountCredit"], equals: true } }, orderBy: [{ dueDate: "desc" }, { id: "desc" }] });
      for (const invoice of creditInvoices) {
        if (representedCents >= account.balanceCents) break;
        const reopened = await tx.invoice.updateMany({ where: { id: invoice.id, billingAccountId: payment.billingAccountId, status: PaymentStatus.PAID }, data: { status: PaymentStatus.OPEN } });
        if (reopened.count) representedCents += invoice.totalCents;
      }
    }
  }
  await tx.ledgerEntry.create({ data: {
    billingAccountId: payment.billingAccountId, invoiceId, paymentId: payment.id,
    type: "refund", description: "Payment refunded", amountCents: delta.principalDeltaCents,
    balanceAfterCents: account.balanceCents, sourceSystem: "stripe",
    externalId: `stripe-refund:${input.chargeId}:${delta.cumulativeRefundedCents}`,
    metadata: { stripeEventId: input.eventId, stripeChargeId: input.chargeId,
      stripePaymentIntentId: input.paymentIntentId, refundedCents: delta.cumulativeRefundedCents,
      refundDeltaCents: delta.principalDeltaCents },
  } });
  return delta;
}
