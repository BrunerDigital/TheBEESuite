import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("school payout UI focuses on payout readiness without exposing a software-fee requirement", () => {
  const panel = fs.readFileSync(path.join(root, "src/components/stripe-connect-panel.tsx"), "utf8");

  assert.match(panel, /Connect payout bank/);
  assert.match(panel, /current verified account remains active until a controlled cutover/);
  assert.doesNotMatch(panel, /\$99|software-payment-method|BEE Suite fee method/);
});

test("software-fee ACH cannot start before the payout destination is confirmed", () => {
  const route = fs.readFileSync(
    path.join(root, "src/app/api/billing/software-payment-method/route.ts"),
    "utf8",
  );

  assert.match(route, /paymentMethodCategory === "ach" && !clean\(fields\.stripePayoutBankLast4\)/);
  assert.match(route, /Software-fee authorization is separate from the payout destination/);
  assert.match(route, /\{ status: 409 \}/);
});

test("unsupported Stripe-balance software billing is rejected and hidden from school payout UI", () => {
  const route = fs.readFileSync(
    path.join(root, "src/app/api/billing/software-payment-method/route.ts"),
    "utf8",
  );
  const integrations = fs.readFileSync(path.join(root, "src/lib/integrations.ts"), "utf8");
  const panel = fs.readFileSync(path.join(root, "src/components/stripe-connect-panel.tsx"), "utf8");

  assert.match(route, /requested === "stripe_balance"/);
  assert.match(route, /Stripe balance is not a supported school software payment method/);
  assert.doesNotMatch(integrations, /customer_account: accountId/);
  assert.doesNotMatch(integrations, /"payment_settings\[payment_method_types\]\[0\]": "stripe_balance"/);
  assert.doesNotMatch(panel, /authorize The BEE Suite to debit this school's Stripe account balance|software-payment-method|\$99/);
  assert.doesNotMatch(route, /external_accounts|bank_accounts|payoutBankId/);
});

test("software subscriptions use an authorized external method and the September 1 anchor", () => {
  const integrations = fs.readFileSync(path.join(root, "src/lib/integrations.ts"), "utf8");
  const route = fs.readFileSync(path.join(root, "src/app/api/developer/software-subscriptions/route.ts"), "utf8");
  const policy = fs.readFileSync(path.join(root, "src/lib/kidcity-software-billing.ts"), "utf8");

  assert.match(policy, /2026-09-01T04:00:00\.000Z/);
  assert.match(route, /paymentMethodId,/);
  assert.match(route, /billingStartAt: getSchoolSoftwareBillingStartAt\(\)/);
  assert.match(route, /stripeSoftwareBillingSource: "external_payment_method"/);
  assert.match(integrations, /default_payment_method: paymentMethodId/);
  assert.match(integrations, /body\.set\("trial_end"/);
  assert.match(integrations, /"metadata\[billingBasis\]": "per_school"/);
});

test("new connected accounts follow Kokomo fee and loss responsibility without changing existing banks", () => {
  const integrations = fs.readFileSync(path.join(root, "src/lib/integrations.ts"), "utf8");
  const createAccount = integrations.slice(
    integrations.indexOf("export async function createStripeConnectedAccount"),
    integrations.indexOf("export async function completeStripeConnectedAccountBusinessProfile"),
  );

  assert.match(createAccount, /dashboard: "full"/);
  assert.match(createAccount, /fees_collector: "stripe"/);
  assert.match(createAccount, /losses_collector: "stripe"/);
  assert.match(createAccount, /customer:/);
  assert.doesNotMatch(createAccount, /external_accounts|bank_accounts/);
});
