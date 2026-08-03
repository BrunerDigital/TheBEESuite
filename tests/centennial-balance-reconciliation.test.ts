import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/reconcile-centennial-photo-balances.ts", import.meta.url),
  "utf8",
);

test("Centennial balance reconciliation is source-locked and payment-preserving", () => {
  assert.match(source, /--confirm-centennial-photo-balances/);
  assert.match(source, /--confirm-preserve-payments-and-invoices/);
  assert.match(source, /6cca7fd70991391d719764b415afabd45cbba6064c8320e6efd99cef752ae1ac/);
  assert.match(source, /ce0078045997d86f4711a8956771934301f1540ec1120f3f34e2cc4b06c7bec4/);
  assert.match(source, /2b1abe4ac1149b702f76374ba5e4caef6cdd6037616545aaaa4997db54b8ea83/);
  assert.match(source, /centennial-balance-plan\.json/);
  assert.doesNotMatch(source, /const SOURCE_ROWS: SourceRow\[\] = \[/);
  assert.match(source, /EXPECTED_SOURCE_ROWS = 18/);
  assert.match(source, /EXPECTED_SOURCE_TOTAL_CENTS = 620_510/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /billing\.centennial_photo_balance_reconciled/);
  assert.match(source, /paymentsMutated: false/);
  assert.match(source, /invoicesMutated: false/);
  assert.doesNotMatch(source, /payment\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /invoice\.(?:create|update|delete)/);
});

test("unresolved household ownership remains outside the balance-only repair", () => {
  assert.match(source, /billingOnlyShell: true/);
  assert.match(source, /needsAccountResolution: true/);
  assert.match(source, /childAssignmentHeld: true/);
  assert.match(source, /guardianCreationHeld: true/);
  assert.match(source, /accessCreated: false/);
  assert.match(source, /invitationsSent: false/);
  assert.doesNotMatch(source, /tx\.child\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /tx\.guardian\.(?:create|update|delete)/);
});
