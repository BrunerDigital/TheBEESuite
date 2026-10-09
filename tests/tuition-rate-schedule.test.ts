import assert from "node:assert/strict";
import { test } from "node:test";
import { tuitionScheduleAfterRateSave } from "../src/lib/tuition-rate-schedule";

const defaultPeriod = (cadence: string) => cadence === "monthly" ? "2026-11" : "2026-W46";
test("a weekly-rate edit preserves the child's biweekly cadence and anchor", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "biweekly", startsPeriod: "2026-W40", previousRateCadence: "weekly", savedRateCadence: "weekly", defaultPeriod }), { cadence: "biweekly", startsPeriod: "2026-W40" });
});
test("a biweekly-rate amount edit keeps an explicitly selected weekly schedule", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "weekly", startsPeriod: "2026-W41", previousRateCadence: "biweekly", savedRateCadence: "biweekly", defaultPeriod }), { cadence: "weekly", startsPeriod: "2026-W41" });
});
test("an explicit rate cadence change keeps a compatible week anchor", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "weekly", startsPeriod: "2026-W40", previousRateCadence: "weekly", savedRateCadence: "biweekly", defaultPeriod }), { cadence: "biweekly", startsPeriod: "2026-W40" });
});
test("monthly and week-based rate changes replace incompatible period formats", () => {
  assert.deepEqual(tuitionScheduleAfterRateSave({ assignmentCadence: "monthly", startsPeriod: "2026-10", previousRateCadence: "monthly", savedRateCadence: "biweekly", defaultPeriod }), { cadence: "biweekly", startsPeriod: "2026-W46" });
});
