type AccountSummary = {
  billingAccount?: { id: string; balanceCents: number } | null;
  openInvoiceCount?: number;
  paymentActivity?: { pendingCount: number; provisionalCreditCents: number };
  bankVerificationPending?: boolean;
  autopayPending?: boolean;
  responsibilityReview?: boolean;
  reauthorizationRequired?: boolean;
  transitionActive?: boolean;
  paymentContinuityAccess?: boolean;
};

/** A compact amount is not a claim that every payment has settled. Missing
 * complete server summaries must never be inferred from a bounded history. */
export function canCompactParentAccount(input: AccountSummary): boolean {
  return Boolean(input.billingAccount?.id)
    && input.billingAccount?.balanceCents === 0
    && input.openInvoiceCount === 0
    && input.paymentActivity?.pendingCount === 0
    && input.paymentActivity?.provisionalCreditCents === 0
    && !input.bankVerificationPending
    && !input.autopayPending
    && !input.responsibilityReview
    && !input.reauthorizationRequired
    && !input.transitionActive
    && !input.paymentContinuityAccess;
}
