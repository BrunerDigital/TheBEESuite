import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { activeClassroomWhere, classroomIsArchived } from "../src/lib/classroom-status";

const source = fs.readFileSync(new URL("../scripts/reconcile-canton-stale-invoices-and-classrooms.ts", import.meta.url), "utf8");
const classroomScopeSource = fs.readFileSync(new URL("../src/lib/corporate-view-scope.ts", import.meta.url), "utf8");
const procareImportSource = fs.readFileSync(new URL("../src/app/api/imports/procare/route.ts", import.meta.url), "utf8");

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
  assert.match(source, /await prisma\.\$transaction\(async \(tx\) => \{\s*const current = await buildPlan\(tx\);\s*invariant\(current\.fingerprint === initial\.fingerprint/);
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

test("later ProCare imports preserve reconciled invoices and redirect archived classroom matches", () => {
  assert.match(procareImportSource, /staleImportedOpeningBalanceVoidedAt === "string"/);
  assert.match(procareImportSource, /if \(reconciliationProtectedInvoice\)[\s\S]*billingAccountId: account\.id[\s\S]*externalId: invoiceExternalId/);
  assert.doesNotMatch(
    procareImportSource.match(/if \(reconciliationProtectedInvoice\)[\s\S]*?else if \(balanceCents > 0\)/)?.[0] ?? "",
    /importedInvoiceId\s*=/,
  );
  assert.match(procareImportSource, /ledgerEntry\.upsert\([\s\S]*invoiceId: importedInvoiceId/);
  assert.doesNotMatch(
    procareImportSource.match(/if \(reconciliationProtectedInvoice\)[\s\S]*?else if \(balanceCents > 0\)/)?.[0] ?? "",
    /status: PaymentStatus\.OPEN|totalCents: balanceCents|deleteMany/,
  );
  assert.match(procareImportSource, /activeProcareClassroomMatches\(rawMatches, centerId, db\)/);
  assert.match(procareImportSource, /mergedIntoClassroomId[\s\S]*activeClassroomWhere\(\{ centerId, id: \{ in: mergedIntoIds \} \}\)/);
  assert.match(procareImportSource, /redirectedFromArchived[\s\S]*\? \{\}[\s\S]*: \{ name, sourceSystem: "procare", externalId: classroomExternalId \}/);
});

test("family intake and child writes cannot reuse archived classrooms", () => {
  const pageSource = fs.readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const operationsSource = fs.readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
  const familyIntakeSource = fs.readFileSync(new URL("../src/app/api/families/intake/route.ts", import.meta.url), "utf8");
  const aiCommandSource = fs.readFileSync(new URL("../src/app/api/ai/command/route.ts", import.meta.url), "utf8");
  const childLocationSource = fs.readFileSync(new URL("../src/app/api/children/location/route.ts", import.meta.url), "utf8");
  assert.match(pageSource, /classrooms: \{[\s\S]*where: activeClassroomWhere\(\)/);
  assert.match(operationsSource, /activeClassroomWhere\(\{ id: change\.value\.classroomId \}\)/);
  assert.match(operationsSource, /activeClassroomWhere\(\{ id: classroomId \}\)/);
  assert.match(operationsSource, /entity === "staff"[\s\S]*activeClassroomWhere\(\{ id: clean\(body\.classroomId\) \}\)/);
  assert.match(operationsSource, /entity === "staffAssignment"[\s\S]*activeClassroomWhere\(\{ id: classroomId \}\)/);
  assert.match(operationsSource, /entity === "staffScheduleBatch"[\s\S]*activeClassroomWhere\(\{ id: classroomId \}\)/);
  assert.match(familyIntakeSource, /activeClassroomWhere\(\{ id: classroomId \}\)/);
  assert.match(aiCommandSource, /activeClassroomWhere\(\{ id: change\.value\.classroomId, centerId: selectedCenterId \}\)/);
  assert.match(childLocationSource, /activeClassroomWhere\(\{ id: target\.classroomId \}\)/);
  assert.match(pageSource, /classrooms: \{ where: activeClassroomWhere\(\) \}/);
  assert.match(pageSource, /classroom\.aggregate\(\{[\s\S]*where: activeClassroomWhere\(\{ centerId: scopedCenterIds \}\)/);
  assert.match(pageSource, /classroom\.count\(\{ where: activeClassroomWhere\(\{ centerId: center\.id \}\) \}\)/);
});
