import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTeacherDailyReportPayload } from "../src/lib/teacher-daily-report";

test("teacher daily report parser accepts batched care entries", () => {
  const parsed = parseTeacherDailyReportPayload({
    childId: "child_1",
    date: "2026-06-04",
    mood: "Happy",
    teacherNote: "Great circle time.",
    suppliesNeeded: "Diapers",
    sendToParent: "true",
    meals: [
      { mealType: "Breakfast", food: "Oatmeal", amount: "All" },
      { mealType: "Lunch", food: "", amount: "" },
    ],
    naps: [{ startsAt: "2026-06-04T12:15", endsAt: "2026-06-04T13:20" }],
    diapers: [{ type: "Wet", occurredAt: "2026-06-04T10:05", notes: "Changed" }],
    activities: [{ title: "Outdoor play", notes: "Shared well" }],
  });

  if (!parsed.ok) assert.fail(parsed.error);

  assert.equal(parsed.report.date.getHours(), 12);
  assert.deepEqual(parsed.report.childIds, ["child_1"]);
  assert.equal(parsed.report.sendToParent, true);
  assert.deepEqual(parsed.report.meals, [{ mealType: "Breakfast", food: "Oatmeal", amount: "All" }]);
  assert.equal(parsed.report.naps.length, 1);
  assert.equal(parsed.report.diapers.length, 1);
  assert.equal(parsed.report.activities[0]?.title, "Outdoor play");
});

test("teacher daily report parser accepts multi-child tablet batches", () => {
  const parsed = parseTeacherDailyReportPayload({
    childId: "child_1",
    childIds: ["child_1", "child_2", " child_3 ", "child_2"],
    date: "2026-06-04",
    meals: [{ mealType: "Lunch", food: "Pasta", amount: "Most" }],
    activities: [{ title: "Story time" }],
  });

  if (!parsed.ok) assert.fail(parsed.error);

  assert.equal(parsed.report.childId, "child_1");
  assert.deepEqual(parsed.report.childIds, ["child_1", "child_2", "child_3"]);
  assert.equal(parsed.report.meals.length, 1);
});

test("teacher daily report parser accepts nap times on the report date", () => {
  const parsed = parseTeacherDailyReportPayload({
    childId: "child_1",
    date: "2026-06-04",
    naps: [{ startsAt: "12:15", endsAt: "13:20" }],
  });

  if (!parsed.ok) assert.fail(parsed.error);

  assert.equal(parsed.report.naps.length, 1);
  assert.equal(parsed.report.naps[0]?.startsAt.getFullYear(), 2026);
  assert.equal(parsed.report.naps[0]?.startsAt.getMonth(), 5);
  assert.equal(parsed.report.naps[0]?.startsAt.getDate(), 4);
  assert.equal(parsed.report.naps[0]?.startsAt.getHours(), 12);
  assert.equal(parsed.report.naps[0]?.startsAt.getMinutes(), 15);
  assert.equal(parsed.report.naps[0]?.endsAt?.getHours(), 13);
  assert.equal(parsed.report.naps[0]?.endsAt?.getMinutes(), 20);
});

test("teacher daily report parser keeps legacy single-field payload support", () => {
  const parsed = parseTeacherDailyReportPayload({
    childId: "child_1",
    meal: "Mac and cheese",
    mealType: "Lunch",
    mealAmount: "Most",
    napStart: "2026-06-04T12:00",
    napEnd: "2026-06-04T13:00",
    diaperType: "BM",
    diaperNotes: "Changed",
    activity: "Music",
    activityNotes: "Loved drums",
    sendToParent: true,
  });

  if (!parsed.ok) assert.fail(parsed.error);

  assert.deepEqual(parsed.report.meals, [{ mealType: "Lunch", food: "Mac and cheese", amount: "Most" }]);
  assert.equal(parsed.report.naps.length, 1);
  assert.deepEqual(parsed.report.diapers.map((entry) => entry.type), ["BM"]);
  assert.deepEqual(parsed.report.activities, [{ title: "Music", notes: "Loved drums" }]);
});

test("teacher daily report parser rejects nap end before start", () => {
  const parsed = parseTeacherDailyReportPayload({
    childId: "child_1",
    naps: [{ startsAt: "2026-06-04T14:00", endsAt: "2026-06-04T13:00" }],
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) throw new Error("Expected nap validation to fail.");
  assert.equal(parsed.status, 400);
  assert.match(parsed.error, /end time cannot be before/);
});

test("teacher daily report parser limits batched entries", () => {
  const parsed = parseTeacherDailyReportPayload({
    childId: "child_1",
    meals: Array.from({ length: 13 }, (_, index) => ({ mealType: "Snack", food: `Item ${index}` })),
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) throw new Error("Expected batch limit validation to fail.");
  assert.equal(parsed.status, 400);
  assert.match(parsed.error, /at most 12 entries/);
});

test("teacher daily report parser limits selected children", () => {
  const parsed = parseTeacherDailyReportPayload({
    childIds: Array.from({ length: 41 }, (_, index) => `child_${index}`),
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) throw new Error("Expected child batch validation to fail.");
  assert.equal(parsed.status, 400);
  assert.match(parsed.error, /at most 40 children/);
});
