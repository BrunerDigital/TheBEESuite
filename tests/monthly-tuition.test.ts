import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("director monthly tuition setup preserves cadence and a school-selected billing day", () => {
  const plansRoute = readFileSync("src/app/api/operations/records/route.ts", "utf8");
  const assignmentRoute = readFileSync("src/app/api/billing/tuition-assignments/route.ts", "utf8");
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const scheduler = readFileSync("src/app/api/cron/tuition-billing/route.ts", "utf8");

  assert.match(plansRoute, /requestedTuitionCadence \? normalizeBillingCadence\(requestedTuitionCadence\) : "weekly"/);
  assert.match(assignmentRoute, /requestedCadence === "monthly"/);
  assert.match(assignmentRoute, /normalizeRecurringBillingDay\(body\.billingDay, cadence\)/);
  assert.match(assignmentRoute, /planCadence === "monthly" && cadence !== "monthly"/);
  assert.match(assignmentRoute, /Existing non-void tuition invoice coverage must be reviewed/);
  assert.match(workbench, /Monthly · 1 month at a time/);
  assert.match(workbench, /Monthly invoice day/);
  assert.match(workbench, /Start month/);
  assert.match(scheduler, /\["weekly", "four_week", "monthly"\]/);
  assert.match(scheduler, /normalizeRecurringBillingDay\(entry\.fields\.tuitionBillingDay, cadence\)/);
});

test("monthly setup copy keeps invoice creation separate from charging and autopay", () => {
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  assert.match(workbench, /Monthly billing creates one invoice/);
  assert.match(workbench, /This does not enable family autopay/);
  assert.match(workbench, /effectiveAssignmentCadence !== "weekly"/);
});
