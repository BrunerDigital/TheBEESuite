import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/audit-pending-email-evidence.ts", "utf8");

test("pending email audit uses the production receivables allocation model", () => {
  assert.match(source, /buildOutstandingNonInvoiceChargesByAccount/);
  assert.match(source, /openInvoiceTotalCents/);
  assert.match(source, /invoiceReceivableCents/);
  assert.match(source, /paidAgainstOpenInvoicesCents/);
  assert.match(source, /left\.dueDate\.getTime\(\) - right\.dueDate\.getTime\(\)/);
  assert.doesNotMatch(source, /entry\.invoiceId === invoice\.id/);
});
