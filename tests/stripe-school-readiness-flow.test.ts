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
  assert.match(route, /idempotencyKey: `bee-suite-school-connect-v2-\$\{center\.id\}`/);
  assert.match(route, /updateCenterCustomFieldsIfCurrent/);
  assert.match(route, /center\.customFields === null[\s\S]{0,100}Prisma\.DbNull/);
  assert.doesNotMatch(createAccount, /recipient:\s*\{/);
  assert.match(createAccount, /fees_collector: "stripe"/);
  assert.match(createAccount, /losses_collector: "stripe"/);
});

test("school payout provisioning records the actual Full Dashboard account model", () => {
  for (const scriptPath of [
    "scripts/prepare-kidcity-school-payouts.ts",
    "scripts/prepare-school-payout-onboarding.ts",
  ]) {
    const source = readFileSync(scriptPath, "utf8");
    assert.match(source, /created\.account\?\.dashboard \|\| "full"/);
    assert.doesNotMatch(source, /stripeConnectDashboard:\s*"express"/);
  }
});

test("Stripe profile completion stops before hosted onboarding owns protected fields", () => {
  const source = readFileSync("scripts/complete-kidcity-stripe-account-setup.ts", "utf8");
  assert.match(source, /onboardingAlreadyPrepared = Boolean\(existing\.stripeConnectLastOnboardingAt\)/);
  assert.match(source, /!alreadyReady && !onboardingAlreadyPrepared/);
  assert.match(source, /profileUpdated\s*\? \{ stripeConnectBusinessProfileCompletedAt/);
});

test("every payment entry point enforces the complete school readiness flow", () => {
  for (const routePath of [
    "src/app/api/billing/checkout-session/route.ts",
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/payment-method-session/route.ts",
    "src/app/api/billing/payment-method-request/checkout/route.ts",
    "src/app/api/billing/payment-method-request/session/route.ts",
    "src/app/api/billing/terminal-payment/route.ts",
    "src/lib/autopay-processing.ts",
  ]) {
    const source = readFileSync(routePath, "utf8");
    assert.match(source, /stripeSchoolReadinessFlowFromFields/, routePath);
    assert.match(source, /!paymentReadiness\.canAcceptParentPayments/, routePath);
  }
});

test("school readiness summary and audit use only verified live classifications", () => {
  const panel = readFileSync("src/components/stripe-connect-panel.tsx", "utf8");
  const audit = readFileSync("scripts/audit-kidcity-payout-bindings.ts", "utf8");
  assert.match(panel, /stripeSchoolReadinessFlowFromFields[\s\S]{0,120}\.stage === "ready"/);
  assert.match(audit, /row\.reachable && row\.exact && !row\.schoolPaysStripeFeesDirectly/);
  assert.match(audit, /unverifiable:/);
});
