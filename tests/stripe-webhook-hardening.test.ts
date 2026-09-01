import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { stripeWebhookSecretFingerprint, verifyStripeSignature } from "../src/lib/integrations";
import { stripePaymentIntentFailureDisposition } from "../src/lib/billing-guardrails";
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
    storedCheckoutAmountCents: 27_000,
    succeededAmountTotalCents: 27_000,
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
    storedCheckoutAmountCents: 27_000,
    succeededAmountTotalCents: 27_000,
  }).ok, false);
  assert.equal(succeededFamilyBalancePaymentClaim({
    paymentStatus: "FAILED",
    storedStripePaymentIntentId: "pi_succeeded",
    succeededStripePaymentIntentId: "pi_succeeded",
    storedCheckoutAmountCents: 27_000,
    succeededAmountTotalCents: 13_500,
  }).ok, false);
  assert.equal(succeededFamilyBalancePaymentClaim({
    paymentStatus: "PAID",
    storedStripePaymentIntentId: "pi_succeeded",
    succeededStripePaymentIntentId: "pi_succeeded",
  }).reason, "payment_already_applied");
});

test("Checkout payment-method failures stay recoverable without weakening off-session failures", () => {
  assert.deepEqual(stripePaymentIntentFailureDisposition({
    collectionMode: "parent_checkout",
    customFields: {
      status: "checkout_created",
      stripeCheckoutSessionId: "cs_retryable",
    },
  }), {
    paymentStatus: "DRAFT",
    customStatus: "checkout_created",
    recoverableCheckout: true,
  });
  assert.deepEqual(stripePaymentIntentFailureDisposition({
    collectionMode: "autopay",
    customFields: {
      status: "autopay_processing",
      stripeCheckoutSessionId: "cs_not_recoverable",
    },
  }), {
    paymentStatus: "FAILED",
    customStatus: "autopay_failed",
    recoverableCheckout: false,
  });
  assert.deepEqual(stripePaymentIntentFailureDisposition({
    collectionMode: "director_saved_method",
    customFields: { status: "director_saved_method_processing" },
  }), {
    paymentStatus: "FAILED",
    customStatus: "director_saved_method_failed",
    recoverableCheckout: false,
  });
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
    "payment_intent.processing",
    "payment_intent.canceled",
    "payment_intent.payment_failed",
    "payment_intent.succeeded",
    "payout.created",
    "setup_intent.succeeded",
    "setup_intent.setup_failed",
    "v2.core.account.created",
    "v2.core.account.updated",
    "v2.core.account[configuration.merchant].updated",
    "v2.core.account[configuration.recipient].updated",
    "v2.core.account[defaults].updated",
    "v2.core.account[identity].updated",
    "v2.core.account[requirements].updated",
  ].sort());
});

test("unpaid Checkout snapshots cannot reopen settled or returned payments", async () => {
  const source = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const pendingTransitions = source.match(
    /updateMany\(\{\s*where: \{\s*id: paymentId,\s*status: PaymentStatus\.DRAFT,\s*customFields: \{\s*equals: currentPayment\.customFields === null \? Prisma\.DbNull : currentPayment\.customFields,[\s\S]*?data: \{\s*externalIdPlaceholder: session\.id/g,
  ) ?? [];
  assert.equal(pendingTransitions.length, 2);
});

test("stale Checkout completion cannot overwrite a newer recoverable failure", async () => {
  const source = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.equal(
    source.match(/if \(!stripeEventIsNewerThanStored\(event, currentFields\)\) return/g)?.length,
    3,
  );
  assert.match(source, /if \(!stripeEventIsNewerThanStored\(event, currentFields, true\)\) return/);
});

test("parent ledger query includes every provisional ACH processing state", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  for (const status of [
    "paid_processing",
    "autopay_processing",
    "stored_method_processing",
    "director_saved_method_processing",
  ]) {
    assert.match(source, new RegExp(`equals: "${status}"`));
  }
});

test("off-session request completion cannot overwrite webhook terminal states", async () => {
  const autopay = await readFile("src/lib/autopay-processing.ts", "utf8");
  const familyPayment = await readFile("src/app/api/billing/family-payment/route.ts", "utf8");
  assert.match(autopay, /payment\.updateMany\(\{\s*where: \{ id: payment\.id, status: PaymentStatus\.DRAFT \}/);
  assert.match(autopay, /submissionUpdate\.count !== 1[\s\S]*payment\.findUnique[\s\S]*terminalPaymentStatus/);
  assert.match(autopay, /terminalPaymentStatus === PaymentStatus\.PAID[\s\S]*appliedImmediately = true/);
  assert.match(autopay, /processingAccepted[\s\S]*blockedBillingAccountIds\.add/);
  assert.equal(
    familyPayment.match(/payment\.updateMany\(\{\s*where: \{ id: payment\.id, status: PaymentStatus\.DRAFT \}/g)?.length,
    2,
  );
  assert.match(familyPayment, /submissionUpdate\.count !== 1[\s\S]*payment\.findUnique[\s\S]*terminalPaymentStatus/);
  assert.match(familyPayment, /terminalFailure[\s\S]*status: "failed"/);
});

test("canceled processing PaymentIntents clear provisional payment state", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /event\.type === "payment_intent\.payment_failed" \|\| event\.type === "payment_intent\.canceled"/);
  assert.match(route, /const canceled = event\.type === "payment_intent\.canceled"/);
  assert.match(route, /failureCode: "payment_canceled"[\s\S]*customStatus: "payment_canceled"/);
  assert.match(route, /provisionalCreditActive: false/);
});

test("processing webhooks preserve collection-specific credit reservations", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /processingPaymentLifecycleStatus[\s\S]*"autopay_processing"[\s\S]*"stored_method_processing"/);
  assert.match(route, /collectionMode: clean\(metadata\.collectionMode\) \|\| clean\(currentFields\.collectionMode\)/);
  assert.match(route, /status: lifecycleStatus/);
});

test("processing webhooks are scoped to the payment's tenant, school account, and PaymentIntent", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /handlePaymentIntentProcessing\([\s\S]*matchedTenantId: string \| null/);
  assert.match(route, /clean\(input\.metadata\.tenantId\) !== tenantId/);
  assert.match(route, /input\.matchedTenantId && input\.matchedTenantId !== tenantId/);
  assert.match(route, /eventConnectedAccountId !== storedConnectedAccountId/);
  assert.match(route, /centerConnectedAccountId !== storedConnectedAccountId/);
  assert.match(route, /storedPaymentIntentId !== input\.paymentIntentId/);
  assert.match(route, /payment_intent_scope_mismatch/);
});

test("every PaymentIntent lifecycle event uses the same school ownership guard", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /async function findScopedPaymentIntentPayment/);
  assert.match(route, /handlePaymentIntentSucceeded\(event, event\.data\.object as StripePaymentIntentObject, matchedTenantId\)/);
  assert.match(route, /handlePaymentIntentFailed\(event, event\.data\.object as StripePaymentIntentObject, matchedTenantId\)/);
  assert.ok((route.match(/findScopedPaymentIntentPayment\(/g) || []).length >= 6);
});

test("stale or concurrent processing webhooks cannot overwrite a newer failure", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /if \(!stripeEventIsNewerThanStored\(event, currentFields\)\) return/);
  assert.match(route, /customFields: \{\s*equals: payment\.customFields === null \? Prisma\.DbNull : payment\.customFields/);
});

test("cancellation preserves an already-recorded ACH return", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /if \(canceled && isReturnedStripePayment\(currentPayment\)\) return/);
});

test("cancellation leaves abandoned Checkout drafts for expiration handling", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /if \(canceled && !offSessionCollection && !isAchPaymentProcessing\(currentPayment\)\) return/);
});

test("stale failures cannot overwrite any newer payment lifecycle state", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /if \(!stripeEventIsNewerThanStored\(event, currentFields\)\) return/);
  assert.match(route, /equals: currentPayment\.customFields === null \? Prisma\.DbNull : currentPayment\.customFields/);
});

test("same-second terminal events use lifecycle precedence instead of arbitrary ordering", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /allowSameSecond && incomingEventCreatedAt === storedEventCreatedAt/);
  assert.match(route, /if \(!canceled && clean\(currentFields\.status\) === "payment_canceled"\) return/);
  assert.match(route, /if \(!stripeEventIsNewerThanStored\(event, currentFields, true\)\) return/);
});

test("same-second failures verify the current PaymentIntent before replacing ACH processing", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(route, /retrieveStripePaymentIntent\(\{/);
  assert.match(route, /sameSecondLiveIntentStatus !== clean\(paymentIntent\.status\)/);
  assert.match(route, /Payment status verification is temporarily unavailable/);
});

test("later Checkout failures preserve insufficient-funds retry state", async () => {
  const route = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.equal(
    route.match(/failureCode: clean\(currentFields\.stripeFailureCode\) \|\| null/g)?.length,
    2,
  );
  assert.equal(
    route.match(/retryAvailable: failure\.retryAvailable \|\| currentFields\.retryAvailable === true/g)?.length,
    2,
  );
});

test("parent invoice status maps off-session and ACH processing payments", async () => {
  const source = await readFile("src/app/[slug]/page.tsx", "utf8");
  assert.match(
    source,
    /!isActiveStripeCheckoutPayment\(payment\)[\s\S]*!isActiveStripeAutopayPayment\(payment\)[\s\S]*!isAchPaymentProcessing\(payment\)/,
  );
});

test("ACH return audits require an actual submitted return transition", async () => {
  const source = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  assert.match(source, /achReturned\s*\? "billing\.ach_payment\.returned"/);
  assert.match(source, /achReturned\s*\? "billing\.family_payment\.ach_returned"/);
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
