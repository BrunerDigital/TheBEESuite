import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildPayrollDayRows } from "@/components/staff-management-panel";
import { formatZonedTimestamp, zonedDateInputToUtc, zonedDateKey, zonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";

test("payroll timecards include every calendar day in the selected period", () => {
  const rows = buildPayrollDayRows({
    startDate: "2026-07-06",
    endDate: "2026-07-19",
    timeZone: "America/Indiana/Indianapolis",
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

test("Kokomo payroll uses Eastern school-local dates and edit times", () => {
  const timeZone = "America/Indiana/Indianapolis";
  const instant = "2026-07-07T04:30:00.000Z";

  assert.equal(zonedDateKey(instant, timeZone), "2026-07-07");
  assert.equal(zonedDateKey(instant, "America/Los_Angeles"), "2026-07-06");
  assert.equal(zonedDateTimeLocalValue(instant, timeZone), "2026-07-07T00:30");
  assert.equal(zonedDateTimeLocalToUtc("2026-07-07T00:30", timeZone)?.toISOString(), instant);
  assert.equal(zonedDateInputToUtc("2026-07-07", timeZone)?.toISOString(), "2026-07-07T04:00:00.000Z");
  assert.equal(zonedDateInputToUtc("2026-07-07", timeZone, true)?.toISOString(), "2026-07-08T03:59:59.999Z");
  assert.match(formatZonedTimestamp(instant, timeZone), /Jul 7, 2026, 12:30 AM EDT/);
});

test("school-local datetime inputs round trip across daylight saving changes", () => {
  assert.equal(
    zonedDateTimeLocalToUtc("2026-01-15T08:00", "America/Indiana/Indianapolis")?.toISOString(),
    "2026-01-15T13:00:00.000Z",
  );
  assert.equal(
    zonedDateTimeLocalToUtc("2026-07-15T08:00", "America/Indiana/Indianapolis")?.toISOString(),
    "2026-07-15T12:00:00.000Z",
  );
});

test("timestamp entry points use school-local conversion rather than browser-local parsing", async () => {
  const files = [
    "src/components/campaign-workspace.tsx",
    "src/components/crm/crm-workspace.tsx",
    "src/components/emergency-drill-log-panel.tsx",
    "src/components/medication-log-panel.tsx",
    "src/components/reputation-workspace.tsx",
    "src/components/social-publishing-studio.tsx",
    "src/components/staff-management-panel.tsx",
    "src/components/teacher-mobile-workspace.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /zonedDateTimeLocalToUtc/, `${file} should convert school-local datetime inputs`);
  }
});

test("payroll print CSS excludes summaries and collapses non-print layout", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  assert.match(source, /staff-payroll-print-summary[\s\S]*display: none !important/);
  assert.match(source, /size: landscape/);
  assert.match(source, /not\(:has\(\.staff-payroll-print-area\)\)/);
  assert.doesNotMatch(source, /body:has\(\.staff-payroll-print-area\) \* \{\s*visibility: hidden/);
});

test("payroll rows exclude previous employees", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  const payrollRows = source.slice(source.indexOf("const staffHoursRows"), source.indexOf("const staffHoursTotalMinutes"));
  assert.match(payrollRows, /return activeStaff/);
  assert.doesNotMatch(payrollRows, /return allTeacherRows/);
});

test("manual payroll edits cannot be lost by switching staff before saving", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  assert.match(source, /disabled=\{clockEditsDirty\}/);
  assert.match(source, /Save or reload the current employee's punches/);
  assert.match(source, /Not saved:/);
  assert.match(source, /punches are saved/);
});
