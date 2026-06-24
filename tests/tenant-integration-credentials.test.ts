import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { googleSheetsRuntimeConfig, hasGoogleSheetsApiConfig } from "@/lib/google-sheets";
import { createStripeCheckoutSession, createStripeCustomer, getStripeSecretKey } from "@/lib/integrations";

const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

afterEach(() => {
  if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalStripeSecret;
});

test("Google Sheets runtime config prefers tenant credentials over platform env vars", () => {
  const config = googleSheetsRuntimeConfig({
    credentials: {
      GOOGLE_SHEETS_SPREADSHEET_ID: "tenant-sheet",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "tenant-service@example.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "tenant-key",
    },
    env: {
      GOOGLE_SHEETS_SPREADSHEET_ID: "platform-sheet",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "platform-service@example.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "platform-key",
    },
  });

  assert.deepEqual(config, {
    spreadsheetId: "tenant-sheet",
    serviceAccountEmail: "tenant-service@example.com",
    serviceAccountPrivateKey: "tenant-key",
  });
  assert.equal(hasGoogleSheetsApiConfig({ credentials: configToCredentialMap(config), env: {} }), true);
});

test("Stripe helpers prefer tenant credentials over platform env vars", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_platform";

  const secret = await getStripeSecretKey({
    credentials: {
      STRIPE_SECRET_KEY: "sk_tenant",
    },
  });

  assert.equal(secret, "sk_tenant");
});

test("Stripe customer creation uses the tenant secret key when provided", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_platform";
  let authorization = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    authorization = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
    return new Response(JSON.stringify({ id: "cus_tenant" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeCustomer({
      email: "billing@example.com",
      name: "Tenant Billing",
      credentials: {
        STRIPE_SECRET_KEY: "sk_tenant",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.id, "cus_tenant");
    assert.equal(authorization, "Bearer sk_tenant");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe customer creation can target a connected school account", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_platform";
  let stripeAccount = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    stripeAccount = String((init?.headers as Record<string, string> | undefined)?.["Stripe-Account"] ?? "");
    return new Response(JSON.stringify({ id: "cus_connected" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeCustomer({
      email: "family@example.com",
      name: "Example Family",
      connectedAccountId: "acct_school",
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.id, "cus_connected");
    assert.equal(stripeAccount, "acct_school");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe checkout creates direct connected-account sessions for school customers", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = "sk_platform";
  let stripeAccount = "";
  let body = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    stripeAccount = String((init?.headers as Record<string, string> | undefined)?.["Stripe-Account"] ?? "");
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "cs_connected", url: "https://checkout.stripe.test/session" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeCheckoutSession({
      amountCents: 123,
      invoiceNumber: "INV-1",
      customerId: "cus_connected",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { invoiceId: "inv_1", paymentId: "pay_1" },
      connectedAccountId: "acct_school",
      applicationFeeAmountCents: 3,
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(stripeAccount, "acct_school");
    assert.match(body, /customer=cus_connected/);
    assert.match(body, /payment_intent_data%5Bapplication_fee_amount%5D=3/);
    assert.doesNotMatch(body, /transfer_data/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function configToCredentialMap(config: ReturnType<typeof googleSheetsRuntimeConfig>) {
  return {
    GOOGLE_SHEETS_SPREADSHEET_ID: config.spreadsheetId,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: config.serviceAccountEmail,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: config.serviceAccountPrivateKey,
  };
}
