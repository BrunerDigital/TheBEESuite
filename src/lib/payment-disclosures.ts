export const PAYMENT_PROCESSING_RECOVERY_LABEL = "Payment processing recovery";

export const PAYMENT_PROCESSING_RECOVERY_VERSION = "payment-processing-recovery-2026-06-09";

export const PAYMENT_PROCESSING_RECOVERY_DISCLOSURE =
  "ACH bank and instant bank payments do not include a parent-paid processing recovery. If this school allows card payments, a separate payment processing recovery line may be added before checkout to recover third-party processor and card-network costs. The exact amount is shown before payment, is separate from tuition, and is disabled wherever school policy, card-network rules, or applicable law do not allow it.";

export const PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE =
  "Legal/accounting gate: keep live parent-paid processing recovery disabled until the school or payout owner approves written policy, state-specific rules, card-network/acquirer notice, debit/prepaid handling, refunds, disputes, and accounting classification.";

export const PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION =
  "Separate payment processing recovery disclosed before checkout where approved by school policy, card-network rules, and applicable law.";

export function paymentProcessingRecoverySummary({
  cardRecovery,
  formatMoney,
}: {
  achRecovery?: number;
  cardRecovery: number;
  formatMoney: (cents: number) => string;
}) {
  return `ACH and instant bank have no parent processing recovery; estimated card processing recovery ${formatMoney(cardRecovery)}. Exact totals are shown in Stripe Checkout before payment.`;
}
