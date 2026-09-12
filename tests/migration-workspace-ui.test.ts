import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("director migration setup exposes the complete guided Procare review path", () => {
  const source = fs.readFileSync(path.join(root, "src/components/procare-import-panel.tsx"), "utf8");

  for (const step of [
    "Upload reports",
    "Parse and match",
    "Families and children",
    "Balances and tuition",
    "Exceptions",
    "Confirm package",
  ]) {
    assert.match(source, new RegExp(step));
  }
  assert.match(source, /Confirm reviewed package/);
  assert.match(source, /stable source evidence/);
});

test("school setup offers guarded import and clean-start paths with final confirmation", () => {
  const source = fs.readFileSync(path.join(root, "src/components/school-data-setup-panel.tsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "src/app/api/school-setup/route.ts"), "utf8");
  const readinessServer = fs.readFileSync(path.join(root, "src/lib/data-readiness-server.ts"), "utf8");
  const fingerprintServer = fs.readFileSync(path.join(root, "src/lib/school-data-setup-server.ts"), "utf8");
  const publicGuide = fs.readFileSync(path.join(root, "src/app/resources/director-data-clean-start/page.tsx"), "utf8");

  assert.match(source, /Move Existing Records/);
  assert.match(source, /Start With a Clean Workspace/);
  assert.match(source, /Open Guided Import & Review/);
  assert.match(source, /Run Whole-School Check/);
  assert.match(source, /Confirm Data Review/);
  assert.match(source, /Save & Confirm Data Review/);
  assert.match(source, /Detected from existing import/);
  assert.match(source, /recommendedSourceSystem/);
  assert.match(source, /useUnsavedChangesGuard\(hasUnsavedChanges/);
  assert.match(source, /This school data setup has unsaved changes/);
  assert.match(source, /disabled=\{!data\.centerId \|\| !attested \|\| isPending\}/);
  assert.doesNotMatch(source, /disabled=\{!attested \|\| hasUnsavedChanges \|\| isPending\}/);
  assert.match(source, /does not activate invitations, billing, payments, kiosk access, or cutover/i);
  assert.match(route, /loadSchoolDataReviewEvidence/);
  assert.match(route, /status: 409/);
  assert.match(route, /dataReviewConfirmed/);
  assert.match(readinessServer, /procare\.import\.fleet_verification_exported/);
  assert.doesNotMatch(readinessServer, /procare\.import\.reconciliation_exported/);
  assert.match(fingerprintServer, /prisma\.classroom\.findMany/);
  assert.match(fingerprintServer, /prisma\.staffProfile\.findMany/);
  assert.match(fingerprintServer, /prisma\.invoice\.findMany/);
  assert.match(fingerprintServer, /prisma\.ledgerEntry\.findMany/);
  assert.match(publicGuide, /brand-new school with nothing to import/i);
  assert.match(publicGuide, /Do not create placeholder people or an empty import/i);
});

test("executive migration workbook stays school scoped and preview first", () => {
  const source = fs.readFileSync(path.join(root, "src/components/data-readiness-center.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "src/components/dashboard.tsx"), "utf8");

  assert.match(source, /Migration data workbook/);
  assert.match(source, /Filter by school/);
  assert.match(source, /Current value/);
  assert.match(source, /Proposed correction/);
  assert.match(source, /Preview selected migration decisions/);
  assert.match(source, /does not alter operational family records, balances, tuition, access, billing, or launch state/);
  assert.match(dashboard, /Migration data workbook/);
  assert.match(dashboard, /School migration setup/);
  assert.match(dashboard, /isDirectorDashboard \|\| isExecutiveDashboard/);
});
