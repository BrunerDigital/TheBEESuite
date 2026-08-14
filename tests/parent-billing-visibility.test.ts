import assert from "node:assert/strict";
import test from "node:test";
import {
  hasConfirmedFamilyResponsibility,
  hasSubsidyResponsibilityEvidence,
  isAgencyOnlyLedgerEntry,
  isParentVisiblePayment,
  parentBalanceNeedsResponsibilityReview,
  parentPaymentAmountCents,
  parentVisibleBillingBalanceCents,
  withoutConfirmedFamilyResponsibility,
} from "../src/lib/parent-billing-visibility";

test("subsidy evidence without a separated agency ledger fails closed", () => {
  assert.equal(hasSubsidyResponsibilityEvidence({ tuitionFundingType: "voucher" }), true);
  assert.equal(hasSubsidyResponsibilityEvidence({ tuitionFundingType: "family" }), false);
  assert.equal(hasSubsidyResponsibilityEvidence({ agencyResponsibilityCents: 0 }), false);
  assert.equal(hasSubsidyResponsibilityEvidence({ agencyResponsibilityCents: 12_000 }), true);
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

test("an exact reviewed family-responsibility balance is parent visible", () => {
  const reviewedEvidence = {
    balanceReconciliation: {
      familyResponsibilityConfirmed: true,
      familyResponsibilityBalanceCents: 5_200,
      familyResponsibilityConfirmationSourceSha256: "6c95575a1aa967606605904e24e29135ef533f0dd47a10f0aa811d22e2afe418",
      familyResponsibilityAuthorization: "user_requested_live_for_director_and_family",
      familyResponsibilityConfirmationLedgerEntryId: "ledger-reviewed-balance",
      autopayActivated: false,
    },
  };
  assert.equal(hasConfirmedFamilyResponsibility(5_200, "ledger-reviewed-balance", reviewedEvidence), true);
  assert.equal(parentBalanceNeedsResponsibilityReview({
    accountBalanceCents: 5_200,
    agencyLedgerEntries: [],
    responsibilityEvidence: [{ tuitionPlanName: "CCMS COPAY" }, reviewedEvidence],
  }), true);
  assert.equal(parentBalanceNeedsResponsibilityReview({
    accountBalanceCents: 5_300,
    agencyLedgerEntries: [],
    responsibilityEvidence: [{ tuitionPlanName: "CCMS COPAY" }, reviewedEvidence],
  }), true);
  assert.equal(hasConfirmedFamilyResponsibility(5_300, "ledger-reviewed-balance", reviewedEvidence), false);
  assert.equal(hasConfirmedFamilyResponsibility(5_200, "ledger-new-balance", reviewedEvidence), false);
  assert.equal(hasConfirmedFamilyResponsibility(5_200, "ledger-reviewed-balance", {
    balanceReconciliation: {
      ...reviewedEvidence.balanceReconciliation,
      familyResponsibilityConfirmationSourceSha256: "unreviewed-source",
    },
  }), false);
  assert.equal(hasConfirmedFamilyResponsibility(5_200, "ledger-reviewed-balance", {
    balanceReconciliation: {
      ...reviewedEvidence.balanceReconciliation,
      familyResponsibilityAuthorization: "manual_edit",
    },
  }), false);
  assert.equal(hasConfirmedFamilyResponsibility(
    5_200,
    "ledger-reviewed-balance",
    withoutConfirmedFamilyResponsibility(reviewedEvidence),
  ), false);
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

test("a parent can choose an account payment while the agency split is under review", () => {
  assert.equal(parentPaymentAmountCents({
    accountBalanceCents: 50_000,
    agencyLedgerEntries: [],
    requestedAmountCents: 7_500,
    responsibilityReviewRequired: true,
  }), 7_500);
  assert.equal(parentPaymentAmountCents({
    accountBalanceCents: 50_000,
    agencyLedgerEntries: [],
    requestedAmountCents: 75_000,
    responsibilityReviewRequired: true,
  }), 50_000);
  assert.equal(parentPaymentAmountCents({
    accountBalanceCents: 50_000,
    agencyLedgerEntries: [],
    responsibilityReviewRequired: true,
  }), 0);
});
