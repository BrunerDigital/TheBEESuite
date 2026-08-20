import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildBulkEnrollmentChange } from "@/lib/child-enrollment-bulk";
import { enrollmentStatusCustomFields } from "@/lib/enrollment-status";

const operationsRoute = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
const enrollmentPanel = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");
const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");

test("bulk enrollment changes deduplicate children and require a classroom for enrolled", () => {
  assert.deepEqual(
    buildBulkEnrollmentChange({
      childIds: ["child-1", "child-1", " child-2 "],
      enrollmentStatus: "Enrolled",
      classroomId: "room-1",
    }),
    {
      ok: true,
      value: {
        childIds: ["child-1", "child-2"],
        enrollmentStatus: "enrolled",
        classroomId: "room-1",
      },
    },
  );

  assert.deepEqual(
    buildBulkEnrollmentChange({ childIds: ["child-1"], enrollmentStatus: "enrolled" }),
    { ok: false, error: "Choose a classroom before marking this child enrolled. Billing and active rosters require a classroom assignment." },
  );
});

test("bulk enrollment keeps pending children valid without a classroom", () => {
  assert.deepEqual(
    buildBulkEnrollmentChange({ childIds: ["child-1"], enrollmentStatus: "pending" }),
    { ok: true, value: { childIds: ["child-1"], enrollmentStatus: "pending", classroomId: null } },
  );
});

test("bulk closed-status changes clear classroom assignments", () => {
  assert.deepEqual(
    buildBulkEnrollmentChange({
      childIds: ["child-1"],
      enrollmentStatus: "Withdrawn",
      classroomId: "room-1",
    }),
    {
      ok: true,
      value: {
        childIds: ["child-1"],
        enrollmentStatus: "withdrawn",
        classroomId: null,
      },
    },
  );
});

test("closed enrollment statuses disable future tuition without removing billing history fields", () => {
  const updatedAt = new Date("2026-08-20T12:00:00.000Z");
  assert.deepEqual(
    enrollmentStatusCustomFields({
      customFields: { tuitionBillingEnabled: true, tuitionPlanId: "plan-1", importedBalanceCents: 41000 },
      enrollmentStatus: "withdrawn",
      updatedAt,
      updatedBy: "director@example.com",
    }),
    {
      tuitionBillingEnabled: false,
      tuitionPlanId: "plan-1",
      importedBalanceCents: 41000,
      tuitionBillingUpdatedAt: updatedAt.toISOString(),
      tuitionBillingUpdatedBy: "director@example.com",
      tuitionBillingDisabledReason: "enrollment_closed",
    },
  );
});

test("non-closed enrollment statuses preserve recurring tuition configuration", () => {
  assert.deepEqual(
    enrollmentStatusCustomFields({
      customFields: { tuitionBillingEnabled: true, tuitionPlanId: "plan-1" },
      enrollmentStatus: "summer_break",
      updatedAt: new Date("2026-08-20T12:00:00.000Z"),
      updatedBy: "director@example.com",
    }),
    { tuitionBillingEnabled: true, tuitionPlanId: "plan-1" },
  );
});

test("bulk enrollment changes reject unsupported statuses and oversized batches", () => {
  assert.deepEqual(
    buildBulkEnrollmentChange({ childIds: ["child-1"], enrollmentStatus: "unknown" }),
    { ok: false, error: "Choose a supported enrollment status." },
  );
  assert.deepEqual(
    buildBulkEnrollmentChange({ childIds: Array.from({ length: 501 }, (_, index) => `child-${index}`), enrollmentStatus: "withdrawn" }),
    { ok: false, error: "Update no more than 500 children at a time." },
  );
});

test("bulk enrollment updates stay school-scoped, audited, and invalidate dashboards", () => {
  assert.match(operationsRoute, /entity === "childStatusBulk"/);
  assert.match(operationsRoute, /canAccessCenter\(user, child\.family\.centerId\)/);
  assert.match(operationsRoute, /selectedCenterId\) => selectedCenterId !== classroom\.centerId/);
  assert.match(operationsRoute, /operations\.child_status\.bulk_updated/);
  assert.match(operationsRoute, /recurringTuitionDisabled/);
  assert.match(operationsRoute, /prisma\.\$transaction\(children\.map/);
  assert.match(operationsRoute, /revalidatePath\("\/billing-invoices"\)/);
  assert.match(operationsRoute, /revalidatePath\("\/api\/dashboard\/accounts-receivable"\)/);
});

test("existing children with a missing DOB can be withdrawn without changing the placeholder DOB", () => {
  assert.match(familyEditor, /\(!selectedChild && !dateOfBirth\)/);
  assert.match(operationsRoute, /existingChild\?\.dateOfBirth \?\? new Date/);
  assert.match(operationsRoute, /classroomId: isCurrentlyEnrolledStatus\(enrollmentStatus\) \? classroomId : null/);
});

test("past student table supports filtered select-all, bulk status, classroom gating, and profile editing", () => {
  assert.match(enrollmentPanel, /Past & Other Student Records/);
  assert.match(enrollmentPanel, /Select all filtered past students/);
  assert.match(enrollmentPanel, /entity: "childStatusBulk"/);
  assert.match(enrollmentPanel, /Choose classroom for enrolled children/);
  assert.match(enrollmentPanel, /familyId=.*childId=.*#family-editor/);
});
