import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  billingFamilyAccountCategory,
  childTuitionEligibilityError,
  singleInvoiceFamilyEligibilityError,
} from "@/lib/prospective-family-billing";

test("billing account category separates current, prospective, and past families", () => {
  assert.equal(billingFamilyAccountCategory([
    { enrollmentStatus: "pending", classroomId: null },
    { enrollmentStatus: "active", classroomId: "room-1" },
  ]), "current");
  assert.equal(billingFamilyAccountCategory([
    { enrollmentStatus: "pending", classroomId: null },
    { enrollmentStatus: "waitlisted", classroomId: null },
  ]), "prospective");
  assert.equal(billingFamilyAccountCategory([
    { enrollmentStatus: "withdrawn", classroomId: null },
  ]), "past");
});

test("prospective families can receive enrollment fees but not tuition invoices", () => {
  assert.equal(singleInvoiceFamilyEligibilityError("prospective", "custom"), null);
  assert.equal(singleInvoiceFamilyEligibilityError("prospective", "product"), null);
  assert.match(singleInvoiceFamilyEligibilityError("prospective", "tuitionPlan") ?? "", /Recurring tuition is unavailable/);
  assert.match(singleInvoiceFamilyEligibilityError("past", "custom") ?? "", /New invoices are unavailable/);
  assert.equal(singleInvoiceFamilyEligibilityError("current", "tuitionPlan"), null);
});

test("recurring tuition requires both current status and classroom assignment", () => {
  assert.equal(childTuitionEligibilityError({ enrollmentStatus: "current", classroomId: "room-1" }), null);
  assert.match(childTuitionEligibilityError({ enrollmentStatus: "pending", classroomId: null }) ?? "", /current enrollment/);
  assert.match(childTuitionEligibilityError({ enrollmentStatus: "enrolled", classroomId: null }) ?? "", /assigned classroom/);
});

test("billing workbench includes pipeline families without widening receivable totals", () => {
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const workbench = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");

  assert.match(page, /workbenchFamilyWhere[\s\S]*prospectiveEnrollmentChildWhere\(\)/);
  assert.match(page, /children: \{[\s\S]*currentlyEnrolledChildWhere\(\)[\s\S]*prospectiveEnrollmentChildWhere\(\)/);
  assert.match(page, /currentBillingAccountWhere = visibleCurrentBillingAccountWhere\(visibleCenterIds\)/);
  assert.match(page, /billingFamilyAccountCategory\(family\.children\)/);
  assert.match(workbench, /Prospective family billing/);
  assert.match(workbench, /Prepare Enrollment Fee/);
  assert.match(workbench, /!selectedFamilyIsProspective \? <>[\s\S]*Tuition rate setup[\s\S]*Set each child.s recurring tuition[\s\S]*<\/\> : null/);
  assert.match(workbench, /Recurring tuition stays unavailable until a child is current and assigned to a classroom/);
  assert.match(workbench, /allowTuitionPlan=\{!selectedFamilyIsProspective\}/);
  assert.match(workbench, /TabsTrigger value="recurring" disabled=\{selectedFamilyIsProspective \|\| selectedFamilyIsPast\}/);
});

test("server routes enforce the same prospective tuition safeguards", () => {
  const invoices = readFileSync(new URL("../src/app/api/billing/invoices/route.ts", import.meta.url), "utf8");
  const assignments = readFileSync(new URL("../src/app/api/billing/tuition-assignments/route.ts", import.meta.url), "utf8");

  assert.match(invoices, /singleInvoiceFamilyEligibilityError\(accountCategory, charge\.chargeSource\)/);
  assert.match(invoices, /charge\.chargeSource === "tuitionPlan" && child/);
  assert.match(invoices, /charge\.chargeSource === "tuitionPlan"[\s\S]*currentlyEnrolledChildWhere\(\)/);
  assert.match(invoices, /Tuition batches are limited to current enrollments with assigned classrooms/);
  assert.match(assignments, /const childEligibilityError = childTuitionEligibilityError\(access\.child\)/);
  assert.match(assignments, /if \(!enabled\)[\s\S]*childTuitionEligibilityError/);
});
