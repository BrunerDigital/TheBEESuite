import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  hasSyntheticRoleQaMarker,
  isSyntheticRoleQaEmail,
  SYNTHETIC_ROLE_QA_ACCOUNTS,
  SYNTHETIC_ROLE_QA_SOURCE,
  syntheticRoleQaAccountRef,
  syntheticRoleQaMarker,
} from "@/lib/synthetic-role-qa";

test("credentialed UX QA defines one isolated account for each approved role", () => {
  assert.deepEqual(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => account.key), [
    "executive",
    "director",
    "billing",
    "teacher",
    "parent",
  ]);
  assert.deepEqual(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => account.role), [
    UserRole.BRAND_ADMIN,
    UserRole.CENTER_DIRECTOR,
    UserRole.BILLING_ADMIN,
    UserRole.TEACHER,
    UserRole.PARENT_GUARDIAN,
  ]);
  assert.equal(new Set(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => account.email)).size, 5);
  assert.ok(SYNTHETIC_ROLE_QA_ACCOUNTS.every((account) => isSyntheticRoleQaEmail(account.email)));
});

test("credentialed UX QA uses role-appropriate portals, landings, and scopes", () => {
  const byKey = Object.fromEntries(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => [account.key, account]));
  assert.deepEqual(
    Object.fromEntries(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => [account.key, [account.scope, account.loginPath, account.landingPath]])),
    {
      executive: ["brand", "/executives", "/dashboard"],
      director: ["center", "/directors", "/dashboard"],
      billing: ["center", "/directors", "/dashboard"],
      teacher: ["center", "/teachers", "/teacher-portal"],
      parent: ["family", "/parents", "/parent-portal"],
    },
  );
  assert.notEqual(byKey.executive.scope, byKey.parent.scope);
});

test("credentialed UX QA markers fail closed and preserve safe existing metadata", () => {
  const marker = syntheticRoleQaMarker({ retained: "safe" });
  assert.equal(marker.retained, "safe");
  assert.equal(marker.syntheticTest, true);
  assert.equal(marker.qaSource, SYNTHETIC_ROLE_QA_SOURCE);
  assert.equal(hasSyntheticRoleQaMarker(marker), true);
  assert.equal(hasSyntheticRoleQaMarker({ syntheticTest: true }), false);
  assert.equal(isSyntheticRoleQaEmail("customer@example.com"), false);
  assert.match(syntheticRoleQaAccountRef("qa@synthetic.thebeesuite.io"), /^[a-f0-9]{12}$/);
});
