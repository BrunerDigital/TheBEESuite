import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAgencyWorkspaceCenter } from "../src/lib/agency-workspace-selection";

const centers = [{ id: "first-school" }, { id: "second-school" }];

test("agency reconciliation deep links select the requested authorized school", () => {
  assert.equal(resolveAgencyWorkspaceCenter(centers, "second-school"), "second-school");
  assert.equal(resolveAgencyWorkspaceCenter(centers), "first-school");
});

test("unavailable agency school targets never fall back to another school", () => {
  assert.equal(resolveAgencyWorkspaceCenter(centers, "unavailable-school"), "");
  assert.equal(resolveAgencyWorkspaceCenter([], "second-school"), "");
  assert.equal(resolveAgencyWorkspaceCenter([]), "");
});

test("billing query selection reaches the agency workspace and resets it on navigation", () => {
  const page = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(page, /<AgencySubsidyWorkspace key=\{JSON\.stringify\(\[data\.initialSelection\?\.centerId,/);
  assert.match(page, /<AgencySubsidyWorkspace[\s\S]*?initialCenterId=\{data\.initialSelection\?\.centerId\}/);
  assert.match(workspace, /useEffect\(\(\) => \{\s+if \(!centerId\) return;/);
});
