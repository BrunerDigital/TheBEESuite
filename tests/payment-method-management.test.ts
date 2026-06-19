import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canCreatePaymentMethodManagementSession,
  paymentMethodAutopayCategory,
  paymentMethodManagementSummary,
} from "../src/lib/payment-method-management";

test("payment method summary identifies saved Stripe customer and autopay status", () => {
  const summary = paymentMethodManagementSummary({
    autopayPlaceholder: true,
    customFields: {
      stripeCustomerId: "cus_123",
      stripeDefaultPaymentMethodId: "pm_123",
      stripePaymentMethodType: "us_bank_account",
      stripePaymentMethodBankName: "Test Bank",
      stripePaymentMethodLast4: "6789",
      stripePaymentMethodSavedAt: "2026-06-04T15:00:00.000Z",
      autopayEnabled: true,
    },
  });

  assert.equal(summary.autopayEnabled, true);
  assert.equal(summary.autopayStatus, "enabled");
  assert.equal(summary.hasStripeCustomer, true);
  assert.equal(summary.hasSavedPaymentMethod, true);
  assert.equal(summary.stripeCustomerId, "cus_123");
  assert.equal(summary.stripeDefaultPaymentMethodId, "pm_123");
  assert.equal(summary.paymentMethodType, "us_bank_account");
  assert.equal(summary.paymentMethodLabel, "Test Bank ending 6789");
  assert.equal(summary.lastUpdatedAt, "2026-06-04T15:00:00.000Z");
  assert.equal(paymentMethodAutopayCategory(summary), "ach");
});

test("payment method summary labels saved cards without storing full numbers", () => {
  const summary = paymentMethodManagementSummary({
    customFields: {
      stripeCustomerId: "cus_123",
      stripeDefaultPaymentMethodId: "pm_123",
      stripePaymentMethodType: "card",
      stripePaymentMethodBrand: "visa",
      stripePaymentMethodLast4: "4242",
      autopayEnabled: true,
    },
  });

  assert.equal(summary.paymentMethodType, "card");
  assert.equal(summary.paymentMethodLabel, "Visa ending 4242");
  assert.equal(paymentMethodAutopayCategory(summary), "card");
});

test("payment method summary treats setup sessions as pending", () => {
  const summary = paymentMethodManagementSummary({
    autopayPlaceholder: false,
    customFields: {
      stripeCustomerId: "cus_123",
      stripeSetupCheckoutSessionId: "cs_123",
      autopayStatus: "pending",
    },
  });

  assert.equal(summary.autopayEnabled, false);
  assert.equal(summary.autopayStatus, "pending");
  assert.equal(summary.hasStripeCustomer, true);
  assert.equal(summary.hasSavedPaymentMethod, false);
  assert.equal(paymentMethodAutopayCategory(summary), "default");
});

test("payment method management requires linked guardian or center billing access", () => {
  assert.deepEqual(canCreatePaymentMethodManagementSession({
    isLinkedGuardian: true,
    hasCenterAccess: false,
  }), { ok: true });
  assert.deepEqual(canCreatePaymentMethodManagementSession({
    isLinkedGuardian: false,
    hasCenterAccess: true,
  }), { ok: true });
  assert.deepEqual(canCreatePaymentMethodManagementSession({
    isLinkedGuardian: false,
    hasCenterAccess: false,
  }), {
    ok: false,
    status: 403,
    error: "You do not have access to this billing account.",
  });
});
