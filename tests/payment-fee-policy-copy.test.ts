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
