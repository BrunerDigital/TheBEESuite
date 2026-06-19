import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentlyEnrolledChildWhere,
  currentlyEnrolledStatusValues,
  hasAssignedClassroom,
  isCurrentlyEnrolledChildRecord,
  isCurrentlyEnrolledStatus,
  normalizedEnrollmentStatus,
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
