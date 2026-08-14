import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  beeSuitePayoutDetailsUrl,
  beeSuitePayoutSmsBody,
  formatPayoutAmount,
  payoutSmsRecipient,
  sendPayoutSmsSafely,
} from "../src/lib/payout-sms";

test("payout SMS uses BEE Suite branding and a canonical BEE Suite link", () => {
  const body = beeSuitePayoutSmsBody({
    amountCents: 251505,
    currency: "usd",
    centerId: "center_123",
  });

  assert.equal(
    body,
    "Hello! Your $2,515.05 payout from The BEE Suite is on its way. View payout details: https://thebeesuite.io/payouts?center=center_123",
  );
  assert.doesNotMatch(body || "", /stripe/i);
  assert.doesNotMatch(body || "", /connect\.stripe\.com/i);
  assert.equal(beeSuitePayoutDetailsUrl("center 123"), "https://thebeesuite.io/payouts?center=center+123");
});

test("payout SMS formatting fails closed for malformed payout data", () => {
  assert.equal(formatPayoutAmount(13924, "usd"), "$139.24");
  assert.equal(formatPayoutAmount(-1, "usd"), null);
  assert.equal(formatPayoutAmount(100, "jpy"), null);
  assert.equal(formatPayoutAmount(100, "not-currency"), null);
  assert.equal(beeSuitePayoutSmsBody({ amountCents: 100, currency: "usd", centerId: "" }), null);
});

test("payout SMS goes only to the explicitly saved payout contact", () => {
  assert.equal(payoutSmsRecipient({
    stripeConnectSetup: { payoutContactPhone: " +17655551234 " },
  }), "+17655551234");
  assert.equal(payoutSmsRecipient({ phone: "+17655550000" }), null);
  assert.equal(payoutSmsRecipient(null), null);
});

test("payout SMS network exceptions become retryable failed results", async () => {
  const result = await sendPayoutSmsSafely(async () => {
    throw new Error("network timeout");
  });

  assert.deepEqual(result, {
    ok: false,
    configured: true,
    provider: "twilio",
    error: "Twilio request failed before receiving a response.",
  });
});

test("BEE Suite payout link authenticates, authorizes the school, and creates the Stripe link only after access checks", async () => {
  const route = await readFile("src/app/payouts/route.ts", "utf8");
  const handler = route.slice(route.indexOf("async function GETHandler"));
  const auth = handler.indexOf("await getCurrentUser()");
  const access = handler.indexOf("canAccessCenter(user, centerId)");
  const account = handler.indexOf("readStripeConnectedAccountId(center.customFields)");
  const link = handler.indexOf("createStripeExpressDashboardLoginLink");

  assert.ok(auth >= 0 && auth < access);
  assert.ok(access < account && account < link);
  assert.match(route, /requiresPasswordResetGate\(user\)/);
  assert.match(route, /canManageBilling\(user\)[\s\S]*canManageOperations\(user\)/);
  assert.match(route, /Cache-Control[\s\S]*no-store/);
});

test("payout webhook sends only live, exactly mapped events and records delivery", async () => {
  const webhook = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const handler = webhook.slice(webhook.indexOf("async function handlePayoutCreated"), webhook.indexOf("async function handleCheckoutExpired"));

  assert.match(handler, /event\.livemode !== true/);
  assert.match(handler, /matchedCenters\.length !== 1/);
  assert.match(handler, /matchedTenantId !== tenantId/);
  assert.match(handler, /payoutSmsRecipient\(center\.customFields\)/);
  assert.match(handler, /purpose: "payout_notification_sms"/);
  assert.match(handler, /sendPayoutSmsSafely\(\(\) => sendSms/);
  assert.match(handler, /stripe-payout-created:\$\{event\.id\}:\$\{center\.id\}/);
});
