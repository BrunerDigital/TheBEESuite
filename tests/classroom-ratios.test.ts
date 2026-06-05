import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateClassroomRatio, parseRatioRule } from "@/lib/classroom-ratios";

test("classroom ratio parser accepts licensing ratio text", () => {
  assert.deepEqual(parseRatioRule("1:4 target"), {
    staff: 1,
    children: 4,
    maxChildrenPerStaff: 4,
  });
  assert.deepEqual(parseRatioRule("2 : 8"), {
    staff: 2,
    children: 8,
    maxChildrenPerStaff: 4,
  });
  assert.equal(parseRatioRule("verify manually"), null);
});

test("classroom ratio evaluator marks healthy rooms", () => {
  const warning = evaluateClassroomRatio({
    children: 4,
    staff: 2,
    capacity: 10,
    ratioRule: "1:4",
  });

  assert.equal(warning.status, "healthy");
  assert.equal(warning.requiredStaff, 1);
  assert.equal(warning.maxChildrenForStaff, 8);
});

test("classroom ratio evaluator flags rooms at the exact ratio limit", () => {
  const warning = evaluateClassroomRatio({
    children: 8,
    staff: 2,
    capacity: 10,
    ratioRule: "1:4",
  });

  assert.equal(warning.status, "near_limit");
  assert.equal(warning.label, "At ratio limit");
});

test("classroom ratio evaluator flags over-ratio rooms", () => {
  const warning = evaluateClassroomRatio({
    children: 9,
    staff: 2,
    capacity: 12,
    ratioRule: "1:4",
  });

  assert.equal(warning.status, "over_ratio");
  assert.equal(warning.requiredStaff, 3);
  assert.equal(warning.overBy, 1);
});

test("classroom ratio evaluator flags missing staff", () => {
  const warning = evaluateClassroomRatio({
    children: 3,
    staff: 0,
    capacity: 8,
    ratioRule: "1:4",
  });

  assert.equal(warning.status, "missing_staff");
  assert.equal(warning.requiredStaff, 1);
});

test("classroom ratio evaluator flags over capacity before ratio status", () => {
  const warning = evaluateClassroomRatio({
    children: 13,
    staff: 4,
    capacity: 12,
    ratioRule: "1:4",
  });

  assert.equal(warning.status, "over_capacity");
  assert.equal(warning.overBy, 1);
});

test("classroom ratio evaluator flags missing rules", () => {
  const warning = evaluateClassroomRatio({
    children: 4,
    staff: 1,
    capacity: 8,
    ratioRule: null,
  });

  assert.equal(warning.status, "missing_rule");
  assert.equal(warning.requiredStaff, null);
});
