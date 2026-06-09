import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSchoolOnboardingSetup, schoolOnboardingSetupSections, type SchoolOnboardingSetupInput } from "../src/lib/onboarding-setup";

function completeSetupInput(overrides: SchoolOnboardingSetupInput = {}) {
  return {
    ...Object.fromEntries(schoolOnboardingSetupSections.map((section) => [section.field, `${section.label} ready`])),
    ...overrides,
  } as SchoolOnboardingSetupInput;
}

test("school onboarding setup normalizes director-provided setup sections", () => {
  const setup = normalizeSchoolOnboardingSetup(completeSetupInput({
    classroomSetup: "Infants - 8 spots - 1:4\nToddlers - 12 spots - 1:6",
    tuitionRateSetup: "Weekly infant tuition $250; Registration fee $100",
    subsidyRules: "ELC accepted",
    balanceRules: "",
    invoiceRules: "Invoices sent Fridays\nDue Mondays",
    licensingSetup: "",
  }));

  assert.equal(setup.status, "needs_director_input");
  assert.equal(setup.completedSections.includes("classrooms"), true);
  assert.equal(setup.completedSections.includes("tuitionRates"), true);
  assert.equal(setup.completedSections.includes("subsidyRules"), true);
  assert.equal(setup.completedSections.includes("invoiceRules"), true);
  assert.deepEqual(setup.missingSections, ["balanceRules", "licensingConfiguration"]);
  assert.deepEqual(setup.sections.classrooms.items, ["Infants - 8 spots - 1:4", "Toddlers - 12 spots - 1:6"]);
  assert.deepEqual(setup.sections.tuitionRates.items, ["Weekly infant tuition $250", "Registration fee $100"]);
  assert.equal(setup.sections.staff.label, "Teachers, staff, schedules, and credentials");
  assert.equal(setup.sections.integrations.href, "/integrations");
});

test("school onboarding setup is ready when all school-specific sections are present", () => {
  const setup = normalizeSchoolOnboardingSetup(completeSetupInput({
    classroomSetup: "Infants - 8 spots - 1:4",
    tuitionRateSetup: "Weekly infant tuition $250",
    subsidyRules: "ELC accepted",
    balanceRules: "Opening balances imported at cutover",
    invoiceRules: "Invoices due weekly",
    licensingSetup: "DCF license C-123\nFire drill monthly",
  }));

  assert.equal(setup.status, "ready_for_review");
  assert.deepEqual(setup.missingSections, []);
});
