import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";

const operationsRoute = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");
const familyIntake = readFileSync(new URL("../src/app/api/families/intake/route.ts", import.meta.url), "utf8");
const procareImport = readFileSync(new URL("../src/app/api/imports/procare/route.ts", import.meta.url), "utf8");
const billingPage = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
const billingUi = readFileSync(new URL("../src/components/live-ops-pages.tsx", import.meta.url), "utf8");
const inviteButton = readFileSync(new URL("../src/components/parent-portal-invite-button.tsx", import.meta.url), "utf8");
const enrollmentPanels = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");

test("all interactive re-enrollment write paths enforce the shared classroom validation", () => {
  assert.match(operationsRoute, /enrollmentClassroomValidationError\(\{ enrollmentStatus, classroomId \}\)/);
  assert.match(operationsRoute, /mergedClassroomError = enrollmentClassroomValidationError/);
  assert.match(familyIntake, /enrollmentClassroomValidationError\(\{ enrollmentStatus, classroomId \}\)/);
  assert.match(procareImport, /nextEnrollmentStatus[\s\S]*nextClassroomId[\s\S]*enrollmentClassroomValidationError/);
  assert.match(familyEditor, /childEnrollmentClassroomError/);
  assert.match(familyEditor, /Boolean\(childEnrollmentClassroomError\)/);
});

test("withdrawn to enrolled with a valid classroom becomes billing-visible after server refresh", () => {
  assert.equal(isCurrentlyEnrolledChildRecord({ enrollmentStatus: "withdrawn", classroomId: null }), false);
  assert.equal(isCurrentlyEnrolledChildRecord({ enrollmentStatus: "enrolled", classroomId: "room-longmont" }), true);
  assert.match(operationsRoute, /reenrollmentContext = \{ familyId, childId: resultId, centerId \}/);
  assert.match(operationsRoute, /revalidatePath\("\/billing-invoices"\)/);
  assert.match(operationsRoute, /revalidatePath\("\/api\/dashboard\/accounts-receivable"\)/);
  assert.match(familyEditor, /router\.refresh\(\)/);
  assert.match(familyEditor, /familyId:[\s\S]*centerId:[\s\S]*childId:[\s\S]*Open billing/);
  assert.match(operationsRoute, /reenrollments,[\s\S]*entity === "child" \|\| entity === "childMerge"/);
  assert.match(enrollmentPanels, /reenrollments\?\.length === 1[\s\S]*familyId:[\s\S]*centerId:[\s\S]*childId:[\s\S]*Open billing/);
});

test("past families with outstanding billing remain payment-visible while current totals stay enrollment-scoped", () => {
  assert.match(billingPage, /workbenchFamilyWhere[\s\S]*currentOrOutstandingFamilyWhere\(\)/);
  assert.match(billingPage, /currentBillingAccountWhere = visibleCurrentBillingAccountWhere\(visibleCenterIds\)/);
  assert.match(billingPage, /ledgerEntry\.findMany\([\s\S]*billingAccount: currentBillingAccountWhere/);
  assert.match(billingPage, /enrollmentStatus: \{ in: currentlyEnrolledStatusValues\(\) \}[\s\S]*classroomId: null/);
  assert.match(billingUi, /Needs enrollment setup/);
  assert.match(billingUi, /remain non-chargeable and excluded from active Billing and Accounts Receivable totals/);
});

test("re-enrollment does not send invitations or alter existing parent credentials", () => {
  const childBranch = operationsRoute.slice(
    operationsRoute.indexOf('} else if (entity === "child")'),
    operationsRoute.indexOf('} else if (entity === "childMerge")'),
  );
  assert.doesNotMatch(childBranch, /parent\/invitations|sendEmail|inviteUserByEmail|updateUserById|ensureParentPortalLoginForGuardian/);
  assert.match(inviteButton, /linked \? "Resend Parent App Invite" : "Send Parent App Invite"/);
  assert.match(inviteButton, /Resend sends a reminder only; their existing account and password are preserved/);
});
