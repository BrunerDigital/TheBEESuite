export type StripeReconciliationStatus =
  | "no_activity"
  | "balanced"
  | "missing_stripe_activity"
  | "unmatched_stripe_activity"
  | "balance_mismatch"
  | "payout_pending"
  | "payout_failed"
  | "payout_mismatch";

export type LocalStripePayment = {
  paymentId: string;
  chargeCents: number;
  refundedCents?: number;
  stripeChargeId?: string | null;
};

export type StripeBalanceTransaction = {
  id: string;
  type: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  sourceId: string | null;
  availableOn: string | null;
};

export type StripePayout = {
  id: string;
  amountCents: number;
  status: string;
  arrivalDate: string | null;
  failureCode: string | null;
};

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function buildStripePayoutReconciliation(input: {
  localPayments: LocalStripePayment[];
  balanceTransactions: StripeBalanceTransaction[];
  payouts: StripePayout[];
  balanceHasMore?: boolean;
  payoutsHaveMore?: boolean;
}) {
  const localChargeCents = sum(input.localPayments.map((payment) => Math.max(0, payment.chargeCents)));
  const localRefundCents = sum(input.localPayments.map((payment) => Math.max(0, payment.refundedCents || 0)));
  const localNetChargeCents = localChargeCents - localRefundCents;
  const relevantBalance = input.balanceTransactions.filter((item) => ["charge", "payment", "refund", "payment_refund"].includes(item.type));
  const stripeGrossCents = sum(relevantBalance.map((item) => item.amountCents));
  const stripeFeeCents = sum(relevantBalance.map((item) => item.feeCents));
  const stripeNetCents = sum(relevantBalance.map((item) => item.netCents));
  const paidPayouts = input.payouts.filter((payout) => payout.status === "paid");
  const pendingPayouts = input.payouts.filter((payout) => ["pending", "in_transit"].includes(payout.status));
  const failedPayouts = input.payouts.filter((payout) => payout.status === "failed" || Boolean(payout.failureCode));
  const paidPayoutCents = sum(paidPayouts.map((payout) => payout.amountCents));
  const pendingPayoutCents = sum(pendingPayouts.map((payout) => payout.amountCents));
  const localChargeIds = new Set(input.localPayments.map((payment) => payment.stripeChargeId).filter(Boolean));
  const stripeChargeIds = new Set(relevantBalance.filter((item) => item.type === "charge").map((item) => item.sourceId).filter(Boolean));
  const missingChargeIds = [...localChargeIds].filter((id) => !stripeChargeIds.has(id));
  const unmatchedChargeIds = [...stripeChargeIds].filter((id) => !localChargeIds.has(id));

  let status: StripeReconciliationStatus = "balanced";
  if (!input.localPayments.length && !relevantBalance.length && !input.payouts.length) status = "no_activity";
  else if (input.localPayments.length && !relevantBalance.length) status = "missing_stripe_activity";
  else if (!input.localPayments.length && relevantBalance.length) status = "unmatched_stripe_activity";
  else if (missingChargeIds.length || unmatchedChargeIds.length || localNetChargeCents !== stripeGrossCents) status = "balance_mismatch";
  else if (failedPayouts.length) status = "payout_failed";
  else if (pendingPayouts.length || (!paidPayouts.length && stripeNetCents !== 0)) status = "payout_pending";
  else if (paidPayoutCents !== stripeNetCents) status = "payout_mismatch";

  return {
    status,
    localPaymentCount: input.localPayments.length,
    localChargeCents,
    localRefundCents,
    localNetChargeCents,
    stripeTransactionCount: relevantBalance.length,
    stripeGrossCents,
    stripeFeeCents,
    stripeNetCents,
    paidPayoutCents,
    pendingPayoutCents,
    failedPayoutCount: failedPayouts.length,
    missingChargeIds,
    unmatchedChargeIds,
    truncated: input.balanceHasMore === true || input.payoutsHaveMore === true,
    note: "Payout timing can cross reconciliation windows. Review opening balance and availability dates before signing off a mismatch.",
  };
}
