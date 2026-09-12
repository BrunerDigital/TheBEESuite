import assert from "node:assert/strict";
import test from "node:test";
import { createStripeCheckoutSession, createStripeCustomer, expireStripeCheckoutSession } from "@/lib/integrations";
import { reconcileIdempotentStripeSubmission } from "@/lib/stripe-payment-claims";

const credentials = { STRIPE_SECRET_KEY: "sk_test_fake_checkout_unit_test" };
const request = { amountCents: 10000, applicationFeeAmountCents: 100, invoiceNumber: "FAKE-1", successUrl: "https://thebeesuite.io/parents?success=1",
  cancelUrl: "https://thebeesuite.io/parents?cancel=1", metadata: { invoiceId: "fake-invoice" },
  connectedAccountId: "acct_fake", customerId: "cus_fake", idempotencyKey: "fake-invoice-claim", credentials,
  paymentMethodCategory: "card" as const, paymentMethodConfigurationId: "pmc_fake" };

for (const status of [409, 500]) test(`provider ${status} does not change payment mode/key and recovers only the same request`, async () => {
  const original = globalThis.fetch, calls: Array<{ body: string; key: string; account: string }> = [];
  globalThis.fetch = (async (_url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ body: String(init?.body), key: headers.get("Idempotency-Key")!, account: headers.get("Stripe-Account")! });
    return new Response(JSON.stringify(calls.length === 1
      ? { error: { param: "payment_method_configuration", message: "No such payment_method_configuration" } }
      : { id: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake" }), { status: calls.length === 1 ? status : 200 });
  }) as typeof fetch;
  try {
    const result = await reconcileIdempotentStripeSubmission(() => createStripeCheckoutSession(request));
    assert.equal(result.resolved, true); assert.equal(result.value?.ok, true); assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].account, "acct_fake"); assert.match(calls[0].key, /:configuration$/);
  } finally { globalThis.fetch = original; }
});

test("only definitive validation rejection permits the existing payment-method fallback", async () => {
  const original = globalThis.fetch, keys: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    return new Response(JSON.stringify(keys.length === 1 ? { error: { param: "payment_method_configuration" } }
      : { id: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake" }), { status: keys.length === 1 ? 400 : 200 });
  }) as typeof fetch;
  try { assert.equal((await createStripeCheckoutSession(request)).ok, true); assert.equal(keys.length, 2); assert.notEqual(keys[0], keys[1]); }
  finally { globalThis.fetch = original; }
});

for (const payload of [{}, { id: "cs_fake" }, { url: "https://checkout.stripe.com/c/pay_fake" }, { id: "cs_fake", url: "http://unsafe.example.test" }]) {
  test(`malformed successful Checkout response remains indeterminate (${Object.keys(payload).join(",") || "empty"})`, async () => {
    const original = globalThis.fetch; let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify(payload), { status: 200 }); }) as typeof fetch;
    try {
      const result = await reconcileIdempotentStripeSubmission(() => createStripeCheckoutSession(request));
      assert.equal(result.resolved, false); assert.equal(calls, 2);
    } finally { globalThis.fetch = original; }
  });
}

test("customer creation preserves provider ambiguity and same idempotency key", async () => {
  const original = globalThis.fetch, keys: string[] = [];
  globalThis.fetch = (async (_url, init) => { keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    return new Response(JSON.stringify(keys.length === 1 ? {} : { id: "cus_fake" }), { status: 200 }); }) as typeof fetch;
  try {
    const result = await reconcileIdempotentStripeSubmission(() => createStripeCustomer({ email: "fake@example.test", credentials,
      connectedAccountId: "acct_fake", idempotencyKey: "fake-customer-claim" }));
    assert.equal(result.resolved, true); assert.equal(result.value?.id, "cus_fake"); assert.deepEqual(keys, ["fake-customer-claim", "fake-customer-claim"]);
  } finally { globalThis.fetch = original; }
});

test("expiry requests expanded intent proof on its original connected account", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    assert.match(String(url), /\/cs_fake\/expire$/); assert.equal(new Headers(init?.headers).get("Stripe-Account"), "acct_fake");
    assert.equal(new URLSearchParams(String(init?.body)).get("expand[]"), "payment_intent");
    return new Response(JSON.stringify({ id: "cs_fake", status: "expired", payment_status: "unpaid",
      payment_intent: { id: "pi_fake", status: "requires_payment_method" } }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await expireStripeCheckoutSession({ sessionId: "cs_fake", connectedAccountId: "acct_fake", credentials });
    assert.equal(result.session?.paymentIntentId, "pi_fake"); assert.equal(result.session?.paymentIntentStatus, "requires_payment_method");
  } finally { globalThis.fetch = original; }
});

for (const error of [
  { type: "idempotency_error", message: "Parameters differ" },
  { code: "idempotency_key_in_use", param: "payment_method_configuration" },
  { message: "Keys for idempotent requests can only be used with the same parameters" },
]) test(`HTTP 400 idempotency conflict preserves the original key (${Object.keys(error)[0]})`, async () => {
  const original = globalThis.fetch, calls: Array<{ key: string | null; body: string }> = [];
  globalThis.fetch = (async (_url, init) => {
    calls.push({ key: new Headers(init?.headers).get("Idempotency-Key"), body: String(init?.body) });
    return new Response(JSON.stringify({ error }), { status: 400 });
  }) as typeof fetch;
  try {
    const result = await reconcileIdempotentStripeSubmission(() => createStripeCheckoutSession(request));
    assert.equal(result.resolved, false); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  } finally { globalThis.fetch = original; }
});

test("invoice single-mode submission never falls through to a different provider key", async () => {
  const original = globalThis.fetch, keys: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    return new Response(JSON.stringify({ error: { param: "payment_method_configuration" } }), { status: 400 });
  }) as typeof fetch;
  try {
    assert.equal((await createStripeCheckoutSession({ ...request, allowPaymentMethodFallback: false })).ok, false);
    assert.deepEqual(keys, ["fake-invoice-claim:configuration"]);
  } finally { globalThis.fetch = original; }
});

for (const category of ["card", "ach", "link_bank", "default"] as const) test(`single-mode ${category} keeps the existing deterministic first mode`, async () => {
  const original = globalThis.fetch, bodies: URLSearchParams[] = [], keys: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    bodies.push(new URLSearchParams(String(init?.body))); keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    return new Response(JSON.stringify({ id: "cs_fake", url: "https://checkout.stripe.com/c/pay_fake" }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal((await createStripeCheckoutSession({ ...request, paymentMethodConfigurationId: null, paymentMethodCategory: category, allowPaymentMethodFallback: false })).ok, true);
    assert.equal(keys.length, 1); assert.match(keys[0], category === "default" ? /:dynamic$/ : /:payment_method_types$/);
    assert.equal(bodies[0].get("payment_method_types[0]"), { card: "card", ach: "us_bank_account", link_bank: "link", default: null }[category]);
  } finally { globalThis.fetch = original; }
});
