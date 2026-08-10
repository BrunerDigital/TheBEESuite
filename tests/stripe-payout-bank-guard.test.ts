import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("school payout UI clearly separates payout banks from software-fee methods", () => {
  const panel = fs.readFileSync(path.join(root, "src/components/stripe-connect-panel.tsx"), "utf8");

  assert.match(panel, /BEE Suite fee method \(not payouts\)/);
  assert.match(panel, /Connect payout bank/);
  assert.match(panel, /Available after payout bank/);
  assert.match(panel, /!hasConfirmedPayoutBank/);
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

test("$99 Stripe-balance billing requires recorded school approval and never edits payout banks", () => {
  const route = fs.readFileSync(
    path.join(root, "src/app/api/billing/software-payment-method/route.ts"),
    "utf8",
  );
  const integrations = fs.readFileSync(path.join(root, "src/lib/integrations.ts"), "utf8");
  const panel = fs.readFileSync(path.join(root, "src/components/stripe-connect-panel.tsx"), "utf8");

  assert.match(route, /requested === "stripe_balance"/);
  assert.match(route, /body\.approved !== true/);
  assert.match(route, /stripeSoftwareBalanceApprovalAt/);
  assert.match(route, /stripeSoftwareBalanceApprovedByUserId/);
  assert.match(route, /stripeSoftwareMonthlyAmountCents: monthlyAmountCents/);
  assert.match(integrations, /customer_account: accountId/);
  assert.match(integrations, /"payment_settings\[payment_method_types\]\[0\]": "stripe_balance"/);
  assert.match(panel, /authorize The BEE Suite to debit this school's Stripe account balance/);
  assert.doesNotMatch(route, /external_accounts|bank_accounts|payoutBankId/);
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
