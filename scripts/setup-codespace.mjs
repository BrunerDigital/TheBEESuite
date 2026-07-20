import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const isCodespace = process.env.CODESPACES === "true";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    env: options.env ?? process.env,
  });
  return result.status === 0;
}

function report(ok, label, detail = "") {
  console.log(`${ok ? "OK" : "ACTION"}  ${label}${detail ? ` - ${detail}` : ""}`);
}

if (!isCodespace) {
  console.log("INFO  Codespace bootstrap skipped outside GitHub Codespaces.");
  process.exit(0);
}

const ghEnv = process.env.GITHUB_TOKEN
  ? { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN }
  : process.env;
const githubReady = run("gh", ["auth", "status", "--hostname", "github.com"], {
  quiet: true,
  env: ghEnv,
});
report(githubReady, "GitHub authentication", githubReady ? "Codespaces token is active" : "rebuild or recreate the Codespace");

const remoteReady = run("git", ["ls-remote", "--exit-code", "origin", "HEAD"], {
  quiet: true,
});
report(remoteReady, "GitHub repository access", remoteReady ? "origin is reachable" : "check Codespace repository permissions");

let vercelReady = run("npx", ["vercel@54.14.0", "whoami"], { quiet: true });
if (!vercelReady && process.env.VERCEL_TOKEN) {
  vercelReady = run(
    "npx",
    [
      "vercel@54.14.0",
      "link",
      "--yes",
      "--project",
      "the-bee-suite",
      "--scope",
      "brunerdigitals-projects",
      "--token",
      process.env.VERCEL_TOKEN,
    ],
    { quiet: true }
  );
}
report(vercelReady, "Vercel authentication", vercelReady ? "CLI account is active" : "add the VERCEL_TOKEN Codespaces secret");

const linked = existsSync(".vercel/project.json");
report(linked, "Vercel project link", linked ? "the-bee-suite" : "run npm run cloud:link after adding VERCEL_TOKEN");

const envReady = existsSync(".env.local");
report(envReady, "Local environment", envReady ? ".env.local is present" : "run npm run cloud:env after Vercel is linked");

if (!githubReady || !remoteReady || !vercelReady || !linked || !envReady) {
  console.log("INFO  See docs/CODESPACES_SETUP.md for the one-time setup steps.");
}
