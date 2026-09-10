import assert from "node:assert/strict";
import test from "node:test";
import { agencyDateDefault } from "@/lib/agency-date-defaults";

test("agency date defaults follow the selected school's local calendar day", () => {
  const instant = new Date("2026-09-10T04:30:00.000Z");

  assert.equal(agencyDateDefault("America/New_York", 0, instant), "2026-09-10");
  assert.equal(agencyDateDefault("America/Los_Angeles", 0, instant), "2026-09-09");
});

test("agency follow-up dates advance in calendar days without shifting time zones", () => {
  const instant = new Date("2026-09-11T01:00:00.000Z");

  assert.equal(agencyDateDefault("America/New_York", 7, instant), "2026-09-17");
});
