import assert from "node:assert/strict";
import { test } from "node:test";
import { tuitionDescriptionAfterRateSave, tuitionScheduleAfterRateSave } from "../src/lib/tuition-rate-schedule";

const defaultPeriod = (cadence: string) => cadence === "monthly" ? "2026-11" : "2026-W46";
test("a weekly-rate edit preserves the child's biweekly cadence and anchor", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "biweekly", startsPeriod: "2026-W40", savedRateCadence: "weekly", defaultPeriod }), { cadence: "biweekly", startsPeriod: "2026-W40" });
});
test("a biweekly-rate amount edit keeps an explicitly selected weekly schedule", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "weekly", startsPeriod: "2026-W41", savedRateCadence: "biweekly", defaultPeriod }), { cadence: "weekly", startsPeriod: "2026-W41" });
});
test("the child's selected cycle wins over a compatible rate's default cycle", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "weekly", startsPeriod: "2026-W40", savedRateCadence: "biweekly", defaultPeriod }), { cadence: "weekly", startsPeriod: "2026-W40" });
});
test("monthly and week-based rate changes replace incompatible period formats", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "monthly", startsPeriod: "2026-10", savedRateCadence: "biweekly", defaultPeriod }), { cadence: "biweekly", startsPeriod: "2026-W46" });
});
test("new rates retain explicitly selected multiweek billing cycles", () => {
  for (const assignmentCadence of ["biweekly", "four_week"]) {
    assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence, startsPeriod: "2026-W40", savedRateCadence: "weekly", defaultPeriod }), { cadence: assignmentCadence, startsPeriod: "2026-W40" });
  }
});
test("rate renames update default labels while preserving custom and newly edited labels", () => {
  assert.equal(tuitionDescriptionAfterRateSave("Old rate", "Old rate", "New rate"), "New rate");
  assert.equal(tuitionDescriptionAfterRateSave("Custom child label", "Old rate", "New rate"), "Custom child label");
  assert.equal(tuitionDescriptionAfterRateSave("  ", "Old rate", "New rate"), "New rate");
});
