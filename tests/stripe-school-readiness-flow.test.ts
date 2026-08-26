import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { stripeBillingApprovalCustomFieldPatch } from "../src/lib/stripe-billing-approval";
import { stripeSchoolReadinessFlowFromFields } from "../src/lib/stripe-school-readiness-flow";

const approvedAt = "2026-08-26T12:00:00.000Z";
const approval = stripeBillingApprovalCustomFieldPatch({
  approved: true,
  approvedAt,
  approvedBy: "Billing Admin",
  billingPreviewApprovedAt: approvedAt,
  accountingApprovedAt: approvedAt,
  cutoverApprovedAt: approvedAt,
});

test("school Stripe readiness keeps account, bank, and billing activation as separate gates", () => {
  const stripeReady = {
    stripeConnectAccountId: "acct_school",
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    stripePayoutRequirementFields: [],
    stripeMerchantCapabilityStatus: "active",
    stripeMerchantPayoutCapabilityStatus: "active",
  };

  assert.equal(stripeSchoolReadinessFlowFromFields({ customFields: {} }).stage, "not_started");
  assert.equal(stripeSchoolReadinessFlowFromFields({ customFields: stripeReady }).stage, "payout_bank_required");
  assert.equal(stripeSchoolReadinessFlowFromFields({
    customFields: {
      ...stripeReady,
      stripePayoutBankLast4: "1234",
      stripePayoutBankDefaultConfirmed: true,
    },
  }).stage, "activation_required");

  const live = stripeSchoolReadinessFlowFromFields({
    customFields: {
      ...stripeReady,
      stripePayoutBankLast4: "1234",
      stripePayoutBankDefaultConfirmed: true,
      ...approval,
      livePaymentsEnabled: true,
      tuitionBillingEnabled: true,
    },
  });
  assert.equal(live.stage, "ready");
  assert.equal(live.canAcceptParentPayments, true);
  assert.equal(live.label, "Payments live");
});

test("Stripe review is distinct from information the school still owes", () => {
  const underReview = stripeSchoolReadinessFlowFromFields({
    customFields: {
      stripeConnectAccountId: "acct_school",
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: true,
      stripePayoutRequirementFields: [],
      stripePendingVerificationFields: ["identity.business_details.address"],
      stripeMerchantCapabilityStatus: "pending",
      stripeMerchantPayoutCapabilityStatus: "pending",
    },
  });
  assert.equal(underReview.stage, "verification_pending");
  assert.match(underReview.explanation, /Stripe is reviewing/);

  const actionNeeded = stripeSchoolReadinessFlowFromFields({
    customFields: {
      stripeConnectAccountId: "acct_school",
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripePayoutRequirementFields: ["identity.business_details.tax_id"],
    },
  });
  assert.equal(actionNeeded.stage, "requirements_due");
});

test("live activation re-verifies Stripe, fee responsibility, payout bank, and webhook without charging", () => {
  const route = readFileSync("src/app/api/billing/connect/activate/route.ts", "utf8");
  assert.match(route, /activationAcknowledged !== true/);
  assert.match(route, /retrieveStripeConnectedAccount/);
  assert.match(route, /verifyStripeConnectAccountBinding/);
  assert.match(route, /stripeConnectedAccountPaysFeesDirectly/);
  assert.match(route, /getStripeWebhookSecret/);
  assert.match(route, /payoutBanks\.defaultBank\?\.last4/);
  assert.match(route, /customFields: \{ equals: existingFields/);
  assert.match(route, /chargesCreated: 0/);
  assert.match(route, /invoicesCreated: 0/);
});

test("status response returns a minimized account view rather than raw Stripe identity data", () => {
  const route = readFileSync("src/app/api/billing/connect/status/route.ts", "utf8");
  const responseSection = route.slice(route.lastIndexOf("return NextResponse.json"));
  assert.doesNotMatch(responseSection, /account: retrieved\.account[,\n]/);
  assert.doesNotMatch(responseSection, /raw:/);
  assert.match(responseSection, /merchantPayoutCapabilityStatus/);
  assert.match(responseSection, /Cache-Control.*no-store/);
});

test("new school account creation is idempotent and omits indirect-transfer onboarding", () => {
  const route = readFileSync("src/app/api/billing/connect/onboard/route.ts", "utf8");
  const integrations = readFileSync("src/lib/integrations.ts", "utf8");
  const createAccount = integrations.slice(
    integrations.indexOf("export async function createStripeConnectedAccount"),
    integrations.indexOf("export async function completeStripeConnectedAccountBusinessProfile"),
  );
  assert.match(route, /idempotencyKey: `bee-suite-school-connect-\$\{center\.id\}`/);
  assert.match(route, /updateCenterCustomFieldsIfCurrent/);
  assert.doesNotMatch(createAccount, /recipient:\s*\{/);
  assert.match(createAccount, /fees_collector: "stripe"/);
  assert.match(createAccount, /losses_collector: "stripe"/);
});
