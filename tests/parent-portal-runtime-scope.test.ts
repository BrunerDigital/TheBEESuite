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
