import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveParentPortalFamilyScope } from "../src/lib/parent-portal-family-scope";

test("parent portal runtime scope allows duplicate guardian rows for one family", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1" },
    { id: "guardian_2", familyId: "family_1" },
  ]), {
    ok: true,
    familyId: "family_1",
    guardianIds: ["guardian_1", "guardian_2"],
  });
});

test("parent portal runtime scope fails closed across families", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1" },
    { id: "guardian_2", familyId: "family_2" },
  ]), {
    ok: false,
    reason: "multiple_linked_families",
    familyIds: ["family_1", "family_2"],
  });
});

test("parent portal runtime scope selects the only family with a currently enrolled child", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_current", familyId: "family_current", currentChildCount: 1 },
    { id: "guardian_history", familyId: "family_history", currentChildCount: 0 },
  ]), {
    ok: true,
    familyId: "family_current",
    guardianIds: ["guardian_current"],
  });
});

test("parent portal runtime scope still fails closed across two current families", () => {
  assert.deepEqual(resolveParentPortalFamilyScope([
    { id: "guardian_1", familyId: "family_1", currentChildCount: 1 },
    { id: "guardian_2", familyId: "family_2", currentChildCount: 2 },
    { id: "guardian_history", familyId: "family_history", currentChildCount: 0 },
  ]), {
    ok: false,
    reason: "multiple_linked_families",
    familyIds: ["family_1", "family_2"],
  });
});

test("every parent setup and billing mutation enforces unambiguous family scope", () => {
  for (const path of [
    "src/app/api/parent/setup/route.ts",
    "src/app/api/parent/kiosk-credential/route.ts",
    "src/app/api/parent/products/purchase/route.ts",
    "src/app/api/billing/checkout-session/route.ts",
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/payment-method-session/route.ts",
  ]) {
    assert.match(readFileSync(path, "utf8"), /getParentPortalFamilyScope\(user\.id\)/, path);
  }
});

test("parent setup page uses current-family scope and excludes historical family rows", () => {
  const page = readFileSync("src/app/parent-portal/setup/page.tsx", "utf8");
  assert.match(page, /getParentPortalFamilyScope\(user\.id\)/);
  assert.match(page, /guardians\.filter\(\(guardian\) => guardian\.familyId === familyScope\.familyId\)/);
  assert.doesNotMatch(page, /resolveParentPortalFamilyScope\(guardians\)/);
});
