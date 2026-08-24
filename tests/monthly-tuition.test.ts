import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("director monthly tuition setup preserves cadence and a school-selected billing day", () => {
  const plansRoute = readFileSync("src/app/api/operations/records/route.ts", "utf8");
  const assignmentRoute = readFileSync("src/app/api/billing/tuition-assignments/route.ts", "utf8");
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const scheduler = readFileSync("src/app/api/cron/tuition-billing/route.ts", "utf8");

  assert.match(plansRoute, /requestedTuitionCadence \? normalizeBillingCadence\(requestedTuitionCadence\) : "weekly"/);
  assert.match(plansRoute, /tuitionPlanRecordChanged\(existingTuitionPlan, data\)/);
  assert.match(plansRoute, /path: \["tuitionPlanId"\], equals: id/);
  assert.match(plansRoute, /Create a new rate so previously saved child rates remain unchanged/);
  assert.match(assignmentRoute, /requestedCadence === "monthly"/);
  assert.match(assignmentRoute, /normalizeRecurringBillingDay\(body\.billingDay, cadence\)/);
  assert.match(assignmentRoute, /planCadence === "monthly" && cadence !== "monthly"/);
  assert.match(assignmentRoute, /Existing non-void tuition invoice coverage must be reviewed/);
  assert.match(workbench, /Monthly · 1 month at a time/);
  assert.match(workbench, /Monthly invoice day/);
  assert.match(workbench, /Start month/);
  assert.match(scheduler, /\["weekly", "biweekly", "four_week", "monthly"\]/);
  assert.match(scheduler, /normalizeRecurringBillingDay\(entry\.fields\.tuitionBillingDay, cadence\)/);
});

test("director tuition setup offers a two-week invoice cycle", () => {
  const assignmentRoute = readFileSync("src/app/api/billing/tuition-assignments/route.ts", "utf8");
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const scheduler = readFileSync("src/app/api/cron/tuition-billing/route.ts", "utf8");

  assert.match(assignmentRoute, /requestedCadence === BIWEEKLY_TUITION_AUTOBILL_CADENCE/);
  assert.match(workbench, /Biweekly · 2 weeks ahead/);
  assert.match(workbench, /Biweekly billing creates one invoice equal to two net weekly rates every two weeks/);
  assert.match(scheduler, /invoiceWeekCount > 1 \? ` \(\$\{invoiceWeekCount\} weeks ahead\)`/);
});

test("monthly setup copy keeps invoice creation separate from charging and autopay", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  assert.match(workbench, /Monthly billing creates one invoice/);
  assert.match(workbench, /This does not enable family autopay/);
  assert.match(workbench, /effectiveAssignmentCadence !== "weekly"/);
});

test("weekly-only parent and AI controls cannot convert or select monthly plans", () => {
  const parentRoute = readFileSync("src/app/api/parent/tuition-cadence/route.ts", "utf8");
  const parentWorkspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const aiRoute = readFileSync("src/app/api/ai/command/route.ts", "utf8");

  assert.match(parentRoute, /previousCadence === "monthly"/);
  assert.match(parentRoute, /cannot be changed to a weekly cycle from the parent portal/);
  assert.match(parentWorkspace, /child\.tuitionAssignment\?\.cadence === "monthly"/);
  assert.match(parentWorkspace, /child\.tuitionAssignment\.cadence !== "monthly"/);
  assert.match(aiRoute, /normalizeBillingCadence\(plan\.cadence\) !== WEEKLY_TUITION_AUTOBILL_CADENCE/);
  assert.match(aiRoute, /set_weekly_tuition action requires a weekly tuition plan/);
});
