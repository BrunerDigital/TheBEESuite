import assert from "node:assert/strict";
import test from "node:test";
import {
  readStaffClockState,
  readStaffClockSummary,
  resolveStaffKioskCredential,
  staffKioskPinFields,
  normalizeStaffClockEventEdits,
  staffClockEditFields,
  staffClockFields,
  validateNextStaffClockAction,
  formatStaffHours,
  formatStaffDecimalHours,
  hasLegacyTruncatedStaffClockHistory,
} from "@/lib/staff-kiosk";
import { hashStaffPin } from "@/lib/kiosk";

test("staff kiosk clock state blocks duplicate clock actions", () => {
  const initial = readStaffClockState(null);
  assert.equal(initial.status, "clocked_out");
  assert.deepEqual(validateNextStaffClockAction("clock_out", initial), {
    ok: false,
    error: "Staff member must be clocked in before clock-out.",
  });

  const clockInFields = staffClockFields({
    customFields: null,
    action: "clock_in",
    occurredAt: new Date("2026-06-04T12:00:00.000Z"),
    timeZone: "America/Indiana/Indianapolis",
  });
  const clockedIn = readStaffClockState(clockInFields);
  assert.equal(clockedIn.status, "clocked_in");
  assert.equal(clockedIn.currentClockInAt, "2026-06-04T12:00:00.000Z");
  assert.equal(clockedIn.timeZone, "America/Indiana/Indianapolis");
  assert.equal(clockedIn.events[0]?.timeZone, "America/Indiana/Indianapolis");
  assert.deepEqual(validateNextStaffClockAction("clock_in", clockedIn), {
    ok: false,
    error: "Staff member is already clocked in.",
  });

  const clockOutFields = staffClockFields({
    customFields: clockInFields,
    action: "clock_out",
    occurredAt: new Date("2026-06-04T20:30:00.000Z"),
    notes: "Closing shift",
  });
  const clockedOut = readStaffClockState(clockOutFields);
  assert.equal(clockedOut.status, "clocked_out");
  assert.equal(clockedOut.currentClockInAt, null);
  assert.equal(clockedOut.currentClockOutAt, "2026-06-04T20:30:00.000Z");
  assert.equal(clockedOut.events.length, 2);
  assert.equal(clockedOut.events[0].notes, "Closing shift");
  const summary = readStaffClockSummary(clockOutFields, { now: new Date("2026-06-04T21:00:00.000Z") });
  assert.equal(summary.totalMinutes, 510);
  assert.equal(summary.closedShiftMinutes, 510);
  assert.equal(summary.closedShiftCount, 1);
  assert.equal(summary.openShiftMinutes, 0);
  assert.equal(summary.lastShiftMinutes, 510);
  assert.equal(summary.shifts.length, 1);
  assert.equal(summary.recentShifts[0]?.clockInAt, "2026-06-04T12:00:00.000Z");
  assert.equal(summary.recentShifts[0]?.clockOutAt, "2026-06-04T20:30:00.000Z");
  assert.equal(formatStaffHours(summary.totalMinutes), "8.5h");
  assert.equal(formatStaffDecimalHours(summary.totalMinutes), "8.50");
});

test("staff kiosk summary includes open shifts and date range overlap", () => {
  const fields = staffClockFields({
    customFields: null,
    action: "clock_in",
    occurredAt: new Date("2026-06-04T12:00:00.000Z"),
  });

  const openSummary = readStaffClockSummary(fields, { now: new Date("2026-06-04T15:15:00.000Z") });

  assert.equal(openSummary.totalMinutes, 195);
  assert.equal(openSummary.closedShiftCount, 0);
  assert.equal(openSummary.openShiftMinutes, 195);
  assert.equal(openSummary.openShiftStartedAt, "2026-06-04T12:00:00.000Z");
  assert.equal(openSummary.recentShifts[0]?.status, "open");

  const rangedSummary = readStaffClockSummary(fields, {
    now: new Date("2026-06-04T15:15:00.000Z"),
    startDate: new Date("2026-06-04T14:00:00.000Z"),
    endDate: new Date("2026-06-04T15:00:00.000Z"),
  });

  assert.equal(rangedSummary.totalMinutes, 60);
  assert.equal(rangedSummary.openShiftMinutes, 60);
});

test("director time card edits can split a missed lunch break", () => {
  const normalized = normalizeStaffClockEventEdits([
    { action: "clock_in", occurredAt: "2026-06-22T12:00:00.000Z" },
    { action: "clock_out", occurredAt: "2026-06-22T16:00:00.000Z", notes: "Lunch out" },
    { action: "clock_in", occurredAt: "2026-06-22T16:30:00.000Z", notes: "Lunch return" },
    { action: "clock_out", occurredAt: "2026-06-22T21:00:00.000Z" },
  ], { timeZone: "America/New_York" });

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  const fields = staffClockEditFields({
    customFields: null,
    events: normalized.events,
    editedAt: new Date("2026-06-22T22:00:00.000Z"),
    timeZone: "America/New_York",
  });
  const state = readStaffClockState(fields);
  const summary = readStaffClockSummary(fields, { now: new Date("2026-06-22T22:00:00.000Z") });

  assert.equal(state.status, "clocked_out");
  assert.equal(state.events[0]?.action, "clock_out");
  assert.equal(state.events[0]?.occurredAt, "2026-06-22T21:00:00.000Z");
  assert.equal(summary.closedShiftCount, 2);
  assert.equal(summary.totalMinutes, 510);
  assert.equal(summary.shifts[0]?.minutes, 240);
  assert.equal(summary.shifts[1]?.minutes, 270);
});

test("director time card edits reject invalid punch order", () => {
  const normalized = normalizeStaffClockEventEdits([
    { action: "clock_in", occurredAt: "2026-06-22T12:00:00.000Z" },
    { action: "clock_in", occurredAt: "2026-06-22T16:30:00.000Z" },
  ]);

  assert.deepEqual(normalized, {
    ok: false,
    error: "A clock in must be followed by clock out before another clock in.",
  });
});

test("director time card edits remain available after the legacy 120-punch cap", () => {
  const start = new Date("2026-06-01T12:00:00.000Z").getTime();
  const completeHistory = Array.from({ length: 120 }, (_, index) => ({
    action: index % 2 === 0 ? "clock_in" as const : "clock_out" as const,
    occurredAt: new Date(start + index * 60 * 60 * 1000).toISOString(),
  }));
  const addedPunch = {
    action: "clock_in" as const,
    occurredAt: new Date(start + 120 * 60 * 60 * 1000).toISOString(),
  };

  const normalized = normalizeStaffClockEventEdits([...completeHistory, addedPunch]);

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  assert.equal(normalized.events.length, 121);

  const longerHistory = [...completeHistory, addedPunch];
  const legacyTruncatedHistory = longerHistory.slice(1);
  const legacyFields = {
    timeClock: {
      events: [...legacyTruncatedHistory].reverse(),
    },
  };
  assert.equal(hasLegacyTruncatedStaffClockHistory(legacyFields), true);
  assert.equal(normalizeStaffClockEventEdits(legacyTruncatedHistory).ok, false);

  const shortenedLegacyHistory = legacyTruncatedHistory.slice(0, -2);
  const repaired = normalizeStaffClockEventEdits(shortenedLegacyHistory, { allowLeadingClockOut: true });

  assert.equal(repaired.ok, true);
  if (!repaired.ok) return;
  const fields = staffClockEditFields({
    customFields: null,
    events: repaired.events,
    editedAt: new Date(addedPunch.occurredAt),
  });
  const stored = readStaffClockState(fields).events;
  assert.equal(stored.at(-1)?.action, "clock_in");
  assert.equal(stored.length, 117);
});

test("director time card edits can add a complete shift at the retention ceiling", () => {
  const start = new Date("2024-01-01T12:00:00.000Z").getTime();
  const retainedHistory = Array.from({ length: 2_000 }, (_, index) => ({
    action: index % 2 === 0 ? "clock_in" as const : "clock_out" as const,
    occurredAt: new Date(start + index * 60 * 60 * 1000).toISOString(),
  }));
  const addedShift = [
    { action: "clock_in" as const, occurredAt: new Date(start + 2_000 * 60 * 60 * 1000).toISOString() },
    { action: "clock_out" as const, occurredAt: new Date(start + 2_001 * 60 * 60 * 1000).toISOString() },
  ];

  const normalized = normalizeStaffClockEventEdits([...retainedHistory, ...addedShift]);

  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  const fields = staffClockEditFields({
    customFields: null,
    events: normalized.events,
    editedAt: new Date(addedShift[1].occurredAt),
  });
  const stored = readStaffClockState(fields).events;
  assert.equal(stored.length, 2_000);
  assert.equal(stored.at(-1)?.action, "clock_in");
  assert.equal(stored[0]?.action, "clock_out");
});

test("staff kiosk credential resolves by unique PIN without requiring email", () => {
  process.env.PIN_HASH_SECRET = "staff-kiosk-test-secret";
  const candidates = [
    {
      id: "staff_1",
      customFields: staffKioskPinFields({
        customFields: null,
        pinHash: hashStaffPin("staff_1", "2468"),
        pinSetAt: new Date("2026-06-19T12:00:00.000Z"),
        pinSetById: "director_1",
      }),
      user: { email: "teacher-login@thebeesuite.io", isActive: true },
    },
  ];

  const result = resolveStaffKioskCredential({ candidates, pin: "2468" });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.staff.id, "staff_1");
});

test("staff kiosk credential asks for email when a PIN matches more than one staff member", () => {
  process.env.PIN_HASH_SECRET = "staff-kiosk-test-secret";
  const candidates = [
    {
      id: "staff_1",
      customFields: staffKioskPinFields({
        customFields: { staffContactEmail: "lead@example.com" },
        pinHash: hashStaffPin("staff_1", "1357"),
        pinSetAt: new Date("2026-06-19T12:00:00.000Z"),
        pinSetById: "director_1",
      }),
      user: { email: "lead-login@thebeesuite.io", isActive: true },
    },
    {
      id: "staff_2",
      customFields: staffKioskPinFields({
        customFields: { staffContactEmail: "floater@example.com" },
        pinHash: hashStaffPin("staff_2", "1357"),
        pinSetAt: new Date("2026-06-19T12:00:00.000Z"),
        pinSetById: "director_1",
      }),
      user: { email: "floater-login@thebeesuite.io", isActive: true },
    },
  ];

  assert.deepEqual(resolveStaffKioskCredential({ candidates, pin: "1357" }), {
    ok: false,
    status: "ambiguous",
  });

  const result = resolveStaffKioskCredential({ candidates, pin: "1357", email: "floater@example.com" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.staff.id, "staff_2");
});
