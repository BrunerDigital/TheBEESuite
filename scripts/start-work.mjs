import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(`ERROR  ${message}`);
  process.exit(1);
}

function run(args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
  });

  if (!allowFailure && result.status !== 0) {
    const detail = capture ? (result.stderr || result.stdout || "").trim() : "";
    fail(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }

  return capture ? (result.stdout || "").trim() : result.status;
}

function refExists(ref) {
  return run(["show-ref", "--verify", "--quiet", ref], { allowFailure: true }) === 0;
}

const [mode, slug] = process.argv.slice(2);

if (!mode || !slug || !["quick", "worktree"].includes(mode)) {
  fail("use `npm run work:quick -- <slug>` or `npm run work:tree -- <slug>`");
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  fail("the slug must use lowercase letters, numbers, and hyphens only");
}

run(["rev-parse", "--show-toplevel"], { capture: true });

const dirty = run(["status", "--porcelain"], { capture: true });
if (dirty) fail("the current checkout has changes; commit or preserve them before starting new work");

run(["fetch", "--prune", "origin"]);

const branch = `work/${mode === "quick" ? "cloud" : "local"}-${slug}`;
if (refExists(`refs/heads/${branch}`) || refExists(`refs/remotes/origin/${branch}`)) {
  fail(`branch ${branch} already exists`);
}

if (mode === "quick") {
  const currentBranch = run(["branch", "--show-current"], { capture: true });
  if (currentBranch !== "main") fail("quick work must start from the clean main branch");

  const head = run(["rev-parse", "HEAD"], { capture: true });
  const originMain = run(["rev-parse", "origin/main"], { capture: true });
  if (head !== originMain) fail("main differs from origin/main; reconcile it before creating a quick-fix branch");

  run(["switch", "-c", branch]);
  console.log(`OK  Created ${branch}. Publish with: git push -u origin HEAD`);
  process.exit(0);
}

const repoRoot = run(["rev-parse", "--show-toplevel"], { capture: true });
const worktreeRoot = resolve(dirname(repoRoot), `${basename(repoRoot)}-worktrees`);
const target = resolve(worktreeRoot, slug);

if (existsSync(target)) fail(`worktree target already exists: ${target}`);

mkdirSync(worktreeRoot, { recursive: true });
run(["worktree", "add", "-b", branch, target, "origin/main"]);
console.log(`OK  Created ${branch} at ${target}`);
console.log(`NEXT  cd "${target}" && npm ci`);
