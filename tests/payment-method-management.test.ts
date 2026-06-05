import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canCreatePaymentMethodManagementSession,
  paymentMethodManagementSummary,
} from "../src/lib/payment-method-management";

test("payment method summary identifies saved Stripe customer and autopay status", () => {
  const summary = paymentMethodManagementSummary({
    autopayPlaceholder: true,
    customFields: {
      stripeCustomerId: "cus_123",
      stripeDefaultPaymentMethodId: "pm_123",
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
  assert.equal(summary.lastUpdatedAt, "2026-06-04T15:00:00.000Z");
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
