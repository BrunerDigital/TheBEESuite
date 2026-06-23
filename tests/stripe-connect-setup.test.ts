import assert from "node:assert/strict";
import { test } from "node:test";
import { createStripeConnectedAccount, retrieveStripeConnectedAccount } from "../src/lib/integrations";
import {
  STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE,
  STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS,
  normalizeStripeConnectSetupInput,
  stripeConnectSetupCustomFieldPatch,
} from "../src/lib/stripe-connect-setup";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

test("Stripe Connect setup normalizes dashboard payout profile fields", () => {
  const setup = normalizeStripeConnectSetupInput({
    legalBusinessName: "  Kokomo School LLC  ",
    displayName: " Kid City USA Kokomo ",
    payoutContactName: " School Admin ",
    payoutContactEmail: " BILLING@EXAMPLE.COM ",
    payoutContactPhone: "(765) 555-1234",
    supportEmail: " families@example.com ",
    supportPhone: "765.555.5678",
    addressLine1: " 123 Main Street ",
    city: " Kokomo ",
    state: "in",
    postalCode: "46901",
    businessUrl: "kidcityusa.example/kokomo",
    productDescription: " Tuition, registration fees, and deposits. ",
  });

  assert.equal(setup.ok, true);
  assert.equal(setup.details.legalBusinessName, "Kokomo School LLC");
  assert.equal(setup.details.payoutContactEmail, "billing@example.com");
  assert.equal(setup.details.payoutContactPhone, "+17655551234");
  assert.equal(setup.details.supportPhone, "+17655555678");
  assert.equal(setup.details.state, "IN");
  assert.equal(setup.details.businessUrl, "https://kidcityusa.example/kokomo");
});

test("Stripe Connect setup requires business, contact, and address details before onboarding", () => {
  const setup = normalizeStripeConnectSetupInput({
    legalBusinessName: "Kokomo School LLC",
    payoutContactEmail: "not-an-email",
    payoutContactPhone: "555",
    state: "ZZ",
    postalCode: "abc",
  });

  assert.equal(setup.ok, false);
  assert.equal(setup.errors.addressLine1, "Required");
  assert.equal(setup.errors.city, "Required");
  assert.equal(setup.errors.payoutContactEmail, "Enter a valid email.");
  assert.equal(setup.errors.payoutContactPhone, "Enter a valid phone number.");
  assert.equal(setup.errors.state, "Use a valid two-letter state.");
  assert.equal(setup.errors.postalCode, "Use a valid ZIP code.");
});

test("Stripe Connect setup patch excludes bank account and routing fields", () => {
  const setup = normalizeStripeConnectSetupInput({
    legalBusinessName: "Kokomo School LLC",
    displayName: "Kid City USA Kokomo",
    payoutContactEmail: "billing@example.com",
    payoutContactPhone: "(765) 555-1234",
    supportEmail: "families@example.com",
    supportPhone: "(765) 555-5678",
    addressLine1: "123 Main Street",
    city: "Kokomo",
    state: "IN",
    postalCode: "46901",
    accountNumber: "000123456789",
    routingNumber: "000111000",
  } as Parameters<typeof normalizeStripeConnectSetupInput>[0]);

  assert.equal(setup.ok, true);
  const patch = stripeConnectSetupCustomFieldPatch(setup.details);
  const serialized = JSON.stringify(patch);

  assert.equal(Object.hasOwn(patch.stripeConnectSetup, "accountNumber"), false);
  assert.equal(Object.hasOwn(patch.stripeConnectSetup, "routingNumber"), false);
  assert.equal(serialized.includes("000123456789"), false);
  assert.equal(serialized.includes("000111000"), false);
});

test("Stripe Connect restricted key fix message names required permissions", () => {
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS.includes("Core > Accounts: Write"), true);
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS.includes("Connect > Account Links: Write"), true);
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE.includes("full bank-account information"), false);
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE.includes("Connect-only write access is not enough"), true);
});

test("Stripe connected account creation sends dashboard profile details to Accounts v2", async () => {
  const originalFetch = globalThis.fetch;
  let payload: Record<string, unknown> = {};

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ id: "acct_123", display_name: payload.display_name }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeConnectedAccount({
      businessName: "Kokomo School LLC",
      displayName: "Kid City USA Kokomo",
      email: "billing@example.com",
      phone: "+17655551234",
      supportEmail: "families@example.com",
      supportPhone: "+17655555678",
      address: "123 Main Street",
      addressLine2: "Suite 2",
      city: "Kokomo",
      state: "IN",
      postalCode: "46901",
      businessUrl: "https://kidcityusa.example/kokomo",
      productDescription: "Childcare tuition and registration fees.",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    assert.equal(payload.display_name, "Kid City USA Kokomo");
    const identity = asRecord(payload.identity);
    const businessDetails = asRecord(identity.business_details);
    const businessAddress = asRecord(businessDetails.address);
    const configuration = asRecord(payload.configuration);
    const merchant = asRecord(configuration.merchant);
    const support = asRecord(merchant.support);
    const defaults = asRecord(payload.defaults);
    const profile = asRecord(defaults.profile);

    assert.equal(businessDetails.registered_name, "Kokomo School LLC");
    assert.equal(businessAddress.line1, "123 Main Street");
    assert.equal(businessAddress.line2, "Suite 2");
    assert.equal(support.email, "families@example.com");
    assert.equal(support.url, "https://kidcityusa.example/kokomo");
    assert.equal(profile.business_url, "https://kidcityusa.example/kokomo");
    assert.equal(profile.product_description, "Childcare tuition and registration fees.");
    assert.deepEqual(payload.include, ["configuration.merchant", "configuration.recipient", "requirements"]);
    assert.equal(JSON.stringify(payload).includes("external_account"), false);
    assert.equal(JSON.stringify(payload).includes("requirements_collector"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe connected account retrieval uses indexed Accounts v2 include params", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      id: "acct_123",
      configuration: {
        merchant: { capabilities: { card_payments: { status: "active" } } },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } },
      },
      requirements: { entries: [] },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await retrieveStripeConnectedAccount("acct_123", {
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });
    const url = new URL(requestedUrl);

    assert.equal(result.ok, true);
    assert.equal(result.account?.chargesEnabled, true);
    assert.equal(result.account?.payoutsEnabled, true);
    assert.equal(url.searchParams.get("include[0]"), "configuration.merchant");
    assert.equal(url.searchParams.get("include[1]"), "configuration.recipient");
    assert.equal(url.searchParams.get("include[2]"), "requirements");
    assert.equal(url.searchParams.has("include[]"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe connected account retrieval falls back to legacy account status", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (url: string | URL | Request) => {
    const requestedUrl = String(url);
    requestedUrls.push(requestedUrl);
    if (requestedUrl.includes("/v2/core/accounts/")) {
      return new Response(JSON.stringify({
        error: { message: "Permission denied." },
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      id: "acct_123",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [] },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await retrieveStripeConnectedAccount("acct_123", {
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.id, "acct_123");
    assert.equal(result.account?.chargesEnabled, true);
    assert.equal(result.account?.payoutsEnabled, true);
    assert.equal(requestedUrls.length, 2);
    assert.equal(requestedUrls[0].includes("/v2/core/accounts/acct_123"), true);
    assert.equal(requestedUrls[1], "https://api.stripe.com/v1/accounts/acct_123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
