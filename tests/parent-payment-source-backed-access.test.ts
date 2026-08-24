import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("positive-balance access preparation requires exact source and family evidence", () => {
  const source = readFileSync("scripts/prepare-source-backed-positive-balance-parent-access.ts", "utf8");
  assert.match(source, /currentlyEnrolledChildWhere/);
  assert.match(source, /family_source_identity_missing/);
  assert.match(source, /child_source_identity_missing/);
  assert.match(source, /source_backed_billing_guardian_missing/);
  assert.match(source, /email_family_scope_ambiguous/);
  assert.match(source, /auth_identity_without_app_user/);
  assert.match(source, /inactive_auth_identity/);
  assert.match(source, /app_user_scope_conflict/);
  assert.match(source, /app_user_not_linked_to_guardian/);
  assert.match(source, /auth\.activeEmails\.has/);
  assert.match(source, /data\.users\.length < 1000/);
  assert.match(source, /page \+= 1/);
  assert.doesNotMatch(source, /nextPage/);
  assert.match(source, /prepareWithoutInvite: true/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /expectedRemaining = plan\.rows\.slice\(index\)/);
  assert.match(source, /parent_portal\.payment_access_prepared/);
  assert.match(source, /invitationsSent: 0/);
  assert.match(source, /chargesCreated: 0/);
  assert.match(source, /autopayChanged: 0/);
});
