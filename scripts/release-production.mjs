import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isExpectedVercelProject, readVercelProjectLink } from "./vercel-project-link.mjs";

export function inspectProductionRelease(root = process.cwd()) {
  function git(args) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 30000 });
    if (result.status !== 0) throw new Error(`Unable to verify git ${args[0]}; release blocked.`);
    return result.stdout.trim();
  }
  const failures = [];
  if (!isExpectedVercelProject(readVercelProjectLink(root))) failures.push("Vercel project link is missing or targets a different project/owner.");
  if (git(["status", "--porcelain", "--untracked-files=all"])) failures.push("Checkout contains staged, unstaged, or untracked changes. Preserve and commit the intended release first.");
  if (git(["remote", "get-url", "origin"]) !== "https://github.com/BrunerDigital/TheBEESuite.git") failures.push("Origin does not match the BEE Suite repository.");
  const commit = git(["rev-parse", "HEAD"]);
  const remoteMain = git(["ls-remote", "--exit-code", "origin", "refs/heads/main"]).split(/\s/)[0];
  if (commit !== remoteMain) failures.push("HEAD is not the current remote main commit. Reconcile the release in a fresh worktree first.");
  return { ok: failures.length === 0, commit, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("Only --check is accepted; deployment overrides are not supported.");
    const result = inspectProductionRelease();
    for (const failure of result.failures) console.error(`BLOCKED: ${failure}`);
    if (!result.ok) process.exitCode = 1;
    else if (process.argv.includes("--check")) console.log(`Release source verified: ${result.commit}`);
    else {
      console.log(`Deploying verified source ${result.commit}; Vercel will run the production validation gate.`);
      const deployment = spawnSync("npx", ["vercel@54.14.0", "deploy", "--prod", "--yes"], { stdio: "inherit", shell: false });
      process.exitCode = deployment.status ?? 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release verification failed.");
    process.exitCode = 1;
  }
}
