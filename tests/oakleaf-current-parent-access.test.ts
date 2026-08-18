import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/prepare-oakleaf-current-parent-access.ts", import.meta.url), "utf8");

test("Oakleaf parent access preparation is scoped, no-invite, and billing safe", () => {
  assert.match(source, /CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6"/);
  assert.match(source, /SOURCE_SHA256 = "[a-f0-9]{64}"/);
  assert.match(source, /OAKLEAF_PROCARE_ACCOUNT_CSV_PATH/);
  assert.match(source, /--confirm-oakleaf-parent-access/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /prepareWithoutInvite: true/);
  assert.match(source, /invitationsToSend: 0/);
  assert.match(source, /blockedMissingEmail/);
  assert.doesNotMatch(source, /Barnhart Family/);
  assert.doesNotMatch(source, /Abigail Brown Family/);
  assert.doesNotMatch(source, /Lamarriel Johnson Family/);
  assert.doesNotMatch(source, /Noura Elofir Family/);
  assert.match(source, /Balais Family/);
  assert.match(source, /Cadet Family/);
  assert.match(source, /Nsairat Family/);
  assert.match(source, /Tyler Ramirez Family/);
  assert.match(source, /invitationAuditCount === 0 && invitationDeliveryCount === 0/);
  assert.match(source, /An Oakleaf balance changed while preparing parent access/);
  assert.match(source, /An Oakleaf invoice changed while preparing parent access/);
  assert.match(source, /An Oakleaf payment changed while preparing parent access/);
  assert.match(source, /An Oakleaf ledger entry changed while preparing parent access/);
  assert.doesNotMatch(source, /sendEmail|sendParentInvitation|sendImportedParentInvitation/);
});
