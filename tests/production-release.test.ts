import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectProductionRelease } from "../scripts/release-production.mjs";
import { expectedVercelProject } from "../scripts/vercel-project-link.mjs";

test("release guard rejects an incorrect remote, dirty work, stale commits, and wrong projects", () => {
  const root = mkdtempSync(join(tmpdir(), "bee-release-check-"));
  const remote = join(root, "remote.git");
  const checkout = join(root, "checkout");
  mkdirSync(checkout);
  function git(args: string[], cwd = checkout) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  try {
    git(["init", "--bare", remote], root);
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.test"]);
    git(["remote", "add", "origin", "https://github.com/BrunerDigital/TheBEESuite.git"]);
    git(["config", `url.${remote}.insteadOf`, "https://github.com/BrunerDigital/TheBEESuite.git"]);
    writeFileSync(join(checkout, ".gitignore"), ".vercel/\n");
    git(["add", ".gitignore"]);
    git(["commit", "-m", "initial"]);
    git(["push", "origin", "main"]);
    mkdirSync(join(checkout, ".vercel"));
    writeFileSync(join(checkout, ".vercel/project.json"), JSON.stringify(expectedVercelProject));
    // A local remote exercises the live-ref lookup without a network request.
    git(["config", "--unset", `url.${remote}.insteadOf`]);
    git(["remote", "set-url", "origin", remote]);
    assert.match(inspectProductionRelease(checkout).failures.join("\n"), /Origin does not match/);
    writeFileSync(join(checkout, "untracked.txt"), "must not deploy");
    assert.match(inspectProductionRelease(checkout).failures.join("\n"), /untracked changes/);
    git(["add", "untracked.txt"]);
    git(["commit", "-m", "not pushed"]);
    assert.match(inspectProductionRelease(checkout).failures.join("\n"), /not the current remote main/);
    writeFileSync(join(checkout, ".vercel/project.json"), JSON.stringify({ ...expectedVercelProject, projectId: "wrong" }));
    assert.match(inspectProductionRelease(checkout).failures.join("\n"), /different project/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
