import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/repair-centennial-current-family-balances.ts", import.meta.url),
  "utf8",
);

test("Centennial correction is source-locked and current-family scoped", () => {
  assert.match(source, /d1a9ed2de28cc78e92c07a50d33f72b61e8d55cd15d2e62293181d1af57da4e2/);
  assert.match(source, /ce0078045997d86f4711a8956771934301f1540ec1120f3f34e2cc4b06c7bec4/);
  assert.match(source, /GIPSON[\s\S]*desiredCents: 36_800/);
  assert.match(source, /GRAY[\s\S]*desiredCents: 71_800/);
  assert.match(source, /MCINTUR[\s\S]*desiredCents: 77_400/);
  assert.match(source, /currentEnrolledChildren/);
  assert.match(source, /duplicate\.children\.length === 0/);
  assert.match(source, /currentFamiliesOnly: true/);
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
});

test("Centennial correction preserves billing history and unrelated records", () => {
  assert.match(source, /invoice or payment history changed after preflight/);
  assert.match(source, /invoice or payment history changed during correction/);
  assert.match(source, /invoicesMutated: false/);
  assert.match(source, /paymentsMutated: false/);
  assert.doesNotMatch(source, /tx\.invoice\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /tx\.payment\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /tx\.(?:family|child|guardian)\.(?:create|update|delete)/);
});
