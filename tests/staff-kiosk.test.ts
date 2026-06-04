import assert from "node:assert/strict";
import test from "node:test";
import {
  readStaffClockState,
  staffClockFields,
  validateNextStaffClockAction,
} from "@/lib/staff-kiosk";

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
  });
  const clockedIn = readStaffClockState(clockInFields);
  assert.equal(clockedIn.status, "clocked_in");
  assert.equal(clockedIn.currentClockInAt, "2026-06-04T12:00:00.000Z");
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
});
