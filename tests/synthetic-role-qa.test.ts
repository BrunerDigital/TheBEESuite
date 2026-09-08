import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    "platform",
    "executive",
    "regional",
    "director",
    "assistant",
    "billing",
    "teacher",
    "parent",
    "pickup",
    "auditor",
  ]);
  assert.deepEqual(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => account.role), [
    UserRole.PLATFORM_OWNER,
    UserRole.BRAND_ADMIN,
    UserRole.REGIONAL_MANAGER,
    UserRole.CENTER_DIRECTOR,
    UserRole.ASSISTANT_DIRECTOR,
    UserRole.BILLING_ADMIN,
    UserRole.TEACHER,
    UserRole.PARENT_GUARDIAN,
    UserRole.AUTHORIZED_PICKUP,
    UserRole.READ_ONLY_AUDITOR,
  ]);
  assert.equal(new Set(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => account.email)).size, 10);
  assert.ok(SYNTHETIC_ROLE_QA_ACCOUNTS.every((account) => isSyntheticRoleQaEmail(account.email)));
});

test("credentialed UX QA uses role-appropriate portals, landings, and scopes", () => {
  const byKey = Object.fromEntries(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => [account.key, account]));
  assert.deepEqual(
    Object.fromEntries(SYNTHETIC_ROLE_QA_ACCOUNTS.map((account) => [account.key, [account.scope, account.loginPath, account.landingPath]])),
    {
      platform: ["platform", "/executives", "/dashboard"],
      executive: ["brand", "/executives", "/dashboard"],
      regional: ["brand", "/executives", "/dashboard"],
      director: ["center", "/directors", "/dashboard"],
      assistant: ["center", "/directors", "/dashboard"],
      billing: ["center", "/directors", "/dashboard"],
      teacher: ["center", "/teachers", "/teacher-portal"],
      parent: ["family", "/parents", "/parent-portal"],
      pickup: ["pickup", "/parents", "/parent-portal"],
      auditor: ["brand", "/executives", "/dashboard"],
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

test("platform-owner credentialed QA requires a separate explicit global-access gate", () => {
  const provisioner = readFileSync("scripts/ensure-synthetic-role-qa.ts", "utf8");
  const runner = readFileSync("scripts/qa-credentialed-role-workflows.ts", "utf8");
  for (const source of [provisioner, runner]) {
    assert.match(source, /--include-platform-owner/);
    assert.match(source, /ALLOW_SYNTHETIC_PLATFORM_OWNER_QA/);
  }
});
