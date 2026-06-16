import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentlyEnrolledStatusValues,
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
