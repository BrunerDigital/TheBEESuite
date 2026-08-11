import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("director billing copy describes payment actions without implementation notes", () => {
  const workbench = source("src/components/billing-workbench.tsx");
  const familyEditor = source("src/components/family-record-editor.tsx");

  assert.match(workbench, /Family billing/);
  assert.match(workbench, /Send a secure payment link/);
  assert.match(workbench, /Process invoice with autopay/);
  assert.match(workbench, /Account credit is applied first/);
  assert.doesNotMatch(workbench, /Hosted handoffs and saved-method charges are created server-side/);
  assert.doesNotMatch(workbench, /The BEE Suite route/);
  assert.doesNotMatch(workbench, /profile notification/);
  assert.doesNotMatch(workbench, /Instant Bank Login|Verify Bank Instantly/);
  assert.match(familyEditor, /Connect bank account/);
  assert.match(familyEditor, /Save card/);
  assert.doesNotMatch(familyEditor, /Instant Bank Login|Verify Bank Instantly|Replace With Card|Add Card/);
});

test("billing action labels name the real action and hide internal identifiers", () => {
  const invoiceActions = source("src/components/invoice-stored-payment-button.tsx");
  const autopayActions = source("src/components/payment-autopay-actions.tsx");
  const printActions = source("src/components/billing-print-actions.tsx");

  assert.match(invoiceActions, /Process with saved method/);
  assert.match(invoiceActions, /Pay with Link/);
  assert.match(autopayActions, /Process eligible invoices/);
  assert.match(autopayActions, /Account credit is applied first/);
  assert.match(autopayActions, /result\.reason \?\? "—"/);
  assert.match(printActions, /<th>Payment reference<\/th>/);
  assert.match(printActions, /paymentTypeLabel\(payment\.provider\)/);
  assert.match(printActions, /displayLabel\(payment\.status\)/);
});

test("public payment form copy separates saved methods from autopay", () => {
  const form = source("src/components/payment-method-request-form.tsx");
  const page = source("src/app/payment-method-form/[token]/page.tsx");

  assert.match(form, /Connect bank account/);
  assert.match(form, /Pay with Link/);
  assert.match(form, /does not turn on autopay/);
  assert.match(page, /Set up your family/);
  assert.doesNotMatch(form, /Instant Bank Login|Verify Bank Instantly|secure processor handoff/);
});
