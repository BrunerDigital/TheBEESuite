import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canUseBeesResources } from "../src/lib/bees-resources";

test("BEES is available to Kid City management roles only", () => {
  for (const role of ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"]) {
    assert.equal(canUseBeesResources({ role, branding: { kind: "kid-city-usa" } }), true);
    assert.equal(canUseBeesResources({ role, branding: { kind: "bee-suite" } }), false);
    assert.equal(canUseBeesResources({ role, branding: { kind: "miss-honeys-learning-center" } }), false);
    assert.equal(canUseBeesResources({ role }), false);
  }
  for (const role of ["TEACHER", "PARENT_GUARDIAN", "AUTHORIZED_PICKUP", "BILLING_ADMIN", "READ_ONLY_AUDITOR", "UNKNOWN", ""]) {
    assert.equal(canUseBeesResources({ role, branding: { kind: "kid-city-usa" } }), false);
  }
  assert.equal(canUseBeesResources(null), false);
  assert.equal(canUseBeesResources(), false);
});

test("direct BEES requests enforce the same eligibility after authentication and workspace selection", () => {
  const page = readFileSync(new URL("../src/app/bees/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!user\) redirect\(loginHrefForNextPath\("\/bees"\)\)/);
  assert.match(page, /requiresPasswordResetGate\(user\)/);
  assert.match(page, /workspaceSelectionRedirect\(user.workspace, "\/bees"\)/);
  assert.match(page, /if \(!canUseBeesResources\(user\)\) notFound\(\)/);
  assert.ok(page.indexOf("if (!canUseBeesResources(user))") < page.indexOf("<AppShell"));
});
