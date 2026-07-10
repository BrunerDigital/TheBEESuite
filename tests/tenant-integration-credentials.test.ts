import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { googleSheetsRuntimeConfig, hasGoogleSheetsApiConfig } from "@/lib/google-sheets";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripeSetupCheckoutSession,
  getStripePaymentMethodConfigurationId,
  getStripeSecretKey,
} from "@/lib/integrations";

const originalStripeSecret = process.env.STRIPE_SECRET_KEY;
const originalStripeAchPaymentMethodConfigurationId = process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID;
const originalStripeCardPaymentMethodConfigurationId = process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID;
const originalStripeLinkBankPaymentMethodConfigurationId = process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID;

afterEach(() => {
  if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalStripeSecret;
  if (originalStripeAchPaymentMethodConfigurationId === undefined) delete process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID;
  else process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = originalStripeAchPaymentMethodConfigurationId;
  if (originalStripeCardPaymentMethodConfigurationId === undefined) delete process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID;
  else process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID = originalStripeCardPaymentMethodConfigurationId;
  if (originalStripeLinkBankPaymentMethodConfigurationId === undefined) delete process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID;
  else process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID = originalStripeLinkBankPaymentMethodConfigurationId;
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

test("Stripe instant bank configuration falls back to ACH configuration", () => {
  process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_bank";
  delete process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID;

  assert.equal(getStripePaymentMethodConfigurationId("link_bank"), "pmc_bank");

  process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_instant_bank";

  assert.equal(getStripePaymentMethodConfigurationId("link_bank"), "pmc_instant_bank");
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

test("Stripe checkout can require instant bank verification", async () => {
  const originalFetch = globalThis.fetch;
  let body = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "cs_instant_bank", url: "https://checkout.stripe.test/instant-bank" }), {
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
      bankAccountVerificationMethod: "instant",
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.match(body, /payment_method_options%5Bus_bank_account%5D%5Bverification_method%5D=instant/);
    assert.match(body, /payment_method_options%5Bus_bank_account%5D%5Bfinancial_connections%5D%5Bpermissions%5D%5B0%5D=payment_method/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe checkout uses ACH configuration for instant bank login when no dedicated link bank configuration exists", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_bank";
  delete process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID;
  let body = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "cs_link_bank", url: "https://checkout.stripe.test/link-bank" }), {
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
      paymentMethodCategory: "link_bank",
      paymentMethodConfigurationId: getStripePaymentMethodConfigurationId("link_bank"),
      bankAccountVerificationMethod: "instant",
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.match(body, /payment_method_configuration=pmc_bank/);
    assert.match(body, /payment_method_options%5Bus_bank_account%5D%5Bverification_method%5D=instant/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe checkout can be constrained to card-only entry", async () => {
  const originalFetch = globalThis.fetch;
  const originalCardConfiguration = process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID;
  delete process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID;
  let body = "";
  let idempotencyKey = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = String(init?.body ?? "");
    idempotencyKey = String((init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? "");
    return new Response(JSON.stringify({ id: "cs_card_terminal", url: "https://checkout.stripe.test/card-terminal" }), {
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
      metadata: { invoiceId: "inv_1", paymentId: "pay_1", collectionMode: "director_card_terminal" },
      paymentMethodCategory: "card",
      idempotencyKey: "checkout:pay_1",
      checkoutBranding: {
        displayName: "Sarasota via The BEE Suite",
        logoUrl: "https://thebeesuite.io/brand/the-bee-suite/app-icon-dark.png",
        submitMessage: "The BEE Suite secure tuition payment",
        productDescription: "The BEE Suite tuition payment for Johnson Family.",
        paymentDescription: "The BEE Suite tuition payment for Johnson Family.",
      },
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(idempotencyKey, "checkout:pay_1:payment_method_types");
    assert.match(body, /payment_method_types%5B0%5D=card/);
    assert.match(body, /metadata%5BcollectionMode%5D=director_card_terminal/);
    assert.match(body, /branding_settings%5Bdisplay_name%5D=Sarasota\+via\+The\+BEE\+Suite/);
    assert.match(body, /branding_settings%5Blogo%5D%5Btype%5D=url/);
    assert.match(body, /custom_text%5Bsubmit%5D%5Bmessage%5D=The\+BEE\+Suite\+secure\+tuition\+payment/);
    assert.match(body, /payment_intent_data%5Bdescription%5D=The\+BEE\+Suite\+tuition\+payment\+for\+Johnson\+Family/);
    assert.match(body, /line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bdescription%5D=The\+BEE\+Suite\+tuition\+payment\+for\+Johnson\+Family/);
    assert.doesNotMatch(body, /payment_method_configuration/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCardConfiguration) {
      process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID = originalCardConfiguration;
    } else {
      delete process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID;
    }
  }
});

test("Stripe checkout retries without stale payment method configuration", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_stale";
  let calls = 0;
  const bodies: string[] = [];
  const idempotencyKeys: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body ?? ""));
    idempotencyKeys.push(String((init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? ""));
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "No such payment_method_configuration: pmc_stale",
          param: "payment_method_configuration",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "cs_payment", url: "https://checkout.stripe.test/payment" }), {
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
      paymentMethodCategory: "ach",
      paymentMethodConfigurationId: "pmc_stale",
      idempotencyKey: "checkout:pay_1",
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(idempotencyKeys, ["checkout:pay_1:configuration", "checkout:pay_1:payment_method_types"]);
    assert.match(bodies[0], /payment_method_configuration=pmc_stale/);
    assert.doesNotMatch(bodies[1], /payment_method_configuration/);
    assert.match(bodies[1], /payment_method_types%5B0%5D=us_bank_account/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe checkout retries when configured payment methods are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const bodies: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body ?? ""));
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "No valid payment method types for this Checkout Session. Please ensure that you have activated payment methods compatible with your chosen currency in your dashboard.",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "cs_payment_card", url: "https://checkout.stripe.test/payment-card" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeCheckoutSession({
      amountCents: 2500,
      invoiceNumber: "INV-1",
      customerId: "cus_connected",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { invoiceId: "inv_1", paymentId: "pay_1" },
      paymentMethodCategory: "card",
      paymentMethodConfigurationId: "pmc_card_unavailable",
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.match(bodies[0], /payment_method_configuration=pmc_card_unavailable/);
    assert.doesNotMatch(bodies[1], /payment_method_configuration/);
    assert.match(bodies[1], /payment_method_types%5B0%5D=card/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe checkout falls back to dynamic methods when ACH is disabled", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_stale";
  let calls = 0;
  const bodies: string[] = [];
  const idempotencyKeys: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body ?? ""));
    idempotencyKeys.push(String((init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? ""));
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "No such payment_method_configuration: pmc_stale",
          param: "payment_method_configuration",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (calls === 2) {
      return new Response(JSON.stringify({
        error: {
          message: "The payment method type provided: us_bank_account is invalid.",
          param: "payment_method_types[0]",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "cs_payment_dynamic", url: "https://checkout.stripe.test/payment-dynamic" }), {
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
      paymentMethodCategory: "ach",
      paymentMethodConfigurationId: "pmc_stale",
      idempotencyKey: "checkout:pay_1",
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.url, "https://checkout.stripe.test/payment-dynamic");
    assert.equal(calls, 3);
    assert.deepEqual(idempotencyKeys, ["checkout:pay_1:configuration", "checkout:pay_1:payment_method_types", "checkout:pay_1:dynamic"]);
    assert.match(bodies[0], /payment_method_configuration=pmc_stale/);
    assert.match(bodies[1], /payment_method_types%5B0%5D=us_bank_account/);
    assert.doesNotMatch(bodies[2], /payment_method_configuration/);
    assert.doesNotMatch(bodies[2], /payment_method_types/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe setup checkout retries without stale payment method configuration", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_stale";
  let calls = 0;
  const bodies: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body ?? ""));
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "No such payment_method_configuration: pmc_stale",
          param: "payment_method_configuration",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "cs_setup", url: "https://checkout.stripe.test/setup" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeSetupCheckoutSession({
      customerId: "cus_connected",
      paymentMethodCategory: "ach",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { billingAccountId: "ba_1", familyId: "family_1" },
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.match(bodies[0], /payment_method_configuration=pmc_stale/);
    assert.doesNotMatch(bodies[1], /payment_method_configuration/);
    assert.match(bodies[1], /payment_method_types%5B0%5D=us_bank_account/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe setup checkout retries when configured payment methods are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_link_unavailable";
  let calls = 0;
  const bodies: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body ?? ""));
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "No valid payment method types for this Checkout Session. Please ensure that you have activated payment methods compatible with your chosen currency in your dashboard.",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "cs_setup_link", url: "https://checkout.stripe.test/setup-link" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeSetupCheckoutSession({
      customerId: "cus_connected",
      paymentMethodCategory: "link_bank",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { billingAccountId: "ba_1", familyId: "family_1" },
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.match(bodies[0], /payment_method_configuration=pmc_link_unavailable/);
    assert.doesNotMatch(bodies[1], /payment_method_configuration/);
    assert.match(bodies[1], /payment_method_types%5B0%5D=us_bank_account/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe setup checkout falls back to dynamic methods when ACH is disabled", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_stale";
  let calls = 0;
  const bodies: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body ?? ""));
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "No such payment_method_configuration: pmc_stale",
          param: "payment_method_configuration",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (calls === 2) {
      return new Response(JSON.stringify({
        error: {
          message: "The payment method type provided: us_bank_account is invalid.",
          param: "payment_method_types[0]",
        },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "cs_setup_dynamic", url: "https://checkout.stripe.test/setup-dynamic" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeSetupCheckoutSession({
      customerId: "cus_connected",
      paymentMethodCategory: "ach",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { billingAccountId: "ba_1", familyId: "family_1" },
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.url, "https://checkout.stripe.test/setup-dynamic");
    assert.equal(calls, 3);
    assert.match(bodies[0], /payment_method_configuration=pmc_stale/);
    assert.match(bodies[1], /payment_method_types%5B0%5D=us_bank_account/);
    assert.doesNotMatch(bodies[2], /payment_method_configuration/);
    assert.doesNotMatch(bodies[2], /payment_method_types/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe setup checkout can require instant bank verification", async () => {
  const originalFetch = globalThis.fetch;
  let body = "";

  globalThis.fetch = (async (_input, init) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "cs_setup_instant", url: "https://checkout.stripe.test/setup-instant" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeSetupCheckoutSession({
      customerId: "cus_bank",
      paymentMethodCategory: "link_bank",
      bankAccountVerificationMethod: "instant",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { billingAccountId: "ba_1", familyId: "family_1" },
      checkoutBranding: {
        displayName: "Sarasota via The BEE Suite",
        iconUrl: "https://thebeesuite.io/brand/the-bee-suite/favicon-dark.png",
        submitMessage: "The BEE Suite secure bank verification",
        setupDescription: "The BEE Suite payment profile setup for Johnson Family.",
      },
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, true);
    assert.match(body, /payment_method_options%5Bus_bank_account%5D%5Bverification_method%5D=instant/);
    assert.match(body, /payment_method_options%5Bus_bank_account%5D%5Bfinancial_connections%5D%5Bpermissions%5D%5B0%5D=payment_method/);
    assert.match(body, /branding_settings%5Bdisplay_name%5D=Sarasota\+via\+The\+BEE\+Suite/);
    assert.match(body, /branding_settings%5Bicon%5D%5Btype%5D=url/);
    assert.match(body, /custom_text%5Bsubmit%5D%5Bmessage%5D=The\+BEE\+Suite\+secure\+bank\+verification/);
    assert.match(body, /setup_intent_data%5Bdescription%5D=The\+BEE\+Suite\+payment\+profile\+setup\+for\+Johnson\+Family/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe setup checkout does not retry unrelated Stripe errors", async () => {
  const originalFetch = globalThis.fetch;
  process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID = "pmc_configured";
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "Customer does not exist." } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeSetupCheckoutSession({
      customerId: "cus_missing",
      paymentMethodCategory: "ach",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { billingAccountId: "ba_1", familyId: "family_1" },
      credentials: { STRIPE_SECRET_KEY: "sk_platform" },
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "Customer does not exist.");
    assert.equal(calls, 1);
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
