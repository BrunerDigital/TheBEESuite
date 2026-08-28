import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("director bulk autopay requires an exact reviewed balance snapshot", () => {
  const route = readFileSync("src/app/api/billing/autopay/route.ts", "utf8");
  const actions = readFileSync("src/components/payment-autopay-actions.tsx", "utf8");
  const livePages = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const processing = readFileSync("src/lib/autopay-processing.ts", "utf8");

  assert.match(route, /Review eligible family balances before processing autopay/);
  assert.match(route, /JSON\.stringify\(actual\) !== JSON\.stringify\(expected\)/);
  assert.match(route, /invoiceIds: expected\.map/);
  assert.match(route, /expectedAmountCentsByInvoiceId/);
  assert.doesNotMatch(route, /for \(const item of expected\)/);
  assert.match(actions, /reviewedInvoices/);
  assert.match(actions, /Process all reviewed balances/);
  assert.match(actions, /Process family autopay/);
  assert.match(actions, /Payment configuration is checked automatically/);
  assert.match(livePages, /data\.canProcessAutopay \? <PaymentAutopayActions \/>/);
  assert.match(page, /canProcessAutopay: canManageBilling\(user\)/);
  assert.match(actions, /disabled=\{isPending \|\| !readyToProcess\}/);
  assert.match(processing, /take: limit \+ 1/);
  assert.match(processing, /input\.invoiceIds\?\.length/);
  assert.match(processing, /expectedAmountCents !== creditAllocation\.stripeChargePrincipalCents/);
  assert.match(processing, /cursor: \{ id: input\.cursorInvoiceId \}/);
  assert.match(actions, /Review next batch/);
  assert.match(actions, /summary\?\.dryRun && summary\.wouldCharge/);
  assert.match(actions, /Process this batch first/);
  assert.match(processing, /hasMore/);
  assert.match(page, /activeConnectedAccountId: readStripeConnectedAccountId\(center\?\.customFields\)/);
  assert.match(processing, /if \(paymentMethod\.paymentMethodReauthorizationRequired\)/);
  assert.match(processing, /prior payout account/);
});
