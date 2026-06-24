import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDashboardAttendanceSnapshot } from "../src/lib/dashboard-attendance-snapshot";

test("dashboard attendance snapshot groups current classroom check states", () => {
  const snapshot = buildDashboardAttendanceSnapshot({
    scopeLabel: "All classes at Kokomo",
    classrooms: [
      {
        id: "room_1",
        name: "Infants",
        centerName: "Kokomo",
        children: [{ id: "child_present" }, { id: "child_out" }],
      },
      {
        id: "room_2",
        name: "Pre-K",
        centerName: "Kokomo",
        children: [{ id: "child_absent" }, { id: "child_open" }],
      },
    ],
    latestLogByChild: new Map([
      ["child_present", { type: "check_in", occurredAt: new Date("2026-06-22T13:00:00.000Z") }],
      ["child_out", { type: "check_out", occurredAt: new Date("2026-06-22T18:00:00.000Z") }],
    ]),
    latestRecordByChild: new Map([
      ["child_absent", { status: "absent", date: new Date("2026-06-22T12:00:00.000Z") }],
    ]),
  });

  assert.equal(snapshot.total, 4);
  assert.equal(snapshot.present, 1);
  assert.equal(snapshot.checkedOut, 1);
  assert.equal(snapshot.absent, 1);
  assert.equal(snapshot.notMarked, 1);
  assert.deepEqual(snapshot.rows.map((row) => ({
    classroomName: row.classroomName,
    present: row.present,
    checkedOut: row.checkedOut,
    absent: row.absent,
    notMarked: row.notMarked,
  })), [
    { classroomName: "Infants", present: 1, checkedOut: 1, absent: 0, notMarked: 0 },
    { classroomName: "Pre-K", present: 0, checkedOut: 0, absent: 1, notMarked: 1 },
  ]);
});

test("dashboard attendance snapshot lets latest check log override manual status", () => {
  const snapshot = buildDashboardAttendanceSnapshot({
    scopeLabel: "Toddlers",
    classrooms: [{
      id: "room_1",
      name: "Toddlers",
      centerName: "Kokomo",
      children: [{ id: "child_1" }],
    }],
    latestLogByChild: new Map([
      ["child_1", { type: "check_in", occurredAt: new Date("2026-06-22T13:00:00.000Z") }],
    ]),
    latestRecordByChild: new Map([
      ["child_1", { status: "absent", date: new Date("2026-06-22T12:00:00.000Z") }],
    ]),
  });

  assert.equal(snapshot.present, 1);
  assert.equal(snapshot.absent, 0);
});
