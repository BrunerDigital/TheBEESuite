import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  expectedVercelProject,
  isExpectedVercelProject,
  readVercelProjectLink,
} from "../scripts/vercel-project-link.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bee-vercel-link-"));
  mkdirSync(join(root, ".vercel"));
  return root;
}

test("direct Vercel project links require the expected project and owner", () => {
  const root = fixture();
  writeFileSync(join(root, ".vercel", "project.json"), JSON.stringify({
    projectId: expectedVercelProject.projectId,
    orgId: expectedVercelProject.orgId,
    projectName: "the-bee-suite",
  }));

  assert.equal(isExpectedVercelProject(readVercelProjectLink(root)), true);
});

test("repository links require an exact root-directory project entry", () => {
  const root = fixture();
  writeFileSync(join(root, ".vercel", "repo.json"), JSON.stringify({ projects: [{
    directory: "apps/other",
    id: expectedVercelProject.projectId,
    orgId: expectedVercelProject.orgId,
    name: "the-bee-suite",
  }] }));
  assert.equal(readVercelProjectLink(root), null);

  writeFileSync(join(root, ".vercel", "repo.json"), JSON.stringify({ projects: [{
    directory: ".",
    id: expectedVercelProject.projectId,
    orgId: "wrong-owner",
    name: "the-bee-suite",
  }] }));
  assert.equal(isExpectedVercelProject(readVercelProjectLink(root)), false);
});
