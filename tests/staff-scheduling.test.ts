import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWeeklyStaffScheduleRequests,
  normalizeWeekdayIndexes,
  summarizeClassroomCoverage,
  weekDateForDay,
} from "@/lib/staff-scheduling";

test("staff schedule weekdays normalize to unique valid indexes", () => {
  assert.deepEqual(normalizeWeekdayIndexes(["1", 2, 2, 9, "bad", 0]), [0, 1, 2]);
});

test("staff schedule week date resolves from selected week start", () => {
  assert.equal(
    weekDateForDay(new Date("2026-06-01T10:00:00.000Z"), 3).toISOString().slice(0, 10),
    "2026-06-03",
  );
});

test("weekly staff schedule builder creates a row per staff member and day", () => {
  const requests = buildWeeklyStaffScheduleRequests({
    staffIds: ["staff_a", "staff_b", "staff_a"],
    weekStartsAt: new Date("2026-06-01T00:00:00.000Z"),
    daysOfWeek: [1, 3],
    startTime: "08:00",
    endTime: "16:30",
  });

  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map((request) => request.staffId), ["staff_a", "staff_a", "staff_b", "staff_b"]);
  assert.equal(requests[0].startsAt.getHours(), 8);
  assert.equal(requests[0].startsAt.getMinutes(), 0);
  assert.equal(requests[1].startsAt.getDay(), 3);
});

test("weekly staff schedule builder drops invalid time ranges", () => {
  const requests = buildWeeklyStaffScheduleRequests({
    staffIds: ["staff_a"],
    weekStartsAt: new Date("2026-06-01T00:00:00.000Z"),
    daysOfWeek: [1],
    startTime: "17:00",
    endTime: "08:00",
  });

  assert.deepEqual(requests, []);
});

test("classroom coverage summary flags assignment and schedule gaps", () => {
  const summaries = summarizeClassroomCoverage({
    classrooms: [
      { id: "room_a", centerId: "center_1", name: "Infants", ageGroup: "Infant" },
      { id: "room_b", centerId: "center_1", name: "Toddlers", ageGroup: "Toddler" },
      { id: "room_c", centerId: "center_1", name: "Pre-K", ageGroup: "Pre-K" },
    ],
    staff: [
      { id: "staff_a", centerId: "center_1", classroomId: "room_a", user: { name: "A", isActive: true } },
      { id: "staff_b", centerId: "center_1", classroomId: "room_b", user: { name: "B", isActive: true } },
      { id: "staff_c", centerId: "center_1", classroomId: "room_b", user: { name: "C", isActive: false } },
    ],
    schedules: [
      { id: "sched_a", startsAt: "2026-06-01T08:00:00.000Z", status: "scheduled", staff: { id: "staff_a" } },
      { id: "sched_b", startsAt: "2026-06-01T08:00:00.000Z", status: "called_out", staff: { id: "staff_b" } },
    ],
  });

  assert.equal(summaries[0].warning, "none");
  assert.equal(summaries[1].warning, "no_upcoming_coverage");
  assert.equal(summaries[2].warning, "no_teacher_assigned");
});
