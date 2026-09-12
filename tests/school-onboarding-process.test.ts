import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("workspace intake creates every requested school with isolated setup evidence", () => {
  const route = readFileSync("src/app/api/onboarding/route.ts", "utf8");

  assert.match(route, /payload\.locations\.length !== centerCount/);
  assert.match(route, /for \(const \[index, location\] of requestedLocations\.entries\(\)\)/);
  assert.match(route, /const locationDataSetup = normalizeSchoolDataSetupInput/);
  assert.match(route, /schoolDataSetup: \{[\s\S]*\.\.\.locationDataSetup[\s\S]*reviewConfirmation: null/);
  assert.match(route, /preparedFields: preparedBusinessFields[\s\S]*missingBusinessFields/);
  assert.match(route, /excludedFields: \["payout_bank", "family_data", "child_data"\]/);
  assert.match(route, /\.\.\.centers\.map\(\(school\) => \(\{[\s\S]*provider: "bee_suite_inquiry_form"/);
  assert.match(route, /scopeType: "OWNER_GROUP"/);
  assert.ok((route.match(/schoolSetupStatus: "needs_director_input"/g) ?? []).length >= 3);
  assert.match(route, /livePaymentsEnabled: false/);
  assert.match(route, /parentEngagementEnabled: false/);
});

test("final intake review shows every supplied school and its actual data path", () => {
  const panel = readFileSync("src/components/onboarding-flow.tsx", "utf8");

  assert.match(panel, /School profiles to create/);
  assert.match(panel, /locationReview\.locations\.map\(\(location, index\) =>/);
  assert.match(panel, /Review each school and its starting-data path before finishing/);
  assert.match(panel, /Starting data:<\/span> \{dataSetupPathLabel\(location\.dataSetupPath\)\}/);
  assert.match(panel, /location\.dataSetupPath === "import_existing" \? sourceLabelForReview\(location\.dataSourceSystem \?\? ""\) : "None"/);
});

test("school readiness does not require placeholder family or financial records", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");

  assert.match(page, /const confirmedEmptyCleanStart =/);
  assert.match(page, /balanceRules: \{[\s\S]*recordReady: manualComplete\("balanceRules"\)/);
  assert.match(page, /invoiceRules: \{[\s\S]*recordReady: manualComplete\("invoiceRules"\)/);
  assert.match(page, /parentPortalSetup: \{[\s\S]*schoolDataAssessment\.confirmationCurrent[\s\S]*manualComplete\("parentPortal"\)/);
  assert.match(page, /documentCount > 0 \|\| confirmedEmptyCleanStart/);
  assert.match(page, /fteReportingSetup: \{[\s\S]*recordReady: manualComplete\("fteReporting"\)/);
  assert.match(page, /integrationSetup: \{[\s\S]*payoutSetupFlow\.complete[\s\S]*manualComplete\("integrations"\)/);
  assert.doesNotMatch(page, /parentPortalSetup: \{[\s\S]{0,180}guardianLoginCount\s*>\s*0/);
});

test("directors can correct the structured school profile without changing protected setup gates", () => {
  const route = readFileSync("src/app/api/school-setup/route.ts", "utf8");
  const panel = readFileSync("src/components/school-setup-command-center.tsx", "utf8");

  assert.match(panel, /title="School business profile"/);
  for (const field of ["name", "address", "city", "state", "postalCode", "phone", "email", "timezone", "licensedCapacity"]) {
    assert.match(panel, new RegExp(`updateBusinessProfile\\(\\"${field}\\"`));
  }
  assert.match(route, /const businessProfileProvided = hasOwn\(body, "businessProfile"\)/);
  assert.match(route, /const confirmBusinessProfile = body\?\.confirmBusinessProfile === true/);
  assert.match(route, /where: \{ id: center\.id, updatedAt: center\.updatedAt \}/);
  assert.match(route, /buildSchoolBusinessProfilePreparationReceipt/);
  assert.match(panel, /Save & confirm school profile/);
  assert.match(panel, /Existing school workspace/);
  assert.match(panel, /never creates a duplicate school/);
  assert.doesNotMatch(route, /schoolProfileNote|needs confirmation/);
  assert.doesNotMatch(panel, /crmLocationId|locationId|livePaymentsEnabled|parentEngagementEnabled/);
});

test("setup help is authenticated, tenant scoped, rate limited, and omits household details", () => {
  const route = readFileSync("src/app/api/school-setup/support/route.ts", "utf8");

  assert.match(route, /const user = await getCurrentUser\(\)/);
  assert.match(route, /canAccessCenter\(user, centerId\)/);
  assert.match(route, /organization: \{ tenantId: user\.tenantId \}/);
  assert.match(route, /key: `school-setup-support:\$\{user\.id\}:\$\{centerId\}`[\s\S]*limit: 1/);
  assert.match(route, /family and child details were intentionally omitted/);
  assert.match(route, /evidenceFingerprint/);
});

test("held import rows remain blocking after safe rows are written", () => {
  const route = readFileSync("src/app/api/imports/procare/route.ts", "utf8");
  const panel = readFileSync("src/components/procare-import-panel.tsx", "utf8");

  assert.match(route, /const savedDataSetup = readSchoolDataSetup\(center\.customFields\)/);
  assert.match(route, /savedDataSetup\.path === "start_clean"/);
  assert.match(route, /sourceAdapter !== expectedAdapter/);
  assert.match(route, /const mappedImportTargets = new Map<string, ImportCenter>\(\)/);
  assert.match(route, /for \(const targetCenter of mappedImportTargets\.values\(\)\)/);
  assert.match(route, /schoolImportSetupError\(targetCenter, sourceAdapter\)/);
  assert.match(panel, /const batchPersisted =/);
  assert.match(panel, /const importCommitted = batchPersisted && heldRowsAfterCommit === 0/);
  assert.match(panel, /batchPersisted[\s\S]*\? heldRowsAfterCommit === 0/);
  assert.match(panel, /Safe rows imported\.[\s\S]*held row\(s\) still need a decision/);
  assert.match(panel, /batchPersisted \? "Resolve Held Rows"/);
});

test("credentialed director QA includes the existing-school setup route", () => {
  const runner = readFileSync("scripts/qa-credentialed-role-workflows.ts", "utf8");

  assert.match(runner, /director: \[[\s\S]*?id: "setup", href: "\/billing-settings\?view=setup"[\s\S]*?id: "classrooms"/);
  assert.match(runner, /const viewports:[\s\S]*?id: "desktop"[\s\S]*?id: "mobile"/);
});
