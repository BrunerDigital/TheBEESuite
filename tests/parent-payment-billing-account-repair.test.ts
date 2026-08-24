import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("missing billing-account repair is preview-first, exact, audited, and financially inert", () => {
  const source = readFileSync("scripts/repair-missing-current-family-billing-accounts.ts", "utf8");
  assert.match(source, /mode: "read_only_preview"/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /--acknowledge-zero-balance-account-creation/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /billingAccount: null/);
  assert.match(source, /stripeSchoolBillingApproval/);
  assert.match(source, /currentlyEnrolledChildWhere/);
  assert.match(source, /balanceCents: 0/);
  assert.match(source, /autopayPlaceholder: false/);
  assert.match(source, /billing\.current_family\.account_prepared/);
  assert.match(source, /chargesCreated: 0/);
  assert.match(source, /invitationsSent: 0/);
});
