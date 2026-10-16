import assert from "node:assert/strict";
import test from "node:test";
import { agencyServiceRegister, type RegisterClaim, type RegisterAuthorization } from "../src/lib/agency-service-register";
import { contractReportRange } from "../src/lib/agency-contract-report";

const range = contractReportRange("2026-10-05", "2026-10-11")!;
const authorization: RegisterAuthorization = { id: "a", coverageStart: new Date("2026-10-01"), coverageEnd: new Date("2026-10-31"), status: "active", agencyProgram: { name: "Agency" }, child: { fullName: "Child" } };
const claim: RegisterClaim = { id: "c", number: "C1", authorizationId: "a", status: "draft", servicePeriodStart: new Date("2026-10-05"), servicePeriodEnd: new Date("2026-10-11"), claimedCents: 20000, approvedCents: null, paidCents: 0, agencyProgram: { name: "Agency" }, authorization: { child: { fullName: "Child" } }, remittances: [] };
test("prepared claims are visible before cash but are not approved balances", () => {
  const result = agencyServiceRegister([claim], [authorization], range);
  assert.equal(result.rows[0].stage, "Prepared — not submitted");
  assert.equal(result.totals.preparedCents, 20000);
  assert.equal(result.totals.approvedCents, 0); assert.equal(result.rows[0].approvedRemainingCents, null);
  assert.equal(result.gaps.length, 0); assert.match(result.note, /Family copays are excluded/); assert.match(result.note, /excludes ledger adjustments, write-offs, and unapplied cash/); assert.match(result.note, /not the agency ledger balance/);
});
test("submitted, approved, denied, and void records have distinct accounting meaning", () => {
  const result = agencyServiceRegister([
    { ...claim, id: "submitted", status: "submitted" },
    { ...claim, id: "approved", status: "approved", approvedCents: 17000 },
    { ...claim, id: "denied", status: "denied" }, { ...claim, id: "void", status: "void" },
  ], [], range);
  assert.equal(result.rows.length, 4); assert.equal(result.totals.preparedCents, 0);
  assert.equal(result.totals.submittedCents, 20000); assert.equal(result.totals.approvedCents, 17000);
  assert.equal(result.totals.approvedRemainingCents, 17000);
});
test("partial, full and reversed receipts use active amounts once and flag mismatches", () => {
  const partial = { ...claim, status: "partially_paid", approvedCents: 18000, paidCents: 5000,
    remittances: [{ amountCents: 5000, reversedAt: null }, { amountCents: 4000, reversedAt: new Date() }] };
  const result = agencyServiceRegister([partial, partial], [], range);
  assert.equal(result.rows.length, 1); assert.equal(result.totals.paymentsAppliedCents, 5000); assert.equal(result.totals.approvedRemainingCents, 13000);
  assert.equal(agencyServiceRegister([{ ...partial, status: "paid", paidCents: 18000, remittances: [{ amountCents: 18000, reversedAt: null }] }], [], range).totals.approvedRemainingCents, 0);
  const mismatch = agencyServiceRegister([{ ...partial, paidCents: 9000 }], [], range);
  assert.match(mismatch.rows[0].review.join(" "), /differs/);
  assert.equal(agencyServiceRegister([{ ...partial, approvedCents: null }], [], range).rows[0].approvedRemainingCents, null);
});
test("cross-week claims retain full ranges and are never fabricated into weekly allocations", () => {
  const result = agencyServiceRegister([{ ...claim, servicePeriodStart: new Date("2026-10-01"), servicePeriodEnd: new Date("2026-10-18"), claimedCents: 40000 },
    { ...claim, id: "outside", servicePeriodStart: new Date("2026-11-01"), servicePeriodEnd: new Date("2026-11-07") }], [], range);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].crossesSelection, true);
  assert.equal(result.rows[0].serviceStart, "2026-10-01"); assert.equal(result.totals.preparedCents, 40000);
  assert.match(result.note, /Do not add overlapping reports together/);
});
test("coverage gaps are date-only, authorization-specific and not predicted money", () => {
  const first = { ...claim, servicePeriodEnd: new Date("2026-10-06T12:00:00Z") };
  const last = { ...claim, id: "last", servicePeriodStart: new Date("2026-10-09"), servicePeriodEnd: new Date("2026-10-11") };
  const result = agencyServiceRegister([first, last, { ...claim, id: "void", status: "void" }], [authorization, { ...authorization, id: "other" }], range);
  assert.deepEqual(result.gaps.map(gap => [gap.authorizationId, gap.start, gap.end]), [["a", "2026-10-07", "2026-10-08"], ["other", "2026-10-05", "2026-10-11"]]);
  assert.equal(agencyServiceRegister([], [{ ...authorization, status: "revoked" }], range).gaps.length, 0);
  const clipped = agencyServiceRegister([], [{ ...authorization, coverageStart: new Date("2026-10-11T12:00:00Z") }], range);
  assert.equal(clipped.gaps[0].start, "2026-10-11"); assert.equal(clipped.gaps[0].end, "2026-10-11");
});
test("overlapping source claims do not create false coverage gaps", () => {
  const result = agencyServiceRegister([{ ...claim, servicePeriodEnd: new Date("2026-10-08") }, { ...claim, id: "overlap", servicePeriodStart: new Date("2026-10-07") }], [authorization], range);
  assert.equal(result.gaps.length, 0);
  // Both actual records remain visible for review; no assumed financial deduplication.
  assert.equal(result.rows.length, 2);
  assert.match(result.rows[0].review.join(" "), /overlaps/);
});
