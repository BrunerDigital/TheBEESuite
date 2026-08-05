import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/reconcile-oakleaf-procare-balances.ts", import.meta.url), "utf8");

test("Oakleaf balance reconciliation is source-locked, current-family-only, and history-preserving", () => {
  assert.match(source, /SOURCE_AS_OF = "2026-08-02"/);
  assert.match(source, /SOURCE_SHA256 = "[a-f0-9]{64}"/);
  assert.match(source, /CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6"/);
  assert.match(source, /children: \{ some: currentlyEnrolledChildWhere\(\) \}/);
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /--confirm-current-families-only/);
  assert.match(source, /--confirm-preserve-payments-and-invoices/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /sourceSystem_externalId/);
  assert.match(source, /procare_balance_reconciliation/);
  assert.match(source, /paymentsMutated: false/);
  assert.match(source, /invoicesMutated: false/);
  assert.match(source, /verifiedPlan\.changes\.length === 0/);
  assert.doesNotMatch(source, /tx\.invoice\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /tx\.payment\.(?:create|update|delete)/);
});
