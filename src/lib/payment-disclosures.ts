export const PAYMENT_PROCESSING_RECOVERY_LABEL = "Payment processing recovery";

export const PAYMENT_PROCESSING_RECOVERY_VERSION = "payment-processing-recovery-2026-06-09";

export const PAYMENT_PROCESSING_RECOVERY_DISCLOSURE =
  "ACH bank payment is the default low-cost tuition payment option. If this school allows card payments, a separate payment processing recovery line may be added before checkout to recover third-party processor and card-network costs. The exact amount is shown before payment, is separate from tuition, and is disabled wherever school policy, card-network rules, or applicable law do not allow it.";

export const PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE =
  "Legal/accounting gate: keep live parent-paid processing recovery disabled until the school or payout owner approves written policy, state-specific rules, card-network/acquirer notice, debit/prepaid handling, refunds, disputes, and accounting classification.";

export const PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION =
  "Separate payment processing recovery disclosed before checkout where approved by school policy, card-network rules, and applicable law.";

export function paymentProcessingRecoverySummary({
  achRecovery,
  cardRecovery,
  formatMoney,
}: {
  achRecovery: number;
  cardRecovery: number;
  formatMoney: (cents: number) => string;
}) {
  const achText = achRecovery > 0 ? `Estimated ACH processing recovery ${formatMoney(achRecovery)}; ` : "ACH is the lowest-cost option; ";
  return `${achText}estimated card processing recovery ${formatMoney(cardRecovery)}. Exact totals are shown in Stripe Checkout before payment.`;
}
