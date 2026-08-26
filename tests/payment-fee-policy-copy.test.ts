import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("terms assign Stripe fees and the 1% application fee to schools only", () => {
  const terms = readFileSync("src/app/terms/page.tsx", "utf8");
  assert.match(terms, /1% from each tuition payment before payout/);
  assert.match(terms, /Stripe processing fees are also paid by the school/);
  assert.match(terms, /Neither fee increases the family/);
  assert.doesNotMatch(terms, /1\.50%/);
});

test("Accounts v2 thin destinations have a dedicated signing secret", () => {
  const readiness = readFileSync("src/lib/stripe-webhook-readiness.ts", "utf8");
  assert.match(readiness, /STRIPE_THIN_WEBHOOK_SECRET/);
  assert.match(readiness, /source: "STRIPE_THIN_WEBHOOK_SECRET"/);
});

test("school payment-method completion starts the anchored recurring subscription", () => {
  const webhook = readFileSync("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const handler = webhook.slice(webhook.indexOf("async function handleSchoolSoftwarePaymentMethodCompleted"));
  assert.match(handler, /createStripeSoftwareSubscription/);
  assert.match(handler, /billingStartAt: getSchoolSoftwareBillingStartAt\(\)/);
  assert.match(handler, /quantity: 1/);
  assert.match(handler, /stripeSoftwareBillingSource: "external_payment_method"/);
  assert.match(handler, /saveSoftwareSubscriptionSnapshot/);
});

test("school software webhooks stay tenant scoped and reject stale setup sessions before Stripe writes", () => {
  const webhook = readFileSync("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const handler = webhook.slice(
    webhook.indexOf("async function handleSchoolSoftwarePaymentMethodCompleted"),
    webhook.indexOf("async function handleFamilyBalanceCheckoutEvent"),
  );
  assert.match(handler, /center\.organization\.tenantId !== matchedTenantId/);
  assert.match(handler, /center\.organization\.tenantId !== metadataTenantId/);
  assert.match(handler, /clean\(fields\.stripeSoftwareSetupSessionId\) !== session\.id/);
  assert.match(handler, /superseded_school_software_setup_session/);
  assert.ok(handler.indexOf("superseded_school_software_setup_session") < handler.indexOf("setStripeCustomerDefaultPaymentMethod"));
  assert.match(handler, /customerId !== clean\(fields\.stripeSoftwareCustomerId\)/);
});

test("replacement school payment methods update the existing Stripe subscription", () => {
  const webhook = readFileSync("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const integrations = readFileSync("src/lib/integrations.ts", "utf8");
  assert.match(webhook, /updateStripeSoftwareSubscription\(\{/);
  assert.match(webhook, /defaultPaymentMethodId: paymentMethodId/);
  assert.match(integrations, /body\.set\("default_payment_method", defaultPaymentMethodId\)/);
  assert.match(integrations, /school-software-payment-method:\$\{subscriptionId\}:\$\{defaultPaymentMethodId\}/);
});
