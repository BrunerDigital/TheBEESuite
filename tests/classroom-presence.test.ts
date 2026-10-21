import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassroomPresence,
  presenceWindow,
  schoolLocalDateTime,
  type PresenceLog,
  type PresenceTransition,
} from "../src/lib/classroom-presence";

const now = new Date("2026-10-21T19:00:00Z");
const start = new Date("2026-09-15T04:00:00Z");
const at = new Date("2026-09-15T15:00:00Z");
const rooms = [
  { id: "a", name: "Toddlers", capacity: 12, archived: false },
  { id: "b", name: "Twos", capacity: 14, archived: false },
];
const log = (
  childId: string,
  type: string,
  time: string,
  classroomId: string | null = "a",
): PresenceLog => ({
  id: `${childId}-${time}-${type}`,
  childId,
  child: { fullName: childId },
  type,
  occurredAt: new Date(time),
  classroomId,
});
const move = (
  childId: string,
  time: string,
  room: string | null,
  area: string | null = null,
): PresenceTransition => ({
  id: `${childId}-${time}`,
  childId,
  movedAt: new Date(time),
  toClassroomId: room,
  toAreaName: area,
});
const snapshot = (
  logs: PresenceLog[],
  transitions: PresenceTransition[] = [],
  teacherClassroomId?: string,
) =>
  buildClassroomPresence({
    rooms,
    start,
    at,
    logs,
    transitions,
    teacherClassroomId,
  });

test("historical presence follows check-in, checkout, re-entry and the exact cutoff", () => {
  const result = snapshot([
    log("left", "check_in", "2026-09-15T12:00:00Z"),
    log("left", "check_out", "2026-09-15T14:00:00Z"),
    log("returned", "check_in", "2026-09-15T12:00:00Z"),
    log("returned", "check_out", "2026-09-15T13:00:00Z"),
    log("returned", "check_in", "2026-09-15T14:00:00Z", "b"),
    log("future", "check_in", "2026-09-15T15:00:01Z"),
    log("stale", "check_in", "2026-09-14T12:00:00Z"),
    log("cutoff", "check_in", "2026-09-15T15:00:00Z"),
  ]);
  assert.equal(result.checkedIn, 2);
  assert.deepEqual(
    result.groups.map((group) => group.children.map((child) => child.name)),
    [["cutoff"], ["returned"]],
  );
});

test("transfers reconstruct the room or area only while checked in", () => {
  const logs = [
    log("moved", "check_in", "2026-09-15T12:00:00Z"),
    log("outside", "check_in", "2026-09-15T12:00:00Z"),
  ];
  const result = snapshot(logs, [
    move("moved", "2026-09-15T14:00:00Z", "b"),
    move("outside", "2026-09-15T14:00:00Z", null, "Playground"),
    move("moved", "2026-09-15T16:00:00Z", "a"),
  ]);
  assert.equal(result.checkedIn, 2);
  assert.equal(
    result.groups.find((group) => group.id === "b")?.children.length,
    1,
  );
  assert.equal(
    result.groups.find((group) => group.id === "area:Playground")?.children
      .length,
    1,
  );
});

test("transfers before the latest check-in do not override the new check-in room", () => {
  const result = snapshot(
    [log("returned", "check_in", "2026-09-15T14:30:00Z")],
    [move("returned", "2026-09-15T14:00:00Z", "b")],
  );
  assert.equal(result.groups[0].children.length, 1);
});

test("missing recorded classroom remains unknown without substituting the current roster", () => {
  const result = snapshot([
    log("historic-former-student", "check_in", "2026-09-15T12:00:00Z", null),
  ]);
  assert.equal(result.unknown, 1);
  assert.equal(
    result.groups.find((group) => group.id === "unknown")?.children[0].name,
    "historic-former-student",
  );
});

test("teacher output includes only occupants of the assigned room after all transfers", () => {
  const logs = [
    log("out", "check_in", "2026-09-15T12:00:00Z"),
    log("in", "check_in", "2026-09-15T12:00:00Z", "b"),
    log("hidden", "check_in", "2026-09-15T12:00:00Z", "b"),
  ];
  const result = buildClassroomPresence({
    rooms: [rooms[0]],
    start,
    at,
    logs,
    transitions: [
      move("out", "2026-09-15T14:00:00Z", "b"),
      move("in", "2026-09-15T14:00:00Z", "a"),
    ],
    teacherClassroomId: "a",
  });
  assert.equal(result.checkedIn, 1);
  assert.deepEqual(
    result.groups.flatMap((group) => group.children.map((child) => child.name)),
    ["in"],
  );
});

test("checkout wins equal timestamps and duplicate check-ins count once", () => {
  assert.equal(
    snapshot([
      log("a", "check_out", "2026-09-15T12:00:00Z"),
      log("a", "check_in", "2026-09-15T12:00:00Z"),
    ]).checkedIn,
    0,
  );
  assert.equal(
    snapshot([
      log("a", "check_in", "2026-09-15T12:00:00Z"),
      log("a", "check_in", "2026-09-15T12:01:00Z"),
    ]).checkedIn,
    1,
  );
});

test("archived classrooms remain visible when recorded students were present", () => {
  const result = buildClassroomPresence({
    rooms: [{ ...rooms[0], archived: true }],
    logs: [log("old", "check_in", "2026-09-15T12:00:00Z")],
    transitions: [],
    start,
    at,
  });
  assert.equal(result.groups[0].archived, true);
  assert.equal(result.groups[0].children.length, 1);
});

test("historical wall clock uses school time zone independently of machine time", () => {
  assert.equal(
    presenceWindow(
      "2026-09-15",
      "10:00",
      "America/New_York",
      now,
    ).at.toISOString(),
    "2026-09-15T14:00:00.000Z",
  );
  assert.equal(
    presenceWindow(
      "2026-09-15",
      "10:00",
      "America/Denver",
      now,
    ).at.toISOString(),
    "2026-09-15T16:00:00.000Z",
  );
  assert.equal(
    presenceWindow(
      "2026-09-15",
      "10:00",
      "America/Denver",
      now,
    ).start.toISOString(),
    "2026-09-15T06:00:00.000Z",
  );
  assert.deepEqual(
    schoolLocalDateTime(new Date("2026-09-15T04:00:00Z"), "America/New_York"),
    { date: "2026-09-15", time: "00:00" },
  );
});

test("invalid dates, partial filters, future dates, DST skipped/repeated times fail clearly", () => {
  for (const [date, time] of [
    ["2026-02-30", "12:00"],
    ["2026-09-15", "25:00"],
    ["", "12:00"],
    ["2026-09-15", ""],
    ["2027-01-01", "12:00"],
    ["2026-03-08", "02:30"],
    ["2025-11-02", "01:30"],
  ]) {
    assert.throws(() => presenceWindow(date, time, "America/New_York", now));
  }
  assert.equal(presenceWindow("", "", "America/New_York", now).at, now);
});
