import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildBulkEnrollmentChange } from "@/lib/child-enrollment-bulk";

const operationsRoute = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
const enrollmentPanel = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");

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
    { ok: false, error: "Choose a classroom before moving children to enrolled." },
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
  assert.match(operationsRoute, /revalidatePath\("\/", "layout"\)/);
});

test("past student table supports filtered select-all, bulk status, classroom gating, and profile editing", () => {
  assert.match(enrollmentPanel, /Past & Other Student Records/);
  assert.match(enrollmentPanel, /Select all filtered past students/);
  assert.match(enrollmentPanel, /entity: "childStatusBulk"/);
  assert.match(enrollmentPanel, /Choose classroom for enrolled children/);
  assert.match(enrollmentPanel, /familyId=.*childId=.*#family-editor/);
});
