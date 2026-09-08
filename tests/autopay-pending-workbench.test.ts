import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("billing workbench shows pending autopay state instead of prompting another attempt", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const workbench = readFileSync("src/components/billing-workbench.tsx", "utf8");

  assert.match(page, /status: PaymentStatus\.DRAFT/);
  assert.match(page, /isActiveStripeAutopayPayment\(payment\)/);
  assert.match(page, /fields\.invoiceId === invoice\.id/);
  assert.match(workbench, /selectedInvoiceHasPendingPayment/);
  assert.match(workbench, /Autopay payment pending/);
  assert.match(workbench, /already has a pending payment/);
  assert.match(workbench, /directorPaymentAmountCents <= 0 \|\| selectedInvoiceHasPendingPayment/);
});
