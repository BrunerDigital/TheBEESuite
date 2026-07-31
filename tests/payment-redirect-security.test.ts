import assert from "node:assert/strict";
import test from "node:test";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  createStripeSetupCheckoutSession,
} from "../src/lib/integrations";
import {
  getSecurePaymentAppBaseUrl,
  isSecurePaymentUrl,
} from "../src/lib/payment-redirect-security";

function setNodeEnv(value?: string) {
  if (value === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Reflect.set(process.env, "NODE_ENV", value);
}

test("production payment callbacks always use the canonical HTTPS Bee Suite host", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  try {
    setNodeEnv("production");
    process.env.NEXT_PUBLIC_APP_URL = "https://bad-cert.example.com";

    assert.equal(
      getSecurePaymentAppBaseUrl("https://bad-cert.example.com/api/billing/checkout-session"),
      "https://thebeesuite.io",
    );

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    assert.equal(
      getSecurePaymentAppBaseUrl("http://localhost:3000/api/billing/checkout-session"),
      "https://thebeesuite.io",
    );
  } finally {
    setNodeEnv(savedNodeEnv);
    if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  }
});

test("local HTTP payment callbacks are allowed only for a local non-production request", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  try {
    setNodeEnv("test");
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    assert.equal(
      getSecurePaymentAppBaseUrl("http://localhost:3000/api/billing/checkout-session"),
      "http://localhost:3000",
    );
    assert.equal(isSecurePaymentUrl("http://localhost:3000/payment-complete"), true);
    assert.equal(isSecurePaymentUrl("http://payments.example.com/payment-complete"), false);
    assert.equal(isSecurePaymentUrl("https://checkout.stripe.com/c/pay/example"), true);
  } finally {
    setNodeEnv(savedNodeEnv);
    if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  }
});

test("Stripe session helpers fail closed before sending insecure return URLs", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const checkout = await createStripeCheckoutSession({
      amountCents: 1_000,
      invoiceNumber: "INV-SECURE",
      successUrl: "http://payments.example.com/success",
      cancelUrl: "https://thebeesuite.io/cancel",
      metadata: { invoiceId: "invoice_1" },
      credentials: { STRIPE_SECRET_KEY: "sk_test_placeholder" },
    });
    const setup = await createStripeSetupCheckoutSession({
      successUrl: "https://thebeesuite.io/success",
      cancelUrl: "http://payments.example.com/cancel",
      metadata: { familyId: "family_1" },
      credentials: { STRIPE_SECRET_KEY: "sk_test_placeholder" },
    });
    const portal = await createStripeBillingPortalSession({
      customerId: "cus_test",
      returnUrl: "http://payments.example.com/account",
      credentials: { STRIPE_SECRET_KEY: "sk_test_placeholder" },
    });

    assert.equal(checkout.ok, false);
    assert.equal(setup.ok, false);
    assert.equal(portal.ok, false);
    assert.match(checkout.error || "", /secure HTTPS URLs/);
    assert.match(setup.error || "", /secure HTTPS URLs/);
    assert.match(portal.error || "", /secure HTTPS URLs/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe session helpers reject an insecure hosted URL response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ id: "cs_insecure", url: "http://checkout.example.com/pay" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch;

  try {
    const result = await createStripeCheckoutSession({
      amountCents: 1_000,
      invoiceNumber: "INV-SECURE",
      successUrl: "https://thebeesuite.io/success",
      cancelUrl: "https://thebeesuite.io/cancel",
      metadata: { invoiceId: "invoice_1" },
      credentials: { STRIPE_SECRET_KEY: "sk_test_placeholder" },
    });

    assert.equal(result.ok, false);
    assert.match(result.error || "", /insecure checkout URL/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
