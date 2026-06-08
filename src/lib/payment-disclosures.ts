export const PAYMENT_PROCESSING_RECOVERY_LABEL = "Payment processing recovery";

export const PAYMENT_PROCESSING_RECOVERY_DISCLOSURE =
  "ACH payments are the preferred tuition payment method. Card payments may include a payment processing recovery fee where allowed and configured by the school. The fee is shown before payment, is separate from tuition, and helps recover third-party card processing costs.";

export const PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE =
  "Confirm school policy, card-network rules, state rules, and accounting treatment before enabling parent-paid processing recovery fees in live mode.";

export const PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION =
  "Card payment processing recovery shown before payment where allowed by school policy and applicable rules.";

export function paymentProcessingRecoverySummary({
  achRecovery,
  cardRecovery,
  formatMoney,
}: {
  achRecovery: number;
  cardRecovery: number;
  formatMoney: (cents: number) => string;
}) {
  const achText = achRecovery > 0 ? `Estimated ACH recovery ${formatMoney(achRecovery)}; ` : "ACH is the lowest-cost option; ";
  return `${achText}estimated card processing recovery ${formatMoney(cardRecovery)}. Exact totals are shown in Stripe Checkout before payment.`;
}
