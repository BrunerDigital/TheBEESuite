import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Kid City rollout access audit is read-only and verifies real password login", () => {
  const source = readFileSync(new URL("../scripts/audit-kidcity-rollout-access.ts", import.meta.url), "utf8");
  assert.match(source, /--verify-busybees/);
  assert.match(source, /signInWithPassword/);
  assert.match(source, /CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa\.com"/);
  assert.match(source, /excludedFromInvitationWave: school\.location === "Kokomo"/);
  assert.match(source, /grant\.role === UserRole\.CENTER_DIRECTOR/);
  assert.match(source, /grant\.role === UserRole\.BILLING_ADMIN/);
  assert.doesNotMatch(source, /sendEmail|inviteUserByEmail|updateUserById|createUser/);
});
