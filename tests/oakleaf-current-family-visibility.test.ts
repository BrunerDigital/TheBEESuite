import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/reconcile-oakleaf-current-family-visibility.ts", import.meta.url), "utf8");

test("Oakleaf current-family visibility repair is source-locked and financially non-mutating", () => {
  assert.match(source, /SOURCE_SHA256 = "[a-f0-9]{64}"/);
  assert.match(source, /CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6"/);
  assert.match(source, /--confirm-oakleaf-family-visibility/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /weeklyCents: 13_000/);
  assert.match(source, /weeklyCents: 0/);
  assert.match(source, /vpk only child no private charges/i);
  assert.match(source, /zenari - subsidy family \(vpk\)/i);
  assert.match(source, /nextWeeklyBillingPeriod\(new Date\(\)\)/);
  assert.match(source, /balancesToChange: 0/);
  assert.match(source, /invoicesToCreate: 0/);
  assert.match(source, /paymentsToSubmit: 0/);
  assert.match(source, /ledgerEntriesToCreate: 0/);
  assert.doesNotMatch(source, /tx\.invoice\.(?:create|update|delete|upsert)/);
  assert.doesNotMatch(source, /tx\.payment\.(?:create|update|delete|upsert)/);
  assert.doesNotMatch(source, /tx\.ledgerEntry\.(?:create|update|delete|upsert)/);
});
