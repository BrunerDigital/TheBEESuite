import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveStripeConnectStatus,
  stripeCheckoutReadiness,
  stripeConnectReadinessFromFields,
  stripeConnectReadinessFromSnapshot,
} from "../src/lib/stripe-connect-readiness";

test("Stripe Connect readiness requires an account, charges, and payouts", () => {
  assert.equal(deriveStripeConnectStatus({ accountId: null }), "not_started");
  assert.equal(deriveStripeConnectStatus({
    accountId: "acct_123",
    chargesEnabled: false,
    payoutsEnabled: true,
    detailsSubmitted: true,
    requirementFields: [],
  }), "charges_pending");
  assert.equal(deriveStripeConnectStatus({
    accountId: "acct_123",
    chargesEnabled: true,
    payoutsEnabled: false,
    detailsSubmitted: true,
    requirementFields: [],
  }), "payouts_pending");
  assert.equal(deriveStripeConnectStatus({
    accountId: "acct_123",
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementFields: ["company.tax_id"],
    detailsSubmitted: true,
  }), "requirements_due");
  assert.equal(deriveStripeConnectStatus({
    accountId: "acct_123",
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementFields: [],
    detailsSubmitted: false,
  }), "requirements_due");
  assert.equal(deriveStripeConnectStatus({
    accountId: "acct_123",
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementFields: [],
    detailsSubmitted: true,
  }), "ready");
});

test("Stripe Connect readiness exposes requirement blockers from cached fields", () => {
  const readiness = stripeConnectReadinessFromFields({
    stripeConnectAccountId: "acct_123",
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    stripePayoutRequirementFields: ["representative.verification.document"],
  });

  assert.equal(readiness.accountId, "acct_123");
  assert.equal(readiness.status, "requirements_due");
  assert.equal(readiness.canAcceptParentPayments, false);
  assert.match(readiness.blockingReason ?? "", /required payout account information/);
});

test("outstanding Stripe requirements block checkout even when charges and payouts are enabled", () => {
  const readiness = stripeConnectReadinessFromFields({
    stripeConnectAccountId: "acct_123",
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    stripePayoutRequirementFields: ["company.tax_id"],
  });

  assert.equal(readiness.status, "requirements_due");
  assert.equal(readiness.canAcceptParentPayments, false);
});

test("parent checkout readiness is blocked without webhook reconciliation", () => {
  const readiness = stripeCheckoutReadiness({
    stripeConfigured: true,
    webhookConfigured: false,
    customFields: {
      stripeConnectAccountId: "acct_123",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    },
  });

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.canAcceptParentPayments, false);
  assert.match(readiness.blockingReason ?? "", /webhook signing secret/);
});

test("parent checkout readiness can use explicit platform-only override before school account setup", () => {
  const readiness = stripeCheckoutReadiness({
    stripeConfigured: true,
    webhookConfigured: true,
    allowPlatformOnlyPayments: true,
    customFields: {},
  });

  assert.equal(readiness.status, "not_started");
  assert.equal(readiness.canAcceptParentPayments, true);
});

test("Stripe snapshot readiness maps active connected account to checkout ready", () => {
  const readiness = stripeConnectReadinessFromSnapshot({
    id: "acct_123",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    requirementFields: [],
  });

  assert.equal(readiness.label, "Ready");
  assert.equal(readiness.canAcceptParentPayments, true);
});
