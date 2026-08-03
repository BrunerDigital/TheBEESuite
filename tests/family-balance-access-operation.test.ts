import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/consolidate-family-balance-access.ts", "utf8");

test("family consolidation operation is dry-run by default and explicitly gated", () => {
  assert.match(source, /if \(!args\.has\(APPLY\)\)/);
  assert.match(source, /args\.has\(CONFIRM_REPAIR\)/);
  assert.match(source, /args\.has\(CONFIRM_SEND\)/);
  assert.match(source, /disableClickTracking: true/);
});

test("withdrawn children are fingerprinted before and after the transaction", () => {
  assert.match(source, /const beforeWithdrawn = await withdrawnSnapshot\(tx\)/);
  assert.match(source, /afterWithdrawn\.fingerprint === beforeWithdrawn\.fingerprint/);
  assert.doesNotMatch(source, /enrollmentStatus:\s*"withdrawn"\s*,\s*classroomId/);
});

test("billing consolidation preserves reviewed balances and avoids invoices and payments", () => {
  assert.match(source, /balanceCents: 99_000/);
  assert.match(source, /balanceAfterCents: 99_000/);
  assert.match(source, /final\.balanceCents === 9_500/);
  assert.doesNotMatch(source, /tx\.invoice\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /tx\.payment\.(?:create|update|delete)/);
});

test("live invitations are limited to Lutes and Mitchell while Jurgens is already invited", () => {
  assert.match(source, /const targets = \[IDS\.li, levi\.id, IDS\.theresa\]/);
  assert.match(source, /alreadyInvitedGuardianIds: \[IDS\.jeyden\]/);
  assert.match(source, /portal\(existing\.customFields\)\.invitationSentAt/);
});
