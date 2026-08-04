import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildPayrollDayRows,
  clampClockEditDateTimeToPayPeriod,
  clockEditRowsFromSavedEvents,
  clockEditRowsForEditor,
  filterClockEditRowsByPayPeriod,
  filterPayrollStaffByCenter,
} from "@/components/staff-management-panel";
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

test("staff clock punches are viewed by pay period without dropping other periods", () => {
  const punches = [
    { id: "before", occurredAt: "2026-07-05T16:30" },
    { id: "start", occurredAt: "2026-07-06T08:00" },
    { id: "end", occurredAt: "2026-07-19T17:00" },
    { id: "after", occurredAt: "2026-07-20T08:00" },
  ];

  assert.deepEqual(
    filterClockEditRowsByPayPeriod(punches, "2026-07-06", "2026-07-19").map((row) => row.id),
    ["start", "end"],
  );
  assert.equal(punches.length, 4);
  assert.equal(
    clampClockEditDateTimeToPayPeriod("2026-07-30T09:15", "2026-07-06", "2026-07-19"),
    "2026-07-19T09:15",
  );

  assert.deepEqual(
    clockEditRowsForEditor(punches, "2026-07-06", "2026-07-19", new Set(["before", "after"]))
      .map((row) => row.id),
    ["before", "start", "end", "after"],
  );
});

test("saved clock rows keep their editor identity while displaying canonical school-local time", () => {
  const rows = clockEditRowsFromSavedEvents(
    [{ action: "clock_in", occurredAt: "2026-03-08T07:30:00.000Z", timeZone: "America/Indiana/Indianapolis", notes: null }],
    "America/Indiana/Indianapolis",
    [{ id: "edited-row", action: "clock_in", occurredAt: "2026-03-08T02:30", notes: "" }],
  );

  assert.equal(rows[0]?.id, "edited-row");
  assert.equal(rows[0]?.occurredAt, "2026-03-08T03:30");
});

test("manual punch visibility protection is school-agnostic", () => {
  const schools = [
    { timeZone: "America/Indiana/Indianapolis", startDate: "2026-08-03", endDate: "2026-08-16" },
    { timeZone: "America/Chicago", startDate: "2026-08-02", endDate: "2026-08-15" },
    { timeZone: "America/Denver", startDate: "2026-08-01", endDate: "2026-08-14" },
  ];

  for (const [index, school] of schools.entries()) {
    const rowId = `school-${index}-manual-punch`;
    const localValue = "2026-07-31T08:00";
    const savedInstant = zonedDateTimeLocalToUtc(localValue, school.timeZone);
    assert.ok(savedInstant);

    const savedRows = clockEditRowsFromSavedEvents(
      [{ action: "clock_in", occurredAt: savedInstant.toISOString(), timeZone: school.timeZone, notes: "Manual correction" }],
      school.timeZone,
      [{ id: rowId, action: "clock_in", occurredAt: localValue, notes: "Manual correction" }],
    );

    assert.equal(savedRows[0]?.id, rowId);
    assert.deepEqual(
      clockEditRowsForEditor(savedRows, school.startDate, school.endDate, new Set([rowId])).map((row) => row.id),
      [rowId],
    );
  }
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

test("payroll print CSS excludes the center summary and collapses non-print layout", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  assert.match(source, /staff-payroll-print-summary[\s\S]*display: none !important/);
  assert.match(source, /size: landscape/);
  assert.match(source, /not\(:has\(\.staff-payroll-print-area\)\)/);
  assert.doesNotMatch(source, /body:has\(\.staff-payroll-print-area\) \* \{\s*visibility: hidden/);
});

test("submitted payroll reports include every employee shown for the pay period", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  const sendSummary = source.slice(source.indexOf("function sendPayrollSummary"), source.indexOf("function saveTeacher"));
  assert.match(sendSummary, /employeeSummaries: rows\.map/);
  assert.match(sendSummary, /employeeName: row\.name/);
  assert.match(sendSummary, /regularMinutes: row\.regularMinutes/);
  assert.match(sendSummary, /overtimeMinutes: row\.overtimeMinutes/);
});

test("executives can filter, open, and print school-specific payroll reports", async () => {
  const source = await readFile("src/components/dashboard.tsx", "utf8");
  assert.match(source, /payrollSchoolFilter/);
  assert.match(source, /summary\.centerId === payrollSchoolFilter/);
  assert.match(source, /Open report/);
  assert.match(source, /Print report/);
  assert.match(source, /Employee payroll summary/);
  assert.match(source, /older total-only submission/);
  assert.match(source, /send this payroll summary again/);
});

test("print reports remove hidden dashboard layout instead of leaving blank pages", async () => {
  const source = await readFile("src/components/printable-report.tsx", "utf8");
  assert.match(source, /not\(:has\(\.bee-print-report-active\)\)[\s\S]*display: none !important/);
  assert.match(source, /\.bee-print-report-active \{[\s\S]*position: static !important/);
  assert.doesNotMatch(source, /\.bee-print-report-active \{[\s\S]*position: absolute !important/);
});

test("payroll rows include previous employees only when they worked in the selected period", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  const payrollRows = source.slice(source.indexOf("const staffHoursRows"), source.indexOf("const staffHoursTotalMinutes"));
  assert.match(payrollRows, /filterPayrollStaffByCenter\(allTeacherRows, payrollCenterId\)/);
  assert.match(payrollRows, /\.filter\(\(row\) => row\.active \|\| row\.shiftRows\.length > 0\)/);
});

test("executive payroll school filter scopes time card rows", () => {
  const staff = [
    { id: "one", centerId: "school-a" },
    { id: "two", centerId: "school-b" },
  ];

  assert.deepEqual(filterPayrollStaffByCenter(staff, "all").map((row) => row.id), ["one", "two"]);
  assert.deepEqual(filterPayrollStaffByCenter(staff, "school-b").map((row) => row.id), ["two"]);
  assert.deepEqual(filterPayrollStaffByCenter(staff, "not-authorized").map((row) => row.id), []);
});

test("executive payroll school filter scopes screen, print, and submitted summaries", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  assert.match(source, /payroll-school-filter/);
  assert.match(source, /filterPayrollStaffByCenter\(allTeacherRows, payrollCenterId\)/);
  assert.match(source, /const centerSummaries = payrollCenters\.map/);
  assert.match(source, /payrollCenters\.length.*selected school/);
});

test("manual payroll edits cannot be lost by switching staff before saving", async () => {
  const source = await readFile("src/components/staff-management-panel.tsx", "utf8");
  assert.match(source, /disabled=\{clockEditsDirty\}/);
  assert.match(source, /Save or reload the current employee's punches/);
  assert.match(source, /Not saved:/);
  assert.match(source, /punches are saved/);
  assert.match(source, /for \(const row of clockEditRows\)/);
  assert.match(source, /sortClockEditRows\(visibleClockEditRows\)/);
  assert.match(source, /outside this period preserved/);
  assert.match(source, /outside this period kept visible/);
  assert.match(source, /stays visible until you change the pay period or employee/);
});
