import assert from "node:assert/strict";
import test from "node:test";
import { fteAgeBucket } from "../src/lib/fte-age-groups";

test("FTE age buckets do not treat preschool as school age", () => {
  assert.equal(fteAgeBucket({ ageGroup: "Preschool" }), "preschool");
  assert.equal(fteAgeBucket({ ageGroup: "School Age" }), "schoolAge");
  assert.equal(fteAgeBucket({ ageGroup: "After School" }), "schoolAge");
});

test("FTE age buckets recognize pre-K classroom programs without overriding specific child ages", () => {
  assert.equal(fteAgeBucket({ ageGroup: "Preschool", classroomName: "HONEY-BEES (C)-FOUR/FIVE'S" }), "preK");
  assert.equal(fteAgeBucket({ ageGroup: "Preschool", classroomName: "VPK Classroom" }), "preK");
  assert.equal(fteAgeBucket({ ageGroup: "Infant", classroomName: "FOUR/FIVE'S" }), "infants");
});
