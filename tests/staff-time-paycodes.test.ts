import assert from "node:assert/strict";
import test from "node:test";
import { nextClockEditAction, buildPayrollDayRows, buildPayrollShiftRows, buildPayCodeSummaries, clockEditRowsFromSavedEvents } from "@/components/staff-management-panel";
import { normalizeStaffClockEventEdits, readStaffClockState, readStaffClockSummary, staffClockEditFields, staffClockFields } from "@/lib/staff-kiosk";

test("multiple codes survive edits, adjacent intervals, new punches, and printed/submitted totals", () => {
  const normalized = normalizeStaffClockEventEdits([
    { action: "clock_in", occurredAt: "2026-09-21T12:00:00Z" },
    { action: "clock_in", occurredAt: "2026-09-21T16:00:00Z", payCode: "Training at School" },
    { action: "clock_out", occurredAt: "2026-09-21T16:00:00Z" },
    { action: "clock_out", occurredAt: "2026-09-21T18:00:00Z" },
  ]);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  const edited = staffClockEditFields({ customFields: { retained: "history" }, events: normalized.events, editedAt: new Date("2026-09-21T19:00:00Z") });
  const punched = staffClockFields({ customFields: edited, action: "clock_in", occurredAt: new Date("2026-09-22T12:00:00Z") });
  assert.equal(punched.retained, "history");
  const summary = readStaffClockSummary(punched, { now: new Date("2026-09-22T12:00:00Z"), endDate: new Date("2026-09-21T23:59:59Z") });
  const shifts = buildPayrollShiftRows(summary.shifts, "America/Indiana/Indianapolis");
  const codes = buildPayCodeSummaries({ shifts, payCode: "Teacher", department: "Preschool" });
  assert.deepEqual(codes.map(({ payCode, totalMinutes }) => ({ payCode, totalMinutes })), [
    { payCode: "Teacher", totalMinutes: 240 }, { payCode: "Training at School", totalMinutes: 120 },
  ]);
  const days = buildPayrollDayRows({ startDate: "2026-09-21", endDate: "2026-09-22", shifts, timeZone: "America/Indiana/Indianapolis" });
  assert.equal(days.length, 3);
  assert.equal(days[1].payCode, "Training at School");
  assert.equal(days[2].statusLabel, "No time");
  const rows = clockEditRowsFromSavedEvents(normalized.events, "UTC", []);
  const saved = clockEditRowsFromSavedEvents(normalized.events, "UTC", rows);
  assert.equal(new Set(saved.map(row => row.id)).size, 4);
  assert.equal(saved.find(row => row.payCode)?.payCode, "Training at School");
});

test("paid leave does not consume worked overtime allowance but training does", () => {
  const events = [
    { action: "clock_in", occurredAt: "2026-09-21T08:00:00Z", payCode: "PTO" },
    { action: "clock_out", occurredAt: "2026-09-21T16:00:00Z" },
    ...[22, 23, 24, 25, 26].flatMap(day => [
      { action: "clock_in", occurredAt: `2026-09-${day}T08:00:00Z`, payCode: "Training at home" },
      { action: "clock_out", occurredAt: `2026-09-${day}T17:00:00Z` },
    ]),
  ];
  const summary = readStaffClockSummary({ timeClock: { events } });
  const shifts = buildPayrollShiftRows(summary.shifts, "UTC");
  assert.equal(shifts[0].overtimeMinutes, 0);
  assert.equal(shifts.reduce((sum, shift) => sum + shift.overtimeMinutes, 0), 300);
  assert.equal(shifts.reduce((sum, shift) => sum + shift.regularMinutes, 0), 2880);
});

test("invalid codes, zero-duration intervals, and open paid leave fail validation", () => {
  for (const payCode of ["unknown", "PTO", "Bereavement", "Holiday", "Holiday Voucher"]) {
    assert.equal(normalizeStaffClockEventEdits([{ action: "clock_in", occurredAt: "2026-09-21T08:00:00Z", payCode }]).ok, false);
  }
  assert.equal(normalizeStaffClockEventEdits([
    { action: "clock_in", occurredAt: "2026-09-21T08:00:00Z" },
    { action: "clock_out", occurredAt: "2026-09-21T08:00:00Z" },
  ]).ok, false);
});


test("a category change at the same instant retains the new open clock state", () => {
  const normalized = normalizeStaffClockEventEdits([
    { action: "clock_in", occurredAt: "2026-09-21T12:00:00Z" },
    { action: "clock_out", occurredAt: "2026-09-21T16:00:00Z" },
    { action: "clock_in", occurredAt: "2026-09-21T16:00:00Z", payCode: "Staff Meeting at School" },
  ]);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  const fields = staffClockEditFields({ customFields: {}, events: normalized.events, editedAt: new Date("2026-09-21T17:00:00Z") });
  assert.equal(readStaffClockState(fields).status, "clocked_in");
  const savedRows = clockEditRowsFromSavedEvents(readStaffClockState(fields).events, "UTC", []);
  assert.deepEqual(savedRows.map(row => row.action), ["clock_in", "clock_out", "clock_in"]);
  assert.equal(nextClockEditAction(savedRows), "clock_out");
  assert.equal(nextClockEditAction([...savedRows].reverse()), "clock_out");
  assert.equal(readStaffClockSummary(fields, { now: new Date("2026-09-21T17:00:00Z") }).openShiftMinutes, 60);
});
