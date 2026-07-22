import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closedEnrollmentChildWhere,
  closedEnrollmentStatusValues,
  currentlyEnrolledChildWhere,
  currentlyEnrolledStatusValues,
  enrollmentLifecycleCategory,
  hasAssignedClassroom,
  isCurrentlyEnrolledChildRecord,
  isCurrentlyEnrolledStatus,
  normalizedEnrollmentStatus,
  summarizeEnrollmentLifecycleCounts,
} from "../src/lib/enrollment-status";

test("enrollment status helper treats only current records as enrolled", () => {
  assert.equal(isCurrentlyEnrolledStatus("enrolled"), true);
  assert.equal(isCurrentlyEnrolledStatus("Active"), true);
  assert.equal(isCurrentlyEnrolledStatus("current"), true);
  assert.equal(isCurrentlyEnrolledStatus("pending"), false);
  assert.equal(isCurrentlyEnrolledStatus("waitlisted"), false);
  assert.equal(isCurrentlyEnrolledStatus("withdrawn"), false);
  assert.equal(isCurrentlyEnrolledStatus("graduated"), false);
  assert.equal(isCurrentlyEnrolledStatus("not enrolled"), false);
});

test("enrollment status helper returns Prisma-safe status values", () => {
  assert.deepEqual(currentlyEnrolledStatusValues(), ["enrolled", "active", "current"]);
  assert.equal(normalizedEnrollmentStatus("Not Enrolled"), "not_enrolled");
});

test("current enrollment requires a classroom assignment", () => {
  assert.equal(hasAssignedClassroom("classroom_1"), true);
  assert.equal(hasAssignedClassroom(null), false);
  assert.equal(isCurrentlyEnrolledChildRecord({ enrollmentStatus: "active", classroomId: "classroom_1" }), true);
  assert.equal(isCurrentlyEnrolledChildRecord({ enrollmentStatus: "active", classroomId: null }), false);
  assert.equal(isCurrentlyEnrolledChildRecord({ enrollmentStatus: "waitlisted", classroomId: "classroom_1" }), false);
});

test("current enrollment Prisma filter excludes unassigned child records", () => {
  assert.deepEqual(currentlyEnrolledChildWhere(), {
    enrollmentStatus: { in: ["enrolled", "active", "current"] },
    classroomId: { not: null },
  });
});

test("non-current enrollment statuses retain their distinct lifecycle classifications", () => {
  assert.equal(enrollmentLifecycleCategory("pending"), "pending");
  assert.equal(enrollmentLifecycleCategory("Waitlisted"), "waitlisted");
  assert.equal(enrollmentLifecycleCategory("tour scheduled"), "tour_scheduled");
  assert.equal(enrollmentLifecycleCategory("Summer Break"), "summer_break");
  assert.equal(enrollmentLifecycleCategory("graduated"), "closed");
  assert.equal(enrollmentLifecycleCategory("withdrawn"), "closed");
  assert.equal(enrollmentLifecycleCategory("unexpected legacy value"), "needs_review");
});

test("closed enrollment Prisma filter excludes pipeline and temporary-break statuses", () => {
  assert.deepEqual(closedEnrollmentStatusValues(), [
    "withdrawn",
    "graduated",
    "inactive",
    "not_enrolled",
    "unenrolled",
    "terminated",
  ]);
  assert.deepEqual(closedEnrollmentChildWhere(), {
    enrollmentStatus: { in: closedEnrollmentStatusValues() },
  });
});

test("enrollment lifecycle summary separates imported pipeline and summer-break records", () => {
  const counts = summarizeEnrollmentLifecycleCounts([
    { enrollmentStatus: "enrolled", _count: { _all: 4 } },
    { enrollmentStatus: "pending", _count: { _all: 2 } },
    { enrollmentStatus: "waitlisted", _count: { _all: 3 } },
    { enrollmentStatus: "tour_scheduled", _count: { _all: 4 } },
    { enrollmentStatus: "summer_break", _count: { _all: 5 } },
    { enrollmentStatus: "withdrawn", _count: { _all: 6 } },
    { enrollmentStatus: "legacy_unknown", _count: { _all: 7 } },
  ], 3);

  assert.deepEqual(counts, {
    total: 31,
    current: 3,
    pending: 2,
    waitlisted: 3,
    tourScheduled: 4,
    summerBreak: 5,
    closed: 6,
    needsReview: 8,
    other: 28,
  });
});
