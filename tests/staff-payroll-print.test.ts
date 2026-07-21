import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildPayrollDayRows } from "@/components/staff-management-panel";

test("payroll timecards include every calendar day in the selected period", () => {
  const rows = buildPayrollDayRows({
    startDate: new Date(2026, 6, 6),
    endDate: new Date(2026, 6, 19, 23, 59, 59),
    shifts: [{
      clockInAt: "2026-07-07T08:00:00-04:00",
      clockOutAt: "2026-07-07T16:00:00-04:00",
      minutes: 480,
      status: "closed",
      notes: null,
      dateLabel: "07/07/2026",
      weekLabel: "07/06/2026 - 07/12/2026",
      clockInLabel: "8:00 AM",
      clockOutLabel: "4:00 PM",
      regularMinutes: 480,
      overtimeMinutes: 0,
    }],
  });

  assert.equal(rows.length, 14);
  assert.equal(rows[0]?.statusLabel, "No time");
  assert.equal(rows[1]?.totalMinutes, 480);
  assert.equal(rows[13]?.dateKey, "2026-07-19");
});

test("payroll print CSS excludes summaries and collapses non-print layout", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  assert.match(source, /staff-payroll-print-summary[\s\S]*display: none !important/);
  assert.match(source, /size: landscape/);
  assert.match(source, /not\(:has\(\.staff-payroll-print-area\)\)/);
  assert.doesNotMatch(source, /body:has\(\.staff-payroll-print-area\) \* \{\s*visibility: hidden/);
});
