import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { activeClassroomWhere, classroomIsArchived } from "../src/lib/classroom-status";

const source = fs.readFileSync(new URL("../scripts/reconcile-canton-stale-invoices-and-classrooms.ts", import.meta.url), "utf8");
const classroomScopeSource = fs.readFileSync(new URL("../src/lib/corporate-view-scope.ts", import.meta.url), "utf8");

test("active classroom scope excludes archived records", () => {
  assert.deepEqual(activeClassroomWhere({ centerId: "center-1" }), {
    AND: [
      { centerId: "center-1" },
      {
        OR: [
          { customFields: { equals: Prisma.DbNull } },
          { customFields: { path: ["archived"], equals: Prisma.AnyNull } },
          { customFields: { path: ["archived"], equals: false } },
        ],
      },
    ],
  });
  assert.equal(classroomIsArchived({ archived: true }), true);
  assert.equal(classroomIsArchived({ archived: false }), false);
  assert.equal(classroomIsArchived(null), false);
  assert.match(classroomScopeSource, /visibleClassroomWhere[\s\S]*activeClassroomWhere/);
});

test("Canton repair is fingerprinted, preserves balances and payments, and never activates tuition", () => {
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /accountBalancePreserved: true/);
  assert.match(source, /paymentsPreserved: true/);
  assert.match(source, /stableJson\(verified\.accountBalances\) === balancesBefore/);
  assert.match(source, /verified\.paymentCount === paymentCountBefore/);
  assert.match(source, /recurringTuitionActivation: "held_pending_explicit_effective_month_and_billing_day"/);
  assert.doesNotMatch(source, /tuitionBillingEnabled:\s*true/);
});

test("Canton classroom repair archives only empty legacy rooms and preserves transition history", () => {
  assert.match(source, /archived\._count\.children === 0/);
  assert.match(source, /currentClassroomId: classroom\.retainedId/);
  assert.match(source, /classroomId: classroom\.retainedId/);
  assert.match(source, /historicalTransitionsPreserved/);
  assert.doesNotMatch(source, /classroom\.delete/);
});

test("family intake and child writes cannot reuse archived classrooms", () => {
  const pageSource = fs.readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const operationsSource = fs.readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
  const familyIntakeSource = fs.readFileSync(new URL("../src/app/api/families/intake/route.ts", import.meta.url), "utf8");
  assert.match(pageSource, /classrooms: \{[\s\S]*where: activeClassroomWhere\(\)/);
  assert.match(operationsSource, /activeClassroomWhere\(\{ id: change\.value\.classroomId \}\)/);
  assert.match(operationsSource, /activeClassroomWhere\(\{ id: classroomId \}\)/);
  assert.match(familyIntakeSource, /activeClassroomWhere\(\{ id: classroomId \}\)/);
});
