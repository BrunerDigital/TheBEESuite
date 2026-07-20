import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStripePayoutReconciliation } from "../src/lib/stripe-payout-reconciliation";

const payment = { paymentId: "pay_1", chargeCents: 10_000, refundedCents: 0, stripeChargeId: "ch_1" };
const balance = { id: "txn_1", type: "charge", amountCents: 10_000, feeCents: 300, netCents: 9_700, sourceId: "ch_1", availableOn: "2026-07-21" };

test("payout reconciliation reports a balanced connected-account batch", () => {
  const report = buildStripePayoutReconciliation({
    localPayments: [payment],
    balanceTransactions: [balance],
    payouts: [{ id: "po_1", amountCents: 9_700, status: "paid", arrivalDate: "2026-07-22", failureCode: null }],
  });
  assert.equal(report.status, "balanced");
  assert.equal(report.stripeFeeCents, 300);
});

test("payout reconciliation distinguishes missing and unmatched Stripe activity", () => {
  assert.equal(buildStripePayoutReconciliation({ localPayments: [payment], balanceTransactions: [], payouts: [] }).status, "missing_stripe_activity");
  assert.equal(buildStripePayoutReconciliation({ localPayments: [], balanceTransactions: [balance], payouts: [] }).status, "unmatched_stripe_activity");
});

test("payout reconciliation exposes charge and amount mismatches", () => {
  const report = buildStripePayoutReconciliation({
    localPayments: [payment],
    balanceTransactions: [{ ...balance, amountCents: 9_000, sourceId: "ch_other" }],
    payouts: [],
  });
  assert.equal(report.status, "balance_mismatch");
  assert.deepEqual(report.missingChargeIds, ["ch_1"]);
  assert.deepEqual(report.unmatchedChargeIds, ["ch_other"]);
});

test("payout reconciliation distinguishes pending failed and mismatched payouts", () => {
  assert.equal(buildStripePayoutReconciliation({
    localPayments: [payment], balanceTransactions: [balance],
    payouts: [{ id: "po_1", amountCents: 9_700, status: "pending", arrivalDate: null, failureCode: null }],
  }).status, "payout_pending");
  assert.equal(buildStripePayoutReconciliation({
    localPayments: [payment], balanceTransactions: [balance],
    payouts: [{ id: "po_1", amountCents: 9_700, status: "failed", arrivalDate: null, failureCode: "account_closed" }],
  }).status, "payout_failed");
  assert.equal(buildStripePayoutReconciliation({
    localPayments: [payment], balanceTransactions: [balance],
    payouts: [{ id: "po_1", amountCents: 9_000, status: "paid", arrivalDate: null, failureCode: null }],
  }).status, "payout_mismatch");
});

test("refund activity reconciles against the reduced local gross", () => {
  const report = buildStripePayoutReconciliation({
    localPayments: [{ ...payment, refundedCents: 2_000 }],
    balanceTransactions: [balance, { id: "txn_2", type: "refund", amountCents: -2_000, feeCents: 0, netCents: -2_000, sourceId: "re_1", availableOn: "2026-07-21" }],
    payouts: [{ id: "po_1", amountCents: 7_700, status: "paid", arrivalDate: null, failureCode: null }],
  });
  assert.equal(report.status, "balanced");
  assert.equal(report.localRefundCents, 2_000);
});
