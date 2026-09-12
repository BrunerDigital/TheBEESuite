import type { PaymentStatus } from "@prisma/client";
import { isAchPaymentProcessing } from "./ach-payment-lifecycle";
import { isStripeSubmissionUnknownPayment, jsonRecord } from "./billing-guardrails";
import { stripePaymentClaimConflict } from "./stripe-payment-claim-conflict";

export type ParentPendingPayment = {
  phase: "confirmation_unknown" | "ach_processing" | "payment_pending";
  method: "ach" | "card" | "link_bank" | "card_present" | null;
};
export type ParentAccountPaymentBlocker = ParentPendingPayment & { count: number; blocksInvoicePayments: boolean };
const phasePriority = { confirmation_unknown: 0, ach_processing: 1, payment_pending: 2 };
export function mergeParentPaymentPhases(payments: readonly ParentPendingPayment[]) {
  return payments.toSorted((a, b) => phasePriority[a.phase] - phasePriority[b.phase])[0] ?? null;
}
export function mergeParentAccountPaymentBlockers(payments: readonly (ParentAccountPaymentBlocker | null | undefined)[]): ParentAccountPaymentBlocker | null {
  const active = payments.filter((payment): payment is ParentAccountPaymentBlocker => Boolean(payment));
  const phase = mergeParentPaymentPhases(active);
  return phase ? { ...phase, count: Math.max(...active.map(payment => payment.count)), blocksInvoicePayments: active.some(payment => payment.blocksInvoicePayments) } : null;
}
type Payment = { id: string; amountCents: number; status: PaymentStatus; provider: string; customFields: unknown };

function paymentPresentation(payment: Payment): ParentPendingPayment {
  const fields = jsonRecord(payment.customFields);
  const category = fields.paymentMethodCategory || fields.requestedPaymentMethodCategory;
  const method = payment.provider === "stripe_terminal" ? "card_present"
    : category === "ach" || category === "card" || category === "link_bank" ? category : null;
  return { method, phase: isStripeSubmissionUnknownPayment(payment) ? "confirmation_unknown"
    : isAchPaymentProcessing(payment) ? "ach_processing" : "payment_pending" };
}

/** Complete, already-authorized account scope only. Never expose raw provider metadata to the portal. */
export function parentPaymentStatus(payments: readonly Payment[]) {
  const active = payments.filter(payment => stripePaymentClaimConflict({ scope: "family_balance", payment }))
    .map(payment => ({ payment, summary: paymentPresentation(payment) }))
    .sort((a, b) => phasePriority[a.summary.phase] - phasePriority[b.summary.phase] || a.payment.id.localeCompare(b.payment.id));
  const accountPaymentBlocker: ParentAccountPaymentBlocker | null = active.length ? {
    ...active[0].summary, count: active.length,
    blocksInvoicePayments: active.some(({ payment }) => Boolean(stripePaymentClaimConflict({ scope: "invoice_collection", payment }))),
  } : null;
  const byInvoiceId = new Map<string, ParentPendingPayment>();
  for (const { payment, summary } of active) {
    const invoiceId = jsonRecord(payment.customFields).invoiceId;
    // A family-wide attempt blocks new invoice requests separately. It must
    // not label every unrelated invoice as provisionally paid.
    if (typeof invoiceId === "string" && !byInvoiceId.has(invoiceId)
      && stripePaymentClaimConflict({ scope: "invoice_collection", invoiceId, payment }) === "active_invoice_payment") {
      byInvoiceId.set(invoiceId, summary);
    }
  }
  return { accountPaymentBlocker, byInvoiceId };
}

export function parentPaymentStatusTitle(payment: ParentPendingPayment, scope: "account" | "invoice" = "invoice") {
  return payment.phase === "confirmation_unknown" ? "Payment confirmation pending"
    : payment.phase === "ach_processing" ? scope === "account" ? "ACH payment processing" : "Paid — processing" : "Payment in progress";
}

export function parentActivePaymentSummary(payment: { id: string; amountCents: number; status: string; provider: string; customFields?: unknown }) {
  if (payment.status !== "DRAFT") return null;
  return parentPaymentStatus([{ ...payment, status: "DRAFT", customFields: payment.customFields ?? {} }]).accountPaymentBlocker;
}

export function parentPaymentStatusMessage(payment: ParentPendingPayment & { blocksInvoicePayments?: boolean }, scope: "account" | "invoice" = "invoice") {
  const nextStep = scope === "account" ? `${payment.blocksInvoicePayments ? "New balance and invoice payments" : "New balance payments"} are paused. Refresh the status, or contact your school if it does not update.`
    : "Do not pay this invoice again yet. Refresh the status, or contact your school if it does not update.";
  if (payment.phase === "confirmation_unknown") return `The payment's outcome has not been confirmed. ${nextStep}`;
  if (payment.phase === "ach_processing") return `Your balance is provisionally credited while the ACH bank transfer settles. If the bank returns it, the amount due will be restored. ${nextStep}`;
  if (payment.method === "ach") return `ACH submission is pending; no provisional credit has been applied. ${nextStep}`;
  return `An earlier payment attempt is still active. ${nextStep}`;
}
