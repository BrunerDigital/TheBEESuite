import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { stripeWebhookSecretFingerprint, verifyStripeSignature } from "../src/lib/integrations";
import { succeededFamilyBalancePaymentClaim } from "../src/lib/stripe-payment-application";
import { STRIPE_WEBHOOK_SUPPORTED_EVENT_TYPES, stripeWebhookObjectForRouting } from "../src/lib/stripe-webhook-event-types";
import {
  isStripeWebhookReceiptUniqueConflict,
  reserveStripeWebhookDelivery,
  stripeWebhookDedupeKey,
} from "../src/lib/stripe-webhook-receipts";

function stripeSignature(payload: string, secret: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

test("Stripe-compatible signatures authenticate the exact raw payload", () => {
  const payload = JSON.stringify({ id: "evt_fixture", type: "checkout.session.completed", data: { object: { id: "cs_fixture" } } });
  const secret = "whsec_test_fixture_not_a_production_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = stripeSignature(payload, secret, timestamp);

  assert.equal(verifyStripeSignature({ payload, secret, signature: `t=${timestamp},v1=${v1}` }), true);
  assert.equal(verifyStripeSignature({ payload, secret, signature: `t=${timestamp},v1=${"0".repeat(64)},v1=${v1}` }), true);
  assert.equal(verifyStripeSignature({ payload: `${payload}\n`, secret, signature: `t=${timestamp},v1=${v1}` }), false);
  assert.equal(verifyStripeSignature({ payload, secret, signature: `t=${timestamp},v1=not-hex` }), false);
  assert.equal(verifyStripeSignature({ payload, secret, signature: `v1=${v1}` }), false);
  assert.equal(verifyStripeSignature({ payload, secret, signature: `t=not-a-time,v1=${v1}` }), false);
  assert.equal(verifyStripeSignature({ payload, secret, signature: null }), false);
  assert.equal(verifyStripeSignature({ payload, secret, signature: `t=${timestamp - 301},v1=${stripeSignature(payload, secret, timestamp - 301)}` }), false);
});

test("webhook secret readiness uses a one-way masked fingerprint", () => {
  const secret = "whsec_test_fixture_not_a_production_secret";
  const fingerprint = stripeWebhookSecretFingerprint(secret);
  assert.equal(fingerprint?.length, 12);
  assert.match(fingerprint || "", /^[0-9a-f]{12}$/);
  assert.equal(fingerprint?.includes(secret), false);
  assert.equal(stripeWebhookSecretFingerprint(""), null);
});

test("event identity, not object identity, is the dedupe key", () => {
  assert.equal(stripeWebhookDedupeKey("evt_checkout_completed"), "evt_checkout_completed");
  assert.notEqual(stripeWebhookDedupeKey("evt_checkout_completed"), stripeWebhookDedupeKey("evt_checkout_expired"));
});

test("a succeeded family payment recovers only the same previously failed PaymentIntent", () => {
  assert.deepEqual(succeededFamilyBalancePaymentClaim({
    paymentStatus: "DRAFT",
    succeededStripePaymentIntentId: "pi_succeeded",
  }), {
    ok: true,
    reason: null,
    claimStatus: "DRAFT",
    recoveredFromFailedAttempt: false,
  });
  assert.deepEqual(succeededFamilyBalancePaymentClaim({
    paymentStatus: "FAILED",
    storedStripePaymentIntentId: "pi_succeeded",
    succeededStripePaymentIntentId: "pi_succeeded",
  }), {
    ok: true,
    reason: null,
    claimStatus: "FAILED",
    recoveredFromFailedAttempt: true,
  });
  assert.equal(succeededFamilyBalancePaymentClaim({
    paymentStatus: "FAILED",
    storedStripePaymentIntentId: "pi_different",
    succeededStripePaymentIntentId: "pi_succeeded",
  }).ok, false);
  assert.equal(succeededFamilyBalancePaymentClaim({
    paymentStatus: "PAID",
    storedStripePaymentIntentId: "pi_succeeded",
    succeededStripePaymentIntentId: "pi_succeeded",
  }).reason, "payment_already_applied");
});

test("concurrent deliveries reserve exactly one durable receipt", async () => {
  let stored = false;
  let inserts = 0;
  const reserve = () => reserveStripeWebhookDelivery({
    insert: async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (stored) throw { code: "P2002", meta: { target: ["eventId"] } };
      stored = true;
      inserts += 1;
    },
    eventExists: async () => stored,
  });

  const results = await Promise.all(Array.from({ length: 12 }, reserve));
  assert.equal(inserts, 1);
  assert.equal(results.filter((result) => result === "received").length, 1);
  assert.equal(results.filter((result) => result === "duplicate").length, 11);
});

test("unrelated unique conflicts are never mislabeled as webhook duplicates", async () => {
  assert.equal(isStripeWebhookReceiptUniqueConflict({ code: "P2002", meta: { target: ["eventId"] } }), true);
  assert.equal(isStripeWebhookReceiptUniqueConflict({ code: "P2002", meta: { target: ["externalId"] } }), false);
  await assert.rejects(() => reserveStripeWebhookDelivery({
    insert: async () => { throw { code: "P2002", meta: { target: ["externalId"] } }; },
    eventExists: async () => true,
  }));
});

test("supported reconciliation matrix includes payment, invoice, subscription, dispute, and Accounts v2 events", () => {
  assert.deepEqual([...STRIPE_WEBHOOK_SUPPORTED_EVENT_TYPES].sort(), [
    "account.updated",
    "charge.dispute.closed",
    "charge.dispute.created",
    "charge.dispute.funds_reinstated",
    "charge.dispute.funds_withdrawn",
    "charge.dispute.updated",
    "charge.refunded",
    "checkout.session.async_payment_failed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.completed",
    "checkout.session.expired",
    "customer.subscription.created",
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.paid",
    "invoice.payment_action_required",
    "invoice.payment_failed",
    "payment_intent.payment_failed",
    "payment_intent.succeeded",
    "payout.created",
    "v2.core.account.updated",
    "v2.core.account[requirements].updated",
  ].sort());
});

test("Accounts v2 thin events route by related_object without requiring snapshot data", () => {
  assert.deepEqual(stripeWebhookObjectForRouting({
    id: "evt_test_thin",
    type: "v2.core.account.updated",
    related_object: { id: "acct_test_thin", type: "v2.core.account" },
  }), { id: "acct_test_thin", object: "v2.core.account" });
  assert.deepEqual(stripeWebhookObjectForRouting({ id: "evt_unknown", type: "unsupported.event" }), {});
});

test("route reads raw text before verification/parsing and reserves before dispatch", async () => {
  const source = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const postHandler = source.slice(source.indexOf("async function POSTHandler"));
  const rawBody = postHandler.indexOf("await request.text()");
  const signatureCheck = postHandler.indexOf("await matchStripeWebhookSecret");
  const parse = postHandler.indexOf("JSON.parse(payload)");
  const reserve = postHandler.indexOf("await reserveStripeWebhookEvent(event)");
  const dispatch = postHandler.indexOf("await dispatchAuthenticatedEvent(event");

  assert.ok(rawBody >= 0 && rawBody < signatureCheck);
  assert.ok(signatureCheck < parse);
  assert.ok(parse < reserve);
  assert.ok(reserve < dispatch);
  assert.doesNotMatch(postHandler, /request\.json\s*\(/);
  assert.match(postHandler, /omitRequestBody:\s*true/);
});

test("payment races re-read a winning success and suppress stale failure audits", async () => {
  const application = await readFile("src/lib/stripe-payment-application.ts", "utf8");
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");

  assert.match(application, /claimedPayment\.count !== 1[\s\S]*latestPayment[\s\S]*payment_already_applied/);
  assert.match(application, /latestFields\.stripePaymentIntentId[\s\S]*input\.stripePaymentIntentId/);
  assert.match(application, /claim\.claimStatus === PaymentStatus\.DRAFT[\s\S]*latestPayment\?\.status === PaymentStatus\.FAILED[\s\S]*applySucceededStripeFamilyBalancePayment\(tx, input\)/);
  assert.match(route, /failureApplied = failedPayment\.count === 1/);
  assert.match(route, /if \(!failureApplied\)[\s\S]*payment_intent_failure_ignored/);
  assert.match(route, /candidateInvoiceId[\s\S]*billingAccountId: currentPayment\.billingAccountId/);
  assert.match(route, /if \(paymentFound && verifiedInvoiceId\)[\s\S]*else if \(paymentFound && storedBillingAccountId\)/);
  assert.match(route, /reason: paymentFound \? "payment_not_chargeable" : "payment_not_found"/);
  assert.match(route, /claimedPayment\.count !== 1[\s\S]*applySucceededStripeFamilyBalancePayment\(tx/);
});

test("disputes add the chargeback to the parent ledger and reverse it only when funds return", async () => {
  const source = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const lifecycle = source.slice(source.indexOf("async function handleDisputeLifecycle"), source.indexOf("async function writeSystemAudit"));

  assert.match(lifecycle, /type: "chargeback"/);
  assert.match(lifecycle, /balanceCents: \{ increment: disputeAmountCents \}/);
  assert.match(lifecycle, /type: "chargeback_reversal"/);
  assert.match(lifecycle, /balanceCents: \{ decrement: disputeAmountCents \}/);
  assert.match(lifecycle, /stripeDisputeLedgerActive/);
  assert.match(lifecycle, /stripe-dispute:\$\{dispute\.id\}:assessment/);
  assert.match(lifecycle, /stripe-dispute:\$\{dispute\.id\}:reversal/);
});
