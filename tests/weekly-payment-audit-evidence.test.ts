import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const allCentersSource = readFileSync(new URL("../scripts/audit-weekly-auto-payment-all-centers.ts", import.meta.url), "utf8");
const thursdaySource = readFileSync(new URL("../scripts/audit-thursday-weekly-payment-periods.ts", import.meta.url), "utf8");

test("weekly autopay audit prefers the invoices actually settled by the payment", () => {
  assert.match(allCentersSource, /appliedInvoiceIds\.length > 0/);
  assert.match(allCentersSource, /\[\.\.\.new Set\(appliedInvoiceIds\)\]/);
  assert.match(allCentersSource, /: invoiceId \? \[invoiceId\] : \[\]/);
});

test("Thursday payment audit reads invoice application metadata from both sides", () => {
  assert.match(thursdaySource, /string\(fields\.paymentId\) === payment\.id/);
  assert.match(thursdaySource, /appliedInvoiceIds\.includes\(invoice\.id\)/);
  assert.match(thursdaySource, /invoice\.ledgerEntries\.some\(\(entry\) => entry\.paymentId === payment\.id\)/);
});
