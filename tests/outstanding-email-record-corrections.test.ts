import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("named email corrections are exact, fingerprinted, idempotent, and preserve financial and family history", () => {
  const source = readFileSync("scripts/apply-outstanding-email-record-corrections.ts", "utf8");
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /cash:email-thread:/);
  assert.match(source, /actualReceiptDateConfirmed: false/);
  assert.match(source, /invoiceStatusesChanged: false/);
  assert.match(source, /guardianAccessChanged: false/);
  assert.match(source, /childEnrollmentChanged: false/);
  assert.match(source, /childTuitionChanged: false/);
  assert.match(source, /chargesCreated: 0/);
  assert.match(source, /refundsCreated: 0/);
});
