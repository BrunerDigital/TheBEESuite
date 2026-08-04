export const PAYMENT_PROCESSING_RECOVERY_LABEL = "Card processing fee";

export const PAYMENT_PROCESSING_RECOVERY_VERSION = "payment-processing-recovery-2026-06-09";

export const PAYMENT_PROCESSING_RECOVERY_DISCLOSURE =
  "Debit and credit card payments include a separate 2.9% processing fee calculated only on the parent's eligible payment amount. Bank payments do not include this fee. The exact total is shown before checkout.";

export const PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE =
  "The parent card fee is exactly 2.9%, with no fixed component or gross-up. The separate 1.5% BEE Suite application fee is deducted from school proceeds and is never added to the parent's obligation.";

export const PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION =
  "Separate 2.9% card processing fee disclosed before checkout.";

export function paymentProcessingRecoverySummary({
  cardRecovery,
  formatMoney,
}: {
  achRecovery?: number;
  cardRecovery: number;
  formatMoney: (cents: number) => string;
}) {
  return `ACH and instant bank have no parent processing fee; estimated card processing fee ${formatMoney(cardRecovery)}. Exact totals are shown before submission.`;
}
