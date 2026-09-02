import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the shared directory separates review destinations from data-changing work", () => {
  const directory = source("src/components/workspace-section-directory.tsx");
  const preferences = source("src/components/workspace-preferences.tsx");

  assert.match(directory, /<nav[\s\S]*aria-labelledby=\{titleId\}/);
  assert.match(directory, /Review information/);
  assert.match(directory, /Add or update/);
  assert.match(directory, /<a[\s\S]*href=\{destination\.href\}/);
  assert.doesNotMatch(directory, /onClick|router\.push|scrollIntoView/);
  assert.match(directory, /min-h-11 w-full[\s\S]*sm:w-auto/);
  assert.match(preferences, /<section[\s\S]*id=\{id\}[\s\S]*data-collapsible-panel/);
});

test("agency claims expose direct edit anchors and a compact review queue", () => {
  const agency = source("src/components/agency-subsidy-workspace.tsx");

  for (const id of ["agency-program-setup", "agency-authorization-editor", "agency-claim-builder", "agency-claim-queue"]) {
    assert.match(agency, new RegExp(`id="${id}"`));
    assert.match(agency, new RegExp(`href: "#${id}"`));
  }
  assert.match(agency, /<CollapsibleCard id="agency-claim-queue"[\s\S]*defaultCollapsed/);
  assert.match(agency, /collapsedSummary=\{`\$\{claims\.length\} claim/);
});

test("staff review data collapses while editing destinations retain stable anchors", () => {
  const staff = source("src/components/staff-management-panel.tsx");

  assert.match(staff, /<CollapsiblePanel[\s\S]*id="staff-coverage"[\s\S]*defaultCollapsed/);
  assert.match(staff, /<CollapsiblePanel[\s\S]*id="staff-payroll"[\s\S]*defaultCollapsed/);
  for (const id of ["staff-assignment", "staff-time-clock", "staff-profile", "staff-certification", "staff-schedule"]) {
    assert.match(staff, new RegExp(`id="${id}"`));
    assert.match(staff, new RegExp(`href: "#${id}"`));
  }
});

test("family billing keeps routine tasks visible and secondary tasks expandable", () => {
  const billing = source("src/components/billing-workbench.tsx");

  assert.match(billing, /aria-label="Billing tasks"/);
  assert.match(billing, /id="billing-more-actions"/);
  assert.match(billing, /aria-expanded=\{moreBillingActionsExpanded\}/);
  assert.match(billing, /aria-controls="billing-action-tabs"/);
  assert.equal(billing.match(/<TabsList/g)?.length, 1);
  assert.match(billing, /!moreBillingActionsExpanded && billingAction !== "edit" \? "hidden"/);
  assert.match(billing, /id="billing-family-overview"/);
  assert.match(billing, /id="billing-payment-methods"/);
  assert.match(billing, /id="billing-actions"/);
  assert.match(billing, /window\.location\.hash\.slice\(1\)/);
  assert.match(billing, /document\.getElementById\(sectionId\)\?\.scrollIntoView\(\{ block: "start" \}\)/);
});

test("corporate administration collapses directories and anchors its editing tools", () => {
  const admin = source("src/components/executive-admin-console.tsx");

  assert.match(admin, /id="executive-schools"[\s\S]*defaultCollapsed/);
  assert.match(admin, /id="existing-user-directory"[\s\S]*defaultCollapsed/);
  for (const id of ["admin-school-editor", "admin-user-editor", "admin-owner-groups", "admin-password-controls", "admin-bulk-import"]) {
    assert.match(admin, new RegExp(`id="${id}"`));
    assert.match(admin, new RegExp(`href: "#${id}"`));
  }
});
