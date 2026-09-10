import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("production and mobile tooling pin the deployed Node.js 24 major", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { engines?: { node?: string } };
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
    packages?: Record<string, { engines?: { node?: string } }>;
  };
  const mobileReadiness = readFileSync("scripts/mobile-store-readiness-check.mjs", "utf8");
  const iosRunbooks = [
    "docs/PARENT_IOS_BUILD_RUNBOOK.md",
    "docs/TEACHER_IOS_BUILD_RUNBOOK.md",
    "docs/TEACHER_APP_STORE_SUBMISSION_PACKET.md",
  ].map((path) => readFileSync(path, "utf8"));

  assert.equal(packageJson.engines?.node, "24.x");
  assert.equal(packageLock.packages?.[""]?.engines?.node, "24.x");
  assert.match(mobileReadiness, /\^24\(\?:\\\.x\)\?\$/);
  for (const runbook of iosRunbooks) assert.match(runbook, /Node\.js 24\.x/);
});
