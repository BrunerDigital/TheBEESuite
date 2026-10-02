import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDailyReportEntries } from "../src/lib/daily-report-aggregation";
import { buildDailyReportEmailText, type DailyReportEmailReport } from "../src/lib/daily-report-email";

test("checkout report includes breakfast, nap, diaper and later activity without mutating original care records", () => {
  const base: DailyReportEmailReport = { id: "r1", date: new Date("2026-10-01T12:00:00Z"), mood: "Happy", teacherNote: "Morning note", suppliesNeeded: null,
    child: { id: "fixture-child", fullName: "Test Child", family: { id: "fixture-family", name: "Test Family", customFields: null, guardians: [] } },
    meals: [{ mealType: "Breakfast", food: "Toast", amount: null }], naps: [], diapers: [], activities: [] };
  const later = { ...base, id: "r2", date: new Date("2026-10-01T18:00:00Z"), teacherNote: "Afternoon note", meals: [],
    naps: [{ startsAt: new Date("2026-10-01T16:00:00Z"), endsAt: new Date("2026-10-01T17:00:00Z") }],
    diapers: [{ type: "Wet", occurredAt: new Date("2026-10-01T15:00:00Z"), notes: null }], activities: [{ title: "Painting", notes: null }] };
  const report = aggregateDailyReportEntries([later, base])!;
  const text = buildDailyReportEmailText({ report, timeZone: "America/New_York" });
  for (const value of ["Breakfast: Toast", "Nap", "Diaper / potty - Wet", "Painting", "Morning note", "Afternoon note"]) assert.ok(text.includes(value), value);
  assert.equal(base.meals.length, 1);
  assert.equal(base.activities.length, 0);
  assert.equal(later.meals.length, 0);
  assert.equal(report.id, "r2");
  assert.equal(aggregateDailyReportEntries([]), null);
});
