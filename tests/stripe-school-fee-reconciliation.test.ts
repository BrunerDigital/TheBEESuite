import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateExactStripeFees,
  retainedProcessingFeeCents,
  schoolFeeCorrectionCents,
} from "../src/lib/stripe-school-fee-reconciliation";

test("exact Stripe fee allocation preserves each balance transaction total", () => {
  const allocation = allocateExactStripeFees([
    { accountId: "acct_alpha", balanceTransactionId: "txn_card", amountMinorUnits: 10.566 },
    { accountId: "acct_beta", balanceTransactionId: "txn_card", amountMinorUnits: 20.9074 },
    { accountId: "acct_alpha", balanceTransactionId: "txn_link", amountMinorUnits: 9.841 },
  ], new Map([
    ["txn_card", 3_147],
    ["txn_link", 984],
  ]));

  assert.equal([...allocation.values()].reduce((sum, amount) => sum + amount, 0), 4_131);
  assert.equal(allocation.get("acct_alpha"), 2_040);
  assert.equal(allocation.get("acct_beta"), 2_091);
});

test("processing recovery is reduced when an application fee is refunded", () => {
  assert.equal(retainedProcessingFeeCents({
    processingFeeCents: 290,
    applicationFeeCents: 390,
    applicationFeeRefundedCents: 390,
  }), 0);
  assert.equal(retainedProcessingFeeCents({
    processingFeeCents: 290,
    applicationFeeCents: 390,
    applicationFeeRefundedCents: 195,
  }), 145);
});

test("school correction subtracts retained recovery and prior corrections", () => {
  assert.equal(schoolFeeCorrectionCents({
    actualStripeFeeCents: 1_000,
    retainedProcessingFeeCents: 600,
    priorCorrectionCents: 125,
  }), 275);
  assert.equal(schoolFeeCorrectionCents({
    actualStripeFeeCents: 500,
    retainedProcessingFeeCents: 600,
    priorCorrectionCents: 0,
  }), 0);
});
