import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSchoolOnboardingSetup, schoolOnboardingSetupSections, type SchoolOnboardingSetupInput } from "../src/lib/onboarding-setup";
import { directorLaunchChecklistTasks, directorLaunchChecklistTasksForPayoutSetup, teacherProfileChecklistTasks } from "../src/lib/setup-checklists";

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
  assert.equal(setup.sections.invoiceRules.href, "/billing-invoices?view=payments");
  assert.equal(setup.sections.licensingConfiguration.href, "/forms?view=compliance");
  assert.equal(setup.sections.integrations.href, "/billing-settings?view=integrations");
  assert.equal(setup.sections.parentPortal.href, "/family-detail#family-guardians");
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

test("director launch checklist opens payout bank setup in billing settings", () => {
  const payoutTask = directorLaunchChecklistTasks.find((task) => task.id === "payout-bank-account");

  assert.ok(payoutTask);
  assert.equal(payoutTask.href, "/billing-settings#payout-setup");
  assert.match(payoutTask.description, /Stripe account already exists/i);
  assert.match(payoutTask.description, /school email and its existing Stripe password/i);
  assert.match(payoutTask.description, /no password was set/i);
});

test("director payout checklist can open the stable school reauthorization page", () => {
  const tasks = directorLaunchChecklistTasksForPayoutSetup({
    href: "/stripe-reauthorization?center=center_1",
    replacementInProgress: true,
  });
  const payoutTask = tasks.find((task) => task.id === "payout-bank-account");

  assert.ok(payoutTask);
  assert.equal(payoutTask.href, "/stripe-reauthorization?center=center_1");
  assert.match(payoutTask.title, /existing Stripe account/i);
  assert.match(payoutTask.description, /school email and existing Stripe password/i);
  assert.match(payoutTask.description, /Parent payments remain/i);
});

test("school dashboard setup steps use current consolidated routes", () => {
  const legacyAliases = new Set([
    "/attendance",
    "/compliance",
    "/documents",
    "/integrations",
    "/payments",
    "/school-setup",
  ]);
  const hrefs = [
    ...schoolOnboardingSetupSections.map((section) => section.href),
    ...directorLaunchChecklistTasks.map((task) => task.href).filter((href): href is string => Boolean(href)),
  ];

  assert.deepEqual(hrefs.filter((href) => legacyAliases.has(href)), []);
  assert.equal(directorLaunchChecklistTasks.find((task) => task.id === "login-school-profile")?.href, "/billing-settings?view=setup");
  assert.equal(directorLaunchChecklistTasks.find((task) => task.id === "required-documents")?.href, "/forms?view=documents");
  assert.equal(directorLaunchChecklistTasks.find((task) => task.id === "attendance-kiosk")?.href, "/classroom-dashboard?view=attendance");
  assert.equal(directorLaunchChecklistTasks.find((task) => task.id === "compliance-incidents")?.href, "/forms?view=compliance");
  assert.equal(directorLaunchChecklistTasks.find((task) => task.id === "parent-portal")?.href, "/family-detail#family-guardians");
});

test("teacher setup links stay within teacher-accessible workspaces", () => {
  const scheduleTask = teacherProfileChecklistTasks.find((task) => task.id === "schedule-coverage");
  assert.equal(scheduleTask?.href, "/teacher-portal");
});
