import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSchoolOnboardingSetup } from "../src/lib/onboarding-setup";

test("school onboarding setup normalizes director-provided setup sections", () => {
  const setup = normalizeSchoolOnboardingSetup({
    classroomSetup: "Infants - 8 spots - 1:4\nToddlers - 12 spots - 1:6",
    tuitionRateSetup: "Weekly infant tuition $250; Registration fee $100",
    subsidyRules: "ELC accepted",
    balanceRules: "",
    invoiceRules: "Invoices sent Fridays\nDue Mondays",
  });

  assert.equal(setup.status, "needs_director_input");
  assert.deepEqual(setup.completedSections, ["classrooms", "tuitionRates", "subsidyRules", "invoiceRules"]);
  assert.deepEqual(setup.missingSections, ["balanceRules"]);
  assert.deepEqual(setup.sections.classrooms.items, ["Infants - 8 spots - 1:4", "Toddlers - 12 spots - 1:6"]);
  assert.deepEqual(setup.sections.tuitionRates.items, ["Weekly infant tuition $250", "Registration fee $100"]);
});

test("school onboarding setup is ready when all school-specific sections are present", () => {
  const setup = normalizeSchoolOnboardingSetup({
    classroomSetup: "Infants - 8 spots - 1:4",
    tuitionRateSetup: "Weekly infant tuition $250",
    subsidyRules: "ELC accepted",
    balanceRules: "Opening balances imported at cutover",
    invoiceRules: "Invoices due weekly",
  });

  assert.equal(setup.status, "ready_for_review");
  assert.deepEqual(setup.missingSections, []);
});
