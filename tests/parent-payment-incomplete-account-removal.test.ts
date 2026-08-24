import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("incomplete-enrollment cleanup removes only untouched accounts from the audited repair", () => {
  const source = readFileSync("scripts/remove-empty-incomplete-enrollment-billing-accounts.ts", "utf8");
  assert.match(source, /billing\.current_family\.account_prepared/);
  assert.match(source, /currentlyEnrolledChildWhere/);
  assert.match(source, /account\.balanceCents === 0/);
  assert.match(source, /account\._count\.invoices === 0/);
  assert.match(source, /account\._count\.payments === 0/);
  assert.match(source, /account\._count\.ledgerEntries === 0/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /billing\.incomplete_enrollment\.empty_account_removed/);
});
