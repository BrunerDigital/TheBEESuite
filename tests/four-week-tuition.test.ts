import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("director and parent four-week choices remain scoped and do not create opening debt", () => {
  const assignment = readFileSync(new URL("../src/app/api/billing/tuition-assignments/route.ts", import.meta.url), "utf8");
  const parentRoute = readFileSync(new URL("../src/app/api/parent/tuition-cadence/route.ts", import.meta.url), "utf8");
  const scheduler = readFileSync(new URL("../src/app/api/cron/tuition-billing/route.ts", import.meta.url), "utf8");
  const workbench = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");
  const portal = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");

  assert.match(assignment, /billingCadence/);
  assert.match(workbench, /Every 4 weeks · 4 weeks ahead/);
  assert.match(portal, /api\/parent\/tuition-cadence/);
  assert.match(parentRoute, /getParentPortalFamilyScope\(user\.id\)/);
  assert.match(parentRoute, /familyId: scope\.familyId/);
  assert.match(parentRoute, /tuitionBillingEnabled !== true/);
  assert.doesNotMatch(parentRoute, /balanceCents/);
  assert.match(scheduler, /amountCents \* invoiceWeekCount/);
  assert.match(scheduler, /coverageStartsPeriod/);
});
