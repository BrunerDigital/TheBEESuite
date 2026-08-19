import assert from "node:assert/strict";
import test from "node:test";
import {
  currentFamilyBillingMatch,
  invoiceAutopayBlockReason,
  invoicePaymentActionBlockReason,
  PAST_FAMILY_PAYMENT_BLOCK_REASON,
} from "../src/lib/invoice-payment-actions";

const currentFamilies = [{
  id: "current-family",
  name: "Kendall Family",
  centerId: "centennial",
  billingEmail: "parent@example.com",
}];

test("only a past-family account can link to one unambiguous current family", () => {
  assert.deepEqual(currentFamilyBillingMatch({
    sourceFamily: {
      id: "past-family",
      name: "Kendall Family",
      centerId: "centennial",
      billingEmail: "Parent@Example.com ",
      accountCategory: "past",
    },
    currentFamilies,
  }), { id: "current-family", name: "Kendall Family", centerId: "centennial" });

  assert.equal(currentFamilyBillingMatch({
    sourceFamily: { ...currentFamilies[0], accountCategory: "current" },
    currentFamilies: [{
      id: "another-current-family",
      name: "Another Family",
      centerId: "centennial",
      billingEmail: "parent@example.com",
    }],
  }), null);
});

test("an ambiguous billing email does not select a current family", () => {
  assert.equal(currentFamilyBillingMatch({
    sourceFamily: {
      id: "past-family",
      name: "Kendall Family",
      centerId: "centennial",
      billingEmail: "parent@example.com",
      accountCategory: "past",
    },
    currentFamilies: [...currentFamilies, { ...currentFamilies[0], id: "second-current-family" }],
  }), null);
});

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
