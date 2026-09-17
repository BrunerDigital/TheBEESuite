import assert from "node:assert/strict";
import { test } from "node:test";
import { stripeBillingApprovalCustomFieldPatch } from "../src/lib/stripe-billing-approval";
import { stripePaymentReadiness } from "../src/lib/stripe-payment-readiness";

const approval = stripeBillingApprovalCustomFieldPatch({
  approved: true,
  approvedAt: "2026-08-26T12:00:00.000Z",
  approvedBy: "Billing Admin",
  billingPreviewApprovedAt: "2026-08-26T12:00:00.000Z",
  accountingApprovedAt: "2026-08-26T12:00:00.000Z",
  cutoverApprovedAt: "2026-08-26T12:00:00.000Z",
});

const connectedAndActivated = {
  stripeConnectAccountId: "acct_school",
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripePayoutRequirementFields: [],
  stripeMerchantCapabilityStatus: "active",
  stripeMerchantPayoutCapabilityStatus: "active",
  stripePayoutBankLast4: "1234",
  stripePayoutBankDefaultConfirmed: true,
  ...approval,
  livePaymentsEnabled: true,
  tuitionBillingEnabled: true,
};

test("payment readiness does not claim a school is live before activation", () => {
  const readiness = stripePaymentReadiness({
    customFields: { ...connectedAndActivated, livePaymentsEnabled: false },
    centerName: "Test School",
    stripeConfigured: true,
    webhookConfigured: true,
  });

  assert.equal(readiness.canAcceptParentPayments, false);
  assert.equal(readiness.label, "Activation needed");
  assert.match(readiness.blockingReason ?? "", /authorized billing administrator/i);
});

test("payment readiness matches the payment API once all gates are active", () => {
  const readiness = stripePaymentReadiness({
    customFields: connectedAndActivated,
    centerName: "Test School",
    stripeConfigured: true,
    webhookConfigured: true,
  });

  assert.equal(readiness.canAcceptParentPayments, true);
  assert.equal(readiness.label, "Payments live");
  assert.equal(readiness.blockingReason, null);
});
