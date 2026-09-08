import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/reconcile-centennial-reported-opening-balances.ts", import.meta.url), "utf8");

test("Centennial reported opening-balance correction is exact, fingerprinted, and idempotent", () => {
  assert.match(source, /CARRILLO[\s\S]*expectedBalanceCents: 53_100/);
  assert.match(source, /SMITH[\s\S]*expectedBalanceCents: 39_200/);
  assert.match(source, /EVANS[\s\S]*expectedBalanceCents: 14_490/);
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /alreadyApplied/);
  assert.match(source, /unsupportedInvoices\.length === 0/);
});

test("Centennial correction preserves invoices, payments, and financial history", () => {
  assert.match(source, /invoice or payment history changed after preflight/);
  assert.match(source, /invoice or payment history changed during correction/);
  assert.match(source, /type: "billing_correction"/);
  assert.match(source, /invoicesMutated: 0/);
  assert.match(source, /paymentsMutated: 0/);
  assert.doesNotMatch(source, /tx\.invoice\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /tx\.payment\.(?:create|update|delete)/);
});
