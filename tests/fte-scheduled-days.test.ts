import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateScheduledDaysFte,
  scheduledDayBreakdownTotal,
} from "../src/lib/fte-report-guardrails";
import { childScheduleClassification, fteScheduledDaysPerWeek, normalizeScheduledDaysPerWeek, scheduledDaysPerWeek } from "../src/lib/fte-scheduled-days";

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

test("saved child schedules accept only the supported two-to-five day range", () => {
  assert.equal(normalizeScheduledDaysPerWeek("2"), 2);
  assert.equal(normalizeScheduledDaysPerWeek(4), 4);
  assert.equal(normalizeScheduledDaysPerWeek("5"), 5);
  assert.equal(normalizeScheduledDaysPerWeek("unknown"), null);
  assert.equal(normalizeScheduledDaysPerWeek(1), null);
  assert.equal(normalizeScheduledDaysPerWeek(6), null);
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
  assert.equal(scheduledDaysPerWeek({ schedule: {}, customFields: { attendanceSchedule: "Tuesday and Thursday" } }), 2);
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
  assert.equal(scheduledDaysPerWeek({
    schedule: {},
    customFields: { careScheduleType: "full_time", otherHelpfulInfo: "Pickup is Tuesday and Thursday" },
  }), 5);
  assert.equal(scheduledDaysPerWeek({
    schedule: {},
    customFields: { weeklySchedule: "Tuesday and Thursday", otherHelpfulInfo: "Monday reminder" },
  }), 2);
  assert.equal(scheduledDaysPerWeek({ schedule: {}, customFields: { careScheduleType: "full_time" } }), 5);
  assert.equal(scheduledDaysPerWeek({
    schedule: { monday: "8-5", tuesday: "", wednesday: "", thursday: "", friday: "" },
    customFields: { careScheduleType: "full_time" },
  }), null);
  assert.equal(scheduledDaysPerWeek({ schedule: { daysPerWeek: 1 }, customFields: { careScheduleType: "full_time" } }), null);
  assert.equal(scheduledDaysPerWeek({ schedule: { weekly: "Monday only" }, customFields: { careScheduleType: "full_time" } }), null);
  assert.equal(scheduledDaysPerWeek({ schedule: {}, customFields: { careScheduleType: "part_time" } }), null);
  assert.equal(scheduledDaysPerWeek({ schedule: { notes: "FT" }, customFields: {} }), 5);
  assert.equal(scheduledDaysPerWeek({
    schedule: { days: ["Monday", "Wednesday", "Friday"], daysPerWeek: 3 },
    customFields: { scheduledDaysPerWeek: "not_set", fteDaysPerWeek: 3 },
  }), null);
  assert.equal(scheduledDaysPerWeek({
    schedule: { days: ["Monday", "Wednesday", "Friday"], daysPerWeek: 3 },
    customFields: { scheduledDaysPerWeek: "legacy_part_time", careScheduleType: "part_time" },
  }), null);
  assert.equal(childScheduleClassification({ schedule: {}, customFields: { fullTimePartTime: "part_time" } }), "part_time");
  assert.equal(childScheduleClassification({ schedule: { notes: "Part-time afternoons" }, customFields: {} }), "part_time");
  assert.equal(childScheduleClassification({ schedule: { notes: "Part-time afternoons" }, customFields: { scheduledDaysPerWeek: "not_set" } }), "unknown");
});

test("FTE prefill defaults unlabeled schedules to full-time but preserves explicit part-time review", () => {
  assert.equal(fteScheduledDaysPerWeek({ schedule: {}, customFields: {} }), 5);
  assert.equal(fteScheduledDaysPerWeek({ schedule: { notes: "FT" }, customFields: {} }), 5);
  assert.equal(fteScheduledDaysPerWeek({ schedule: {}, customFields: { careScheduleType: "full_time" } }), 5);
  assert.equal(fteScheduledDaysPerWeek({ schedule: {}, customFields: { careScheduleType: "part_time" } }), null);
  assert.equal(fteScheduledDaysPerWeek({ schedule: { daysPerWeek: 1 }, customFields: {} }), null);
  assert.equal(fteScheduledDaysPerWeek({ schedule: { days: ["Monday"] }, customFields: {} }), null);
  assert.equal(fteScheduledDaysPerWeek({ schedule: { weekly: "Monday only" }, customFields: {} }), null);
  assert.equal(fteScheduledDaysPerWeek({ schedule: {}, customFields: { careScheduleType: "unknown" } }), null);
  assert.equal(fteScheduledDaysPerWeek({ schedule: {}, customFields: { fteScheduleType: "not_set" } }), null);
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
  assert.match(form, /Past-due AR must be verified/);
  assert.match(form, /Missing weekly day counts:/);
  assert.match(form, /Refresh live school data/);
  assert.match(form, /accountReceivableReviewRequired[\s\S]*Number\.isFinite\(reviewedAccountReceivable\)/);
  assert.match(form, /scheduledChildrenCount !== Number\(form\.enrolledCount\)/);
  assert.match(route, /fteCalculation: useScheduledDayBreakdown \? "scheduled_days_divided_by_five"/);
  assert.match(route, /fullTimeCount = useScheduledDayBreakdown \? scheduledDayCounts\.fiveDayCount/);
  assert.match(route, /existingScheduledDayBreakdown[\s\S]*useScheduledDayBreakdown/);
  assert.match(route, /sourceMetadata: true/);
  assert.match(route, /twoDayCount: metadataNumber\(metadata\.twoDayCount\)/);
  assert.match(route, /twoDayCount: useScheduledDayBreakdown \? scheduledDayCounts\.twoDayCount : null/);
  assert.match(route, /scheduledChildrenCount !== enrolledCount/);
  assert.match(route, /accountReceivableReviewRequired === true && !accountReceivableValueProvided/);
  assert.match(bulkRoute, /select: \{ id: true, sourceMetadata: true \}/);
  assert.match(bulkRoute, /sourceMetadata: \{\s*\.\.\.existingMetadata,/);
  assert.match(bulkRoute, /preservesScheduledDayBreakdown\s*\?\s*calculateScheduledDaysFte\(existingScheduledDayCounts\)/);
  assert.match(bulkRoute, /const fteCount = preservesScheduledDayBreakdown \? calculatedFte/);
  assert.match(bulkRoute, /scheduledDayBreakdownTotal\(existingScheduledDayCounts\) !== row\.enrolledCount/);
  assert.match(explorer, /twoDayCount: inputOptionalNumber\(report\.twoDayCount\)/);
  assert.match(explorer, /label="2 days\/week"/);
  assert.match(explorer, /label="5 days\/week"/);
  assert.match(explorer, /next\.fteCount = ""/);
  assert.match(page, /aging\.oneToThirtyCents \+ aging\.thirtyOneToSixtyCents \+ aging\.sixtyOnePlusCents/);
  assert.match(page, /past-due receivables/);
  assert.match(page, /missingScheduleChildren\.push/);
  assert.match(page, /take: fteReceivableLedgerLimit \+ 1/);
  assert.match(page, /past-due AR requires ledger review/);
});
