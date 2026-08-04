export const PAYMENT_PROCESSING_RECOVERY_LABEL = "School-paid processing";

export const PAYMENT_PROCESSING_RECOVERY_VERSION = "school-paid-processing-2026-08-04-v1";

export const PAYMENT_PROCESSING_RECOVERY_DISCLOSURE =
  "Schools absorb Stripe processing costs. Parents are charged only the eligible parent-responsible amount, with no added processing, convenience, service, platform, or application fee.";

export const PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE =
  "All Stripe processor fees and the separate 1% BEE Suite application fee reduce school proceeds and are never added to the parent's obligation.";

export const PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION =
  "No payment-processing fee is added to the parent's eligible amount.";

export function paymentProcessingRecoverySummary({
  achRecovery,
  cardRecovery,
  formatMoney,
}: {
  achRecovery?: number;
  cardRecovery: number;
  formatMoney: (cents: number) => string;
}) {
  void achRecovery;
  void cardRecovery;
  void formatMoney;
  return "The school absorbs Stripe processing costs; no processing fee is added to the parent's payment.";
}
