import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyAgingBucket,
  agencyAdjustmentFingerprint,
  agencyAllocationFingerprint,
  agencyBatchFingerprint,
  agencyBatchStatus,
  agencyLedgerRunningBalances,
  agencyRemittanceReferenceKey,
  agencyUnappliedCashBalance,
  agencyUtcCalendarRange,
  canReviewAgencyPosting,
  isAgencyClaimOverdue,
  signedAgencyAdjustmentCents,
} from "../src/lib/agency-reconciliation";
import { persistentAgencyRetryKey, rotateAgencyRetryKey } from "../src/lib/agency-retry-key";

test("agency retry keys persist across remounts and rotate only when explicitly completed or abandoned", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } as Storage,
  });
  try {
    const first = persistentAgencyRetryKey("agency:test");
    assert.equal(persistentAgencyRetryKey("agency:test"), first);
    const replacement = rotateAgencyRetryKey("agency:test");
    assert.notEqual(replacement, first);
    assert.equal(persistentAgencyRetryKey("agency:test"), replacement);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

test("agency retry keys stay stable when session storage is unavailable", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
    } as unknown as Storage,
  });
  try {
    const storageKey = "agency:test:restricted-storage";
    const first = persistentAgencyRetryKey(storageKey);
    assert.equal(persistentAgencyRetryKey(storageKey), first);
    const replacement = rotateAgencyRetryKey(storageKey);
    assert.notEqual(replacement, first);
    assert.equal(persistentAgencyRetryKey(storageKey), replacement);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

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
  const changedEvidence = agencyBatchFingerprint({ ...base, evidenceReference: "advice-2", allocations: [{ claimId: "a", amountCents: 10_000 }, { claimId: "b", amountCents: 2_500 }] });
  const changedAllocationNote = agencyBatchFingerprint({ ...base, allocations: [{ claimId: "a", amountCents: 10_000, notes: "Corrected allocation" }, { claimId: "b", amountCents: 2_500 }] });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.notEqual(first, changedEvidence);
  assert.notEqual(first, changedAllocationNote);
});

test("agency request fingerprints cover notes, evidence, and follow-up inputs", () => {
  const allocation = agencyAllocationFingerprint({ batchId: "batch_1", claimId: "claim_1", amountCents: 1_000, notes: "September units" });
  assert.notEqual(allocation, agencyAllocationFingerprint({ batchId: "batch_1", claimId: "claim_1", amountCents: 1_000, notes: "Corrected September units" }));

  const adjustment = {
    ledgerAccountId: "account_1",
    type: "write_off",
    amountCents: -1_000,
    effectiveAt: "2026-09-03T00:00:00.000Z",
    reason: "Agency denial",
    evidenceName: "Denial notice",
    evidenceReference: "notice-1",
    followUpDueAt: "2026-09-10T00:00:00.000Z",
  };
  const original = agencyAdjustmentFingerprint(adjustment);
  assert.notEqual(original, agencyAdjustmentFingerprint({ ...adjustment, evidenceReference: "notice-2" }));
  assert.notEqual(original, agencyAdjustmentFingerprint({ ...adjustment, followUpDueAt: "2026-09-11T00:00:00.000Z" }));
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
  assert.equal(isAgencyClaimOverdue("2026-09-03T00:00:00.000Z", asOf), false);
  assert.equal(isAgencyClaimOverdue("2026-09-02T23:59:59.999Z", asOf), true);
  assert.equal(isAgencyClaimOverdue(null, asOf), false);
});

test("agency accounting ranges include both requested UTC calendar dates", () => {
  const range = agencyUtcCalendarRange("2026-09-01T12:00:00.000Z", "2026-09-30T12:00:00.000Z");
  assert.equal(range.startInclusive.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(range.endExclusive.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("agency ledger running balances recalculate every later row after a backdated entry", () => {
  assert.deepEqual(agencyLedgerRunningBalances([
    { id: "opening", amountCents: 10_000 },
    { id: "backdated", amountCents: 2_500 },
    { id: "later-payment", amountCents: -4_000 },
  ]), [
    { id: "opening", balanceAfterCents: 10_000 },
    { id: "backdated", balanceAfterCents: 12_500 },
    { id: "later-payment", balanceAfterCents: 8_500 },
  ]);
});

test("agency unapplied cash is reconstructed from immutable effective-dated ledger activity", () => {
  const received = [{ type: "unapplied_cash", amountCents: -10_000 }];
  const partlyAllocated = [...received, { type: "unapplied_cash_allocation", amountCents: 6_000 }];
  const reversed = [...partlyAllocated, { type: "unapplied_cash_reversal", amountCents: 4_000 }];
  assert.equal(agencyUnappliedCashBalance(received), 10_000);
  assert.equal(agencyUnappliedCashBalance(partlyAllocated), 4_000);
  assert.equal(agencyUnappliedCashBalance(reversed), 0);
});

test("agency postings require an accounting reviewer who is not the preparer", () => {
  assert.equal(canReviewAgencyPosting({ role: "BILLING_ADMIN", reviewerId: "reviewer", requestedById: "preparer" }), true);
  assert.equal(canReviewAgencyPosting({ role: "CENTER_DIRECTOR", reviewerId: "reviewer", requestedById: "preparer" }), false);
  assert.equal(canReviewAgencyPosting({ role: "BILLING_ADMIN", reviewerId: "same", requestedById: "same" }), false);
});
