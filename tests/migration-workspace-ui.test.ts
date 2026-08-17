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
