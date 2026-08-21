import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateScheduledDaysFte,
  scheduledDayBreakdownTotal,
} from "../src/lib/fte-report-guardrails";
import { scheduledDaysPerWeek } from "../src/lib/fte-scheduled-days";

test("scheduled-day FTE weights each child by days attended out of five", () => {
  const counts = {
    twoDayCount: 2,
    threeDayCount: 3,
    fourDayCount: 4,
    fiveDayCount: 5,
  };

  assert.equal(scheduledDayBreakdownTotal(counts), 14);
  assert.equal(calculateScheduledDaysFte(counts), 10.8);
  assert.equal(calculateScheduledDaysFte({ ...counts, fourDayCount: 5 }), 11.6);
});

test("explicit schedule days take priority over the old full-time or part-time label", () => {
  assert.equal(scheduledDaysPerWeek({
    schedule: { days: ["Monday", "Tuesday", "Thursday", "Friday"] },
    customFields: { careScheduleType: "part_time" },
  }), 4);
  assert.equal(scheduledDaysPerWeek({
    schedule: { monday: "8-5", tuesday: "8-5", wednesday: "8-5", thursday: "8-5", friday: "8-5" },
    customFields: {},
  }), 5);
  assert.equal(scheduledDaysPerWeek({ schedule: {}, customFields: { daysPerWeek: 2 } }), 2);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "Mon-Fri 8:00 AM - 4:30 PM" }, customFields: {} }), 5);
  assert.equal(scheduledDaysPerWeek({ schedule: { days: ["monday-friday"] }, customFields: {} }), 5);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "Monday through Friday" }, customFields: {} }), 5);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "Mon, Wed, Fri 8:30 AM - 3:30 PM" }, customFields: {} }), 3);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "MWF 8:30 AM - 3:30 PM" }, customFields: {} }), 3);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "M/W/F" }, customFields: {} }), 3);
  assert.equal(scheduledDaysPerWeek({ schedule: {}, customFields: { scheduleNotes: "Tuesday and Thursday" } }), 2);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "Tuesday-Thursday" }, customFields: {} }), 3);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "Monday through Thursday" }, customFields: {} }), 4);
  assert.equal(scheduledDaysPerWeek({
    schedule: { monday: "8-5", tuesday: "", wednesday: "", thursday: "", friday: "" },
    customFields: {},
  }), null);
  assert.equal(scheduledDaysPerWeek({
    schedule: { monday: "8-5", tuesday: "8-5", wednesday: "", thursday: "", friday: "" },
    customFields: {},
  }), 2);
  assert.equal(scheduledDaysPerWeek({ schedule: {}, customFields: { careScheduleType: "full_time" } }), 5);
  assert.equal(scheduledDaysPerWeek({ schedule: {}, customFields: { careScheduleType: "part_time" } }), null);
});

test("FTE entry UI and API preserve legacy exports while saving the day breakdown", () => {
  const form = readFileSync("src/components/fte-report-form.tsx", "utf8");
  const route = readFileSync("src/app/api/fte-reports/route.ts", "utf8");
  const bulkRoute = readFileSync("src/app/api/fte-reports/bulk/route.ts", "utf8");
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const explorer = readFileSync("src/components/fte-report-explorer.tsx", "utf8");

  assert.match(form, /2 days\/week/);
  assert.match(form, /4 days\/week/);
  assert.match(form, /four = 0\.8/);
  assert.match(form, /Past-due current-family AR/);
  assert.match(route, /fteCalculation: useScheduledDayBreakdown \? "scheduled_days_divided_by_five"/);
  assert.match(route, /fullTimeCount = useScheduledDayBreakdown \? scheduledDayCounts\.fiveDayCount/);
  assert.match(route, /existingScheduledDayBreakdown[\s\S]*useScheduledDayBreakdown/);
  assert.match(route, /sourceMetadata: true/);
  assert.match(route, /twoDayCount: metadataNumber\(metadata\.twoDayCount\)/);
  assert.match(route, /twoDayCount: useScheduledDayBreakdown \? scheduledDayCounts\.twoDayCount : null/);
  assert.match(bulkRoute, /select: \{ id: true, sourceMetadata: true \}/);
  assert.match(bulkRoute, /sourceMetadata: \{\s*\.\.\.existingMetadata,/);
  assert.match(bulkRoute, /preservesScheduledDayBreakdown\s*\?\s*calculateScheduledDaysFte\(existingScheduledDayCounts\)/);
  assert.match(bulkRoute, /const fteCount = preservesScheduledDayBreakdown \? calculatedFte/);
  assert.match(bulkRoute, /scheduledDayBreakdownTotal\(existingScheduledDayCounts\) > row\.enrolledCount/);
  assert.match(explorer, /twoDayCount: inputOptionalNumber\(report\.twoDayCount\)/);
  assert.match(explorer, /label="2 days\/week"/);
  assert.match(explorer, /label="5 days\/week"/);
  assert.match(explorer, /next\.fteCount = ""/);
  assert.match(page, /aging\.oneToThirtyCents \+ aging\.thirtyOneToSixtyCents \+ aging\.sixtyOnePlusCents/);
  assert.match(page, /past-due receivables/);
});
