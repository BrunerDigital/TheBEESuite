import assert from "node:assert/strict";
import test from "node:test";
import {
  invoiceAutopayBlockReason,
  invoicePaymentActionBlockReason,
  PAST_FAMILY_PAYMENT_BLOCK_REASON,
} from "../src/lib/invoice-payment-actions";

test("past-family historical invoices cannot be mistaken for current autopay state", () => {
  assert.equal(invoicePaymentActionBlockReason({
    invoiceStatus: "OPEN",
    invoiceTotalCents: 43_000,
  }), null);
  assert.equal(invoiceAutopayBlockReason({
    accountCategory: "past",
    invoiceStatus: "OPEN",
    invoiceTotalCents: 43_000,
    autopayStatus: "disabled",
    hasStripeCustomer: false,
    hasSavedPaymentMethod: false,
  }), PAST_FAMILY_PAYMENT_BLOCK_REASON);
});

test("current-family autopay remains available only with parent consent and a saved method", () => {
  assert.equal(invoiceAutopayBlockReason({
    accountCategory: "current",
    invoiceStatus: "OPEN",
    invoiceTotalCents: 43_000,
    autopayStatus: "enabled",
    hasStripeCustomer: true,
    hasSavedPaymentMethod: true,
  }), null);
  assert.match(invoiceAutopayBlockReason({
    accountCategory: "current",
    invoiceStatus: "OPEN",
    invoiceTotalCents: 43_000,
    autopayStatus: "disabled",
    hasStripeCustomer: true,
    hasSavedPaymentMethod: true,
  }) ?? "", /current family account/);
});
