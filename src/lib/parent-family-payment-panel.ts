/** Visibility only: pending-payment, checkout, and server amount checks still apply. */
export function parentFamilyPaymentPanelVisible(input: {
  hasBillingAccount: boolean;
  paymentContinuityAccess: boolean;
  balanceCents: number;
  responsibilityReviewRequired: boolean;
}) {
  return input.hasBillingAccount && (
    !input.paymentContinuityAccess
    || input.balanceCents > 0
    || input.responsibilityReviewRequired
  );
}
