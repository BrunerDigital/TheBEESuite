import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyAgingBucket,
  agencyBatchFingerprint,
  agencyBatchStatus,
  agencyRemittanceReferenceKey,
  canReviewAgencyPosting,
  signedAgencyAdjustmentCents,
} from "../src/lib/agency-reconciliation";

test("agency remittance references normalize into a deterministic account-scoped key", () => {
  assert.equal(agencyRemittanceReferenceKey({ paymentMethod: "ACH", externalReference: " trace  100 " }), "ach:TRACE 100");
});

test("agency batch fingerprints ignore allocation order but not material values", () => {
  const base = {
    centerId: "center_1",
    agencyProgramId: "program_1",
    externalReference: "ACH-100",
    paidAt: "2026-09-03T00:00:00.000Z",
    paymentMethod: "ach",
    totalCents: 12_500,
  };
  const first = agencyBatchFingerprint({ ...base, allocations: [{ claimId: "b", amountCents: 2_500 }, { claimId: "a", amountCents: 10_000 }] });
  const reordered = agencyBatchFingerprint({ ...base, allocations: [{ claimId: "a", amountCents: 10_000 }, { claimId: "b", amountCents: 2_500 }] });
  const changed = agencyBatchFingerprint({ ...base, totalCents: 12_501, allocations: [{ claimId: "a", amountCents: 10_000 }, { claimId: "b", amountCents: 2_500 }] });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("agency batch status distinguishes unapplied cash", () => {
  assert.equal(agencyBatchStatus({ totalCents: 10_000, allocatedCents: 0 }), "unmatched");
  assert.equal(agencyBatchStatus({ totalCents: 10_000, allocatedCents: 4_000 }), "partially_allocated");
  assert.equal(agencyBatchStatus({ totalCents: 10_000, allocatedCents: 10_000 }), "reconciled");
  assert.equal(agencyBatchStatus({ totalCents: 10_000, allocatedCents: 10_000, hasException: true }), "exception");
});

test("agency adjustments use accounting signs", () => {
  assert.equal(signedAgencyAdjustmentCents("write_off", 500), -500);
  assert.equal(signedAgencyAdjustmentCents("overpayment", 500), -500);
  assert.equal(signedAgencyAdjustmentCents("recoupment", 500), 500);
  assert.equal(signedAgencyAdjustmentCents("correction_increase", 500), 500);
  assert.equal(signedAgencyAdjustmentCents("unknown", 500), 0);
});

test("agency aging uses UTC calendar days", () => {
  const asOf = new Date("2026-09-03T18:00:00.000Z");
  assert.equal(agencyAgingBucket("2026-09-03T00:00:00.000Z", asOf), "current");
  assert.equal(agencyAgingBucket("2026-08-20T00:00:00.000Z", asOf), "days_1_30");
  assert.equal(agencyAgingBucket("2026-07-20T00:00:00.000Z", asOf), "days_31_60");
  assert.equal(agencyAgingBucket("2026-06-20T00:00:00.000Z", asOf), "days_61_90");
  assert.equal(agencyAgingBucket("2026-05-01T00:00:00.000Z", asOf), "days_91_plus");
});

test("agency postings require an accounting reviewer who is not the preparer", () => {
  assert.equal(canReviewAgencyPosting({ role: "BILLING_ADMIN", reviewerId: "reviewer", requestedById: "preparer" }), true);
  assert.equal(canReviewAgencyPosting({ role: "CENTER_DIRECTOR", reviewerId: "reviewer", requestedById: "preparer" }), false);
  assert.equal(canReviewAgencyPosting({ role: "BILLING_ADMIN", reviewerId: "same", requestedById: "same" }), false);
});
