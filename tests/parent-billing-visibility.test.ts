import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSubsidyResponsibilityEvidence,
  isAgencyOnlyLedgerEntry,
  isParentVisiblePayment,
  parentBalanceNeedsResponsibilityReview,
  parentPaymentAmountCents,
  parentVisibleBillingBalanceCents,
} from "../src/lib/parent-billing-visibility";

test("subsidy evidence without a separated agency ledger fails closed", () => {
  assert.equal(hasSubsidyResponsibilityEvidence({ tuitionFundingType: "voucher" }), true);
  assert.equal(parentBalanceNeedsResponsibilityReview({
    accountBalanceCents: 157_241,
    agencyLedgerEntries: [],
    responsibilityEvidence: [{ tags: ["subsidy"] }],
  }), true);
  assert.equal(parentBalanceNeedsResponsibilityReview({
    accountBalanceCents: 157_241,
    agencyLedgerEntries: [{ type: "agency_receivable", sourceSystem: "bee_suite", amountCents: 120_000 }],
    responsibilityEvidence: [{ tags: ["subsidy"] }],
  }), false);
});

test("parent billing balance excludes the agency receivable while it remains unpaid", () => {
  assert.equal(parentVisibleBillingBalanceCents({
    accountBalanceCents: 20_500,
    agencyLedgerEntries: [
      { type: "agency_voucher_credit", sourceSystem: "bee_suite", amountCents: 18_000 },
    ],
  }), 2_500);
});

test("parent billing balance stays on the family copay after the agency pays", () => {
  assert.equal(parentVisibleBillingBalanceCents({
    accountBalanceCents: 2_500,
    agencyLedgerEntries: [
      { type: "agency_voucher_credit", sourceSystem: "bee_suite", amountCents: 18_000 },
      { type: "agency_payment", sourceSystem: "subsidy_agency", amountCents: -18_000 },
    ],
  }), 2_500);
});

test("a posted agency payment without a separate receivable stays credited to the family balance", () => {
  assert.equal(parentVisibleBillingBalanceCents({
    accountBalanceCents: 10_000,
    agencyLedgerEntries: [
      { type: "agency_payment", sourceSystem: "subsidy_agency", amountCents: -40_000 },
    ],
  }), 10_000);
});

test("parent billing visibility recognizes explicit agency sources and hides agency payments", () => {
  assert.equal(isAgencyOnlyLedgerEntry({ type: "credit", sourceSystem: "subsidy_agency" }), true);
  assert.equal(isAgencyOnlyLedgerEntry({ type: "payment", sourceSystem: "stripe" }), false);
  assert.equal(isParentVisiblePayment({ provider: "subsidy_agency" }), false);
  assert.equal(isParentVisiblePayment({ provider: "stripe" }), true);
});

test("parent checkout cannot charge a negative or agency-only balance", () => {
  assert.equal(parentPaymentAmountCents({
    accountBalanceCents: 18_000,
    agencyLedgerEntries: [
      { type: "agency_receivable", sourceSystem: "bee_suite", amountCents: 18_000 },
    ],
  }), 0);
  assert.equal(parentPaymentAmountCents({
    accountBalanceCents: 1_000,
    agencyLedgerEntries: [
      { type: "agency_receivable", sourceSystem: "bee_suite", amountCents: 2_500 },
    ],
  }), 0);
});
