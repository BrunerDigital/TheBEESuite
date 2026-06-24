import assert from "node:assert/strict";
import test from "node:test";
import {
  readStaffClockState,
  readStaffClockSummary,
  resolveStaffKioskCredential,
  staffKioskPinFields,
  staffClockFields,
  validateNextStaffClockAction,
  formatStaffHours,
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
  assert.equal(summary.recentShifts[0]?.clockInAt, "2026-06-04T12:00:00.000Z");
  assert.equal(summary.recentShifts[0]?.clockOutAt, "2026-06-04T20:30:00.000Z");
  assert.equal(formatStaffHours(summary.totalMinutes), "8.5h");
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
