import assert from "node:assert/strict";
import { test } from "node:test";
import { activeEnrollmentStatus, effectiveEnrollmentStatus } from "../src/lib/enrollment-status";

test("classroom-linked children are treated as active and enrolled", () => {
  assert.equal(activeEnrollmentStatus("withdrawn", "classroom_1"), true);
  assert.equal(effectiveEnrollmentStatus("withdrawn", "classroom_1"), "enrolled");
});

test("children without classrooms keep inactive enrollment filtering", () => {
  assert.equal(activeEnrollmentStatus("withdrawn", null), false);
  assert.equal(activeEnrollmentStatus("graduated", null), false);
  assert.equal(activeEnrollmentStatus("enrolled", null), true);
  assert.equal(effectiveEnrollmentStatus("waitlisted", null), "waitlisted");
});
