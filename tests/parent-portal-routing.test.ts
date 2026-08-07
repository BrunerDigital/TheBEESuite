import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("legacy parent redirects do not shadow the authenticated parent workspace", () => {
  const nextConfig = readFileSync("next.config.ts", "utf8");
  const workspacePage = readFileSync("src/app/[slug]/page.tsx", "utf8");

  assert.doesNotMatch(nextConfig, /source:\s*"\/parent-portal/);
  assert.equal(existsSync("src/app/parent-portal/[...legacyPath]/page.tsx"), true);
  assert.equal(existsSync("src/app/parent-portal/[[...legacyPath]]/page.tsx"), false);
  assert.equal(existsSync("src/app/parent-portal/setup/page.tsx"), true);
  assert.match(workspacePage, /if \(slug === "parent-portal"\)/);
});
