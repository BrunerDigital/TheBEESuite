import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("child tuition setup keeps sibling program, classroom, schedule, and rate separate", () => {
  const billing = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const operations = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
  const enrollmentStatus = readFileSync(new URL("../src/lib/enrollment-status.ts", import.meta.url), "utf8");

  assert.match(billing, /Program: \{child\.ageGroup \|\| "Not set"\}/);
  assert.match(billing, /Classroom: \{classroom\?\.name \?\? "Not assigned"\}/);
  assert.match(billing, /Care schedule: \{careScheduleLabel\(child\.careScheduleType\)\}/);
  assert.match(billing, /Rate name: \{child\.tuitionAssignment\?\.description/);
  assert.match(billing, /Tuition: \{child\.tuitionAssignment\?\.enabled/);
  assert.match(billing, /<Label>Rate name<\/Label>/);
  assert.match(billing, /<Label>Child tuition label<\/Label>/);
  assert.match(billing, /projectedFamilyWeeklyTuitionCents/);
  assert.match(billing, /Auto-calculated from \$\{projectedActiveRateCount\} child rate/);
  assert.match(billing, /save tuition to update the family ledger/);
  assert.match(billing, /Set this child’s program, classroom, care schedule, and start date/);
  assert.match(billing, /updateScope: "enrollment_context"/);
  assert.match(billing, /Save child setup/);
  assert.match(billing, /Tuition and ledger amounts were not changed/);

  assert.match(page, /prisma\.classroom\.findMany\(\{[\s\S]*?where: \{ centerId: scopedCenterIds \}/);
  assert.match(page, /classrooms: billingClassroomsByCenter\.get\(center\.id\) \?\? \[\]/);
  assert.match(page, /careScheduleType: childScheduleClassification\(\{ schedule: child\.schedule, customFields: child\.customFields \}\)/);

  assert.match(operations, /const enrollmentContextOnly = clean\(body\.updateScope\) === "enrollment_context"/);
  assert.match(operations, /classroomFamilyGuard\(centerId, classroom\.centerId\)/);
  assert.match(operations, /scopedUpdateGuard\(\{ entity: "Child", expectedScopeId: familyId, actualScopeId: existingChild\?\.familyId/);
  assert.match(operations, /enrollmentClassroomValidationError/);
  assert.match(enrollmentStatus, /Choose a classroom before marking this child enrolled\. Billing and active rosters require a classroom assignment\./);
  assert.match(operations, /auditMetadata\.updateScope = "enrollment_context"/);
});
