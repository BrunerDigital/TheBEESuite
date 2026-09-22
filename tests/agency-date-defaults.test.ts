import assert from "node:assert/strict";
import test from "node:test";
import { agencyClaimServiceStartMin, agencyDateDefault } from "@/lib/agency-date-defaults";

test("claim lookback uses the earlier of coverage start and the school's today minus 60 calendar days", () => {
  const now = new Date("2026-09-22T04:30:00.000Z");
  assert.equal(agencyClaimServiceStartMin("2026-09-01", "America/New_York", now), "2026-07-03");
  assert.equal(agencyClaimServiceStartMin("2026-10-01", "America/New_York", now), "2026-07-24");
  assert.equal(agencyClaimServiceStartMin("2026-10-01", "America/Los_Angeles", now), "2026-07-23");
  assert.equal(agencyClaimServiceStartMin(new Date("2024-03-01T12:00:00Z"), "America/New_York", now), "2024-01-01");
});

test("agency date defaults follow the selected school's local calendar day", () => {
  const instant = new Date("2026-09-10T04:30:00.000Z");

  assert.equal(agencyDateDefault("America/New_York", 0, instant), "2026-09-10");
  assert.equal(agencyDateDefault("America/Los_Angeles", 0, instant), "2026-09-09");
});

test("agency follow-up dates advance in calendar days without shifting time zones", () => {
  const instant = new Date("2026-09-11T01:00:00.000Z");

  assert.equal(agencyDateDefault("America/New_York", 7, instant), "2026-09-17");
});
