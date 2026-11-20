type PayoutBank = {
  last4?: string | null;
  defaultForCurrency?: boolean;
  status?: string | null;
};

// Stripe payout banks can remain `new` after successful payouts. Reject known
// failure states without requiring the separate customer-bank verification flow.
export function stripePayoutBankIsUsable(bank: PayoutBank | null | undefined) {
  const status = bank?.status?.trim().toLowerCase();
  return Boolean(
    bank?.last4?.trim() &&
    bank.defaultForCurrency === true &&
    status !== "errored" &&
    status !== "verification_failed",
  );
}
