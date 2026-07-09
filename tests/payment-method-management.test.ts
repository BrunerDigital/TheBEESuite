import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canChargeSavedPaymentMethod,
  canCreatePaymentMethodManagementSession,
  canRunAutopay,
  paymentMethodAutopayCategory,
  paymentMethodManagementSummary,
  paymentMethodSetupExpirationPatch,
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
      paymentMethodManagementStatus: "setup_session_created",
    },
  });

  assert.equal(summary.autopayEnabled, false);
  assert.equal(summary.autopayStatus, "pending");
  assert.equal(summary.hasStripeCustomer, true);
  assert.equal(summary.hasSavedPaymentMethod, false);
  assert.equal(paymentMethodAutopayCategory(summary), "default");
});

test("payment method summary does not keep expired setup sessions pending", () => {
  const summary = paymentMethodManagementSummary({
    autopayPlaceholder: false,
    customFields: {
      stripeCustomerId: "cus_123",
      stripeSetupCheckoutSessionId: "cs_expired",
      paymentMethodManagementStatus: "setup_session_expired",
      autopayStatus: "disabled",
    },
  });

  assert.equal(summary.autopayEnabled, false);
  assert.equal(summary.autopayStatus, "disabled");
  assert.equal(summary.hasStripeCustomer, true);
  assert.equal(summary.hasSavedPaymentMethod, false);
});

test("setup expiration preserves an already saved bank payment method", () => {
  const patch = paymentMethodSetupExpirationPatch({
    currentFields: {
      stripeCustomerId: "cus_123",
      stripeDefaultPaymentMethodId: "pm_bank_123",
      stripePaymentMethodType: "us_bank_account",
      stripePaymentMethodLast4: "6789",
      stripePaymentMethodBankName: "Test Bank",
      stripePaymentMethodSavedAt: "2026-07-08T15:00:00.000Z",
      paymentMethodManagementStatus: "payment_method_saved",
      autopayEnabled: true,
      autopayStatus: "enabled",
    },
    sessionId: "cs_expired",
    stripeEventId: "evt_expired",
  });

  assert.equal(patch.autopayPlaceholder, true);
  assert.equal(patch.customFields.stripeDefaultPaymentMethodId, "pm_bank_123");
  assert.equal(patch.customFields.stripeExpiredSetupCheckoutSessionId, "cs_expired");
  assert.equal(patch.customFields.paymentMethodManagementStatus, "payment_method_saved");
  assert.equal(patch.customFields.autopayEnabled, true);
  assert.equal(patch.customFields.autopayStatus, "enabled");
});

test("setup expiration disables incomplete setup sessions without a saved method", () => {
  const patch = paymentMethodSetupExpirationPatch({
    currentFields: {
      stripeCustomerId: "cus_123",
      stripeSetupCheckoutSessionId: "cs_pending",
      paymentMethodManagementStatus: "setup_session_created",
      autopayStatus: "pending",
    },
    sessionId: "cs_expired",
    stripeEventId: "evt_expired",
  });

  assert.equal(patch.autopayPlaceholder, false);
  assert.equal(patch.customFields.stripeSetupCheckoutSessionId, "cs_expired");
  assert.equal(patch.customFields.paymentMethodManagementStatus, "setup_session_expired");
  assert.equal(patch.customFields.autopayStatus, "disabled");
});

test("setup expiration does not re-enable a method a user disabled", () => {
  const patch = paymentMethodSetupExpirationPatch({
    currentFields: {
      stripeCustomerId: "cus_123",
      stripeDefaultPaymentMethodId: "pm_bank_123",
      stripePaymentMethodType: "us_bank_account",
      autopayEnabled: false,
      autopayStatus: "disabled",
      autopayDisabledAt: "2026-07-08T16:00:00.000Z",
      autopayDisabledByUserId: "user_123",
    },
    sessionId: "cs_expired",
    stripeEventId: "evt_expired",
  });

  assert.equal(patch.autopayPlaceholder, false);
  assert.equal(patch.customFields.paymentMethodManagementStatus, "setup_session_expired");
  assert.equal(patch.customFields.autopayStatus, "disabled");
});

test("saved payment method charge eligibility is separate from autopay enablement", () => {
  const pendingAutopayWithSavedMethod = paymentMethodManagementSummary({
    autopayPlaceholder: false,
    customFields: {
      stripeCustomerId: "cus_123",
      stripeDefaultPaymentMethodId: "pm_123",
      stripePaymentMethodType: "us_bank_account",
      stripePaymentMethodLast4: "6789",
      autopayStatus: "pending",
    },
  });

  assert.equal(pendingAutopayWithSavedMethod.autopayStatus, "pending");
  assert.equal(canChargeSavedPaymentMethod(pendingAutopayWithSavedMethod), true);
  assert.equal(canRunAutopay(pendingAutopayWithSavedMethod), false);
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
