import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("tuition plans are persisted with a school relationship and indexed by location", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync(
    "prisma/migrations/20260725024500_location_scoped_tuition_plans/migration.sql",
    "utf8",
  );
  assert.match(schema, /model TuitionPlan \{[\s\S]*centerId\s+String\?/);
  assert.match(schema, /center Center\? @relation\(fields: \[centerId\], references: \[id\]\)/);
  assert.match(schema, /@@index\(\[centerId, ageGroup, name\]\)/);
  assert.match(migration, /ADD COLUMN "centerId" TEXT/);
  assert.match(migration, /SharedPlans/);
  assert.match(migration, /JSONB_SET\(c\."customFields", '\{tuitionPlanId\}'/);
});

test("tuition plan create, edit, assignment, and invoicing fail closed across schools", () => {
  const records = readFileSync("src/app/api/operations/records/route.ts", "utf8");
  const assignments = readFileSync("src/app/api/billing/tuition-assignments/route.ts", "utf8");
  const invoices = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  const scheduler = readFileSync("src/app/api/cron/tuition-billing/route.ts", "utf8");
  assert.match(records, /School is required for every tuition plan/);
  assert.match(records, /existing\.centerId && existing\.centerId !== requestedCenterId/);
  assert.match(assignments, /plan\.centerId !== access\.centerId/);
  assert.match(invoices, /findFirst\(\{ where: \{ id: tuitionPlanId, centerId \} \}\)/);
  assert.match(scheduler, /plan\.centerId !== entry\.child\.family\.centerId/);
});

test("billing views load visible locations only and the workbench switches plan lists by school", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");
  const settings = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  assert.match(page, /where: \{ centerId: scopedCenterIds \}/);
  assert.match(workbench, /tuitionPlans\.filter\(\(plan\) => plan\.centerId === centerId\)/);
  assert.match(workbench, /centerId,[\s\S]*name: planName/);
  assert.match(settings, /<TableHead>School<\/TableHead>/);
});
