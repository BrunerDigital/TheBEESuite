import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  completeStripeConnectedAccountBusinessProfile,
  createStripeAccountLink,
  createStripeConnectedAccount,
  createStripeExpressDashboardLoginLink,
  createStripePayoutBankSelectionLink,
  listStripeConnectedAccountPayoutBanks,
  retrieveStripeConnectedAccount,
  setStripeConnectedAccountDailyPayouts,
  setStripeConnectedAccountManualPayouts,
  stripeSchoolStatementDescriptor,
} from "../src/lib/integrations";
import {
  STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE,
  STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS,
  normalizeStripeConnectSetupInput,
  stripeConnectSetupCustomFieldPatch,
  verifyStripeConnectAccountBinding,
} from "../src/lib/stripe-connect-setup";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

test("Stripe school statement descriptors follow the school brand", () => {
  assert.deepEqual(stripeSchoolStatementDescriptor("Kid City USA - Fishers"), {
    descriptor: "KID CITY USA",
    prefix: "KIDCITY",
  });
  assert.deepEqual(stripeSchoolStatementDescriptor("Miss Honey's Onion Sprouts - Lyons"), {
    descriptor: "MISS HONEYS",
    prefix: "MISSHONEY",
  });
  assert.deepEqual(stripeSchoolStatementDescriptor("A B C"), {
    descriptor: "A B C",
    prefix: "SCHOOL",
  });
  assert.deepEqual(stripeSchoolStatementDescriptor("12345"), {
    descriptor: "SCHOOL TUITION",
    prefix: "SCHOOLTUITION".slice(0, 10),
  });
});

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
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS.includes("Core > Accounts: Read"), true);
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS.includes("Core > Accounts: Write"), true);
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS.includes("Connect > Account Links: Write"), true);
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE.includes("full bank-account information"), false);
  assert.equal(STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE.includes("Connect-only write access is not enough"), true);
});

test("Stripe payout handoffs remain bound to the school's designated account", () => {
  assert.deepEqual(
    verifyStripeConnectAccountBinding("acct_school", "acct_school"),
    { ok: true, accountId: "acct_school" },
  );
  assert.equal(verifyStripeConnectAccountBinding("acct_school", "acct_other").ok, false);
  assert.equal(verifyStripeConnectAccountBinding("not-an-account", "not-an-account").ok, false);

  for (const routePath of [
    "src/app/api/billing/connect/onboard/route.ts",
    "src/app/api/billing/connect/payout-account/route.ts",
  ]) {
    const route = readFileSync(routePath, "utf8");
    assert.match(route, /retrieveStripeConnectedAccount\(accountId/, `${routePath} must retrieve the mapped account`);
    assert.match(route, /verifyStripeConnectAccountBinding\(accountId/, `${routePath} must verify the exact account`);
  }
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
    const responsibilities = asRecord(defaults.responsibilities);

    assert.equal(businessDetails.registered_name, "Kokomo School LLC");
    assert.equal(businessDetails.phone, "+17655551234");
    assert.equal(businessAddress.line1, "123 Main Street");
    assert.equal(businessAddress.line2, "Suite 2");
    assert.equal(support.email, "families@example.com");
    assert.equal(merchant.mcc, "8351");
    assert.equal(asRecord(merchant.statement_descriptor).descriptor, "KID CITY USA");
    assert.equal(support.url, "https://kidcityusa.example/kokomo");
    assert.equal(profile.business_url, "https://kidcityusa.example/kokomo");
    assert.equal(profile.product_description, "Childcare tuition and registration fees.");
    assert.equal(payload.dashboard, "full");
    assert.equal(responsibilities.fees_collector, "stripe");
    assert.equal(responsibilities.losses_collector, "stripe");
    assert.ok(asRecord(configuration.customer));
    assert.equal(Object.hasOwn(configuration, "recipient"), false);
    assert.deepEqual(payload.include, ["configuration.merchant", "configuration.customer", "defaults", "requirements"]);
    assert.equal(JSON.stringify(payload).includes("external_account"), false);
    assert.equal(JSON.stringify(payload).includes("requirements_collector"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe connected account payout schedule is set to daily automatic payouts", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let body = "";
  let stripeAccount = "";

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    body = String(init?.body);
    stripeAccount = String((init?.headers as Record<string, string> | undefined)?.["Stripe-Account"] ?? "");
    return new Response(JSON.stringify({
      object: "balance_settings",
      payments: {
        payouts: { schedule: { interval: "daily" } },
        settlement_timing: { delay_days: 2 },
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await setStripeConnectedAccountDailyPayouts({
      accountId: "acct_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });
    const params = new URLSearchParams(body);

    assert.equal(result.ok, true);
    assert.equal(requestedUrl, "https://api.stripe.com/v1/balance_settings");
    assert.equal(stripeAccount, "acct_123");
    assert.equal(params.get("payments[payouts][schedule][interval]"), "daily");
    assert.equal(params.get("payments[settlement_timing][delay_days_override]"), "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe connected account payout hold uses a manual schedule without touching bank accounts", async () => {
  const originalFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ object: "balance_settings", payments: { payouts: { schedule: { interval: "manual" } } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await setStripeConnectedAccountManualPayouts({
      accountId: "acct_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });
    const params = new URLSearchParams(body);
    assert.equal(result.ok, true);
    assert.equal(params.get("payments[payouts][schedule][interval]"), "manual");
    assert.equal(body.includes("external_account"), false);
    assert.equal(body.includes("bank"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe connected account business completion supplies childcare merchant fields", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let payload: Record<string, unknown> = {};
  let idempotencyKey = "";

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    payload = JSON.parse(String(init?.body));
    idempotencyKey = String((init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? "");
    return new Response(JSON.stringify({
      id: "acct_123",
      livemode: true,
      configuration: {
        merchant: { capabilities: { card_payments: { status: "restricted" } } },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "restricted" } } } },
      },
      requirements: { entries: [{ description: "external_account" }] },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await completeStripeConnectedAccountBusinessProfile({
      accountId: "acct_123",
      businessName: "Miss Honey's Onion Sprouts - Lyons",
      businessPhone: "+17655551234",
      businessUrl: "https://kidcityusa.com/locations/indiana/fishers/",
      ein: "12-3456789",
      idempotencyKey: "kidcity-account-profile-center_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });
    const configuration = asRecord(payload.configuration);
    const merchant = asRecord(configuration.merchant);
    const identity = asRecord(payload.identity);
    const defaults = asRecord(payload.defaults);

    assert.equal(result.ok, true);
    assert.equal(result.account?.detailsSubmitted, false);
    assert.deepEqual(result.account?.requirementFields, ["external_account"]);
    assert.equal(requestedUrl, "https://api.stripe.com/v2/core/accounts/acct_123");
    assert.equal(merchant.mcc, "8351");
    assert.equal(asRecord(merchant.statement_descriptor).descriptor, "MISS HONEYS");
    assert.equal(asRecord(merchant.statement_descriptor).prefix, "MISSHONEY");
    assert.equal(asRecord(identity.business_details).phone, "+17655551234");
    assert.deepEqual(asRecord(identity.business_details).id_numbers, [{ type: "us_ein", value: "123456789" }]);
    assert.equal(asRecord(merchant.support).url, "https://kidcityusa.com/locations/indiana/fishers/");
    assert.equal(asRecord(asRecord(defaults.profile)).business_url, "https://kidcityusa.com/locations/indiana/fishers/");
    assert.equal(idempotencyKey, "kidcity-account-profile-center_123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe payout bank selection opens the account-specific Express Dashboard", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let method = "";

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    method = String(init?.method);
    return new Response(JSON.stringify({
      url: "https://connect.stripe.com/express/acct_123/secure",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeExpressDashboardLoginLink({
      accountId: "acct_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.url, "https://connect.stripe.com/express/acct_123/secure");
    assert.equal(requestedUrl, "https://api.stripe.com/v1/accounts/acct_123/login_links");
    assert.equal(method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe payout bank selection falls back to onboarding before the Express Dashboard is available", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) {
      return new Response(JSON.stringify({
        error: { message: "Cannot create a login link for an account that has not completed onboarding." },
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (requestedUrls.length === 2) {
      return new Response(JSON.stringify({
        id: "acct_123",
        configuration: {
          customer: {},
          merchant: {},
          recipient: {},
        },
        defaults: {
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        requirements: {},
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      url: "https://connect.stripe.com/setup/acct_123/secure",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripePayoutBankSelectionLink({
      accountId: "acct_123",
      refreshUrl: "https://thebeesuite.io/api/billing/connect/refresh?centerId=center_123",
      returnUrl: "https://thebeesuite.io/billing-settings?stripeConnect=return&center=center_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "onboarding");
    assert.equal(result.url, "https://connect.stripe.com/setup/acct_123/secure");
    assert.equal(requestedUrls[0], "https://api.stripe.com/v1/accounts/acct_123/login_links");
    assert.match(requestedUrls[1], /^https:\/\/api\.stripe\.com\/v2\/core\/accounts\/acct_123\?/);
    assert.equal(requestedUrls[2], "https://api.stripe.com/v2/core/account_links");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe payout bank setup uses hosted onboarding for an existing Full Dashboard account", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) {
      return new Response(JSON.stringify({
        id: "acct_123",
        dashboard: "full",
        configuration: {
          merchant: {},
          recipient: {},
        },
        requirements: {},
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      url: "https://connect.stripe.com/setup/acct_123/secure",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripePayoutBankSelectionLink({
      accountId: "acct_123",
      dashboard: "full",
      payoutBankConfirmed: false,
      refreshUrl: "https://thebeesuite.io/api/billing/connect/refresh?centerId=center_123",
      returnUrl: "https://thebeesuite.io/billing-settings?stripeConnect=return&center=center_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "onboarding");
    assert.equal(result.url, "https://connect.stripe.com/setup/acct_123/secure");
    assert.match(requestedUrls[0], /^https:\/\/api\.stripe\.com\/v2\/core\/accounts\/acct_123\?/);
    assert.equal(requestedUrls[1], "https://api.stripe.com/v2/core/account_links");
    assert.equal(requestedUrls.some((url) => url.includes("/login_links")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe payout bank changes send Full Dashboard schools to Stripe sign in", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 500 });
  }) as typeof fetch;

  try {
    const result = await createStripePayoutBankSelectionLink({
      accountId: "acct_123",
      dashboard: "full",
      payoutBankConfirmed: true,
      refreshUrl: "https://thebeesuite.io/api/billing/connect/refresh?centerId=center_123",
      returnUrl: "https://thebeesuite.io/billing-settings?stripeConnect=return&center=center_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "dashboard");
    assert.equal(result.url, "https://dashboard.stripe.com/settings/payouts");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe account links match the configurations applied to the Accounts v2 account", async () => {
  const originalFetch = globalThis.fetch;
  let accountLinkBody: Record<string, unknown> = {};

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://api.stripe.com/v2/core/accounts/acct_configured?")) {
      return new Response(JSON.stringify({
        id: "acct_configured",
        configuration: {
          customer: { capabilities: { automatic_indirect_tax: { requested: true } } },
          merchant: { capabilities: { card_payments: { requested: true } } },
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        defaults: {
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        requirements: {},
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    assert.equal(String(url), "https://api.stripe.com/v2/core/account_links");
    accountLinkBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({
      url: "https://connect.stripe.com/setup/acct_configured/secure",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeAccountLink({
      accountId: "acct_configured",
      refreshUrl: "https://thebeesuite.io/api/billing/connect/refresh?centerId=center_123",
      returnUrl: "https://thebeesuite.io/stripe-reauthorization?center=center_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    const useCase = asRecord(accountLinkBody.use_case);
    const onboarding = asRecord(useCase.account_onboarding);
    const collectionOptions = asRecord(onboarding.collection_options);
    assert.deepEqual(onboarding.configurations, ["customer", "merchant", "recipient"]);
    assert.equal(collectionOptions.fields, "eventually_due");
    assert.equal(collectionOptions.future_requirements, "include");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe account links can collect only currently due requirements without future requirements", async () => {
  const originalFetch = globalThis.fetch;
  let accountLinkBody: Record<string, unknown> = {};

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://api.stripe.com/v2/core/accounts/acct_current_due?")) {
      return new Response(JSON.stringify({
        id: "acct_current_due",
        applied_configurations: ["merchant", "recipient"],
        configuration: {
          merchant: { capabilities: { card_payments: { status: "restricted" } } },
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "restricted" } } } },
        },
        defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
        requirements: {},
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    assert.equal(String(url), "https://api.stripe.com/v2/core/account_links");
    accountLinkBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ url: "https://connect.stripe.com/setup/acct_current_due/secure" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeAccountLink({
      accountId: "acct_current_due",
      refreshUrl: "https://thebeesuite.io/api/billing/connect/migration/refresh?centerId=center_123",
      returnUrl: "https://thebeesuite.io/stripe-reauthorization?center=center_123",
      collectionFields: "currently_due",
      includeFutureRequirements: false,
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    const useCase = asRecord(accountLinkBody.use_case);
    const onboarding = asRecord(useCase.account_onboarding);
    const collectionOptions = asRecord(onboarding.collection_options);
    assert.equal(useCase.type, "account_onboarding");
    assert.deepEqual(onboarding.configurations, ["merchant", "recipient"]);
    assert.equal(collectionOptions.fields, "currently_due");
    assert.equal(Object.hasOwn(collectionOptions, "future_requirements"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe account links use the update flow after an account has completed onboarding", async () => {
  const originalFetch = globalThis.fetch;
  let accountLinkBody: Record<string, unknown> = {};

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://api.stripe.com/v2/core/accounts/acct_update?")) {
      return new Response(JSON.stringify({
        id: "acct_update",
        livemode: true,
        details_submitted: true,
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { status: "restricted" },
              stripe_balance: { payouts: { status: "restricted" } },
            },
          },
          customer: {},
        },
        defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
        requirements: {
          currently_due: ["identity.business_details.tax_id"],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    accountLinkBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ url: "https://connect.stripe.com/update/acct_update/secure" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await createStripeAccountLink({
      accountId: "acct_update",
      refreshUrl: "https://thebeesuite.io/api/billing/connect/refresh?centerId=center_123",
      returnUrl: "https://thebeesuite.io/billing-settings?center=center_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });

    assert.equal(result.ok, true);
    const useCase = asRecord(accountLinkBody.use_case);
    const update = asRecord(useCase.account_update);
    assert.equal(useCase.type, "account_update");
    assert.deepEqual(update.configurations, ["customer", "merchant"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Stripe payout bank lookup selects the default USD account for location confirmation", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      data: [
        {
          id: "ba_secondary",
          object: "bank_account",
          bank_name: "Corporate Bank",
          last4: "1111",
          currency: "usd",
          country: "US",
          status: "verified",
          default_for_currency: false,
        },
        {
          id: "ba_location",
          object: "bank_account",
          bank_name: "Corporate Bank",
          last4: "7788",
          currency: "usd",
          country: "US",
          status: "verified",
          default_for_currency: true,
        },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await listStripeConnectedAccountPayoutBanks({
      accountId: "acct_123",
      credentials: { STRIPE_SECRET_KEY: "sk_tenant" },
    });
    const url = new URL(requestedUrl);

    assert.equal(result.ok, true);
    assert.equal(result.banks.length, 2);
    assert.equal(result.defaultBank?.bankName, "Corporate Bank");
    assert.equal(result.defaultBank?.last4, "7788");
    assert.equal(url.pathname, "/v1/accounts/acct_123/external_accounts");
    assert.equal(url.searchParams.get("object"), "bank_account");
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
      livemode: true,
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { status: "active" },
            stripe_balance: { payouts: { status: "active" } },
          },
        },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "restricted" } } } },
      },
      defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      requirements: {
        entries: [
          {
            description: "external_account",
            awaiting_action_from: "user",
            minimum_deadline: { status: "currently_due" },
          },
          {
            description: "identity.attestations.terms_of_service",
            awaiting_action_from: "user",
            minimum_deadline: { status: "past_due" },
          },
          {
            description: "identity.future_requirement",
            awaiting_action_from: "user",
            minimum_deadline: { status: "eventually_due" },
          },
          {
            description: "identity.business_details.address",
            awaiting_action_from: "stripe",
            minimum_deadline: { status: "currently_due" },
          },
        ],
      },
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
    assert.equal(result.account?.livemode, true);
    assert.equal(result.account?.chargesEnabled, true);
    assert.equal(result.account?.payoutsEnabled, true);
    assert.equal(result.account?.merchantPayoutCapabilityStatus, "active");
    assert.equal(result.account?.recipientTransferStatus, "restricted");
    assert.equal(result.account?.feesCollector, "stripe");
    assert.equal(result.account?.lossesCollector, "stripe");
    assert.deepEqual(result.account?.currentlyDueRequirementFields, [
      "external_account",
      "identity.attestations.terms_of_service",
    ]);
    assert.deepEqual(result.account?.pendingVerificationFields, [
      "identity.business_details.address",
    ]);
    assert.deepEqual(result.account?.eventuallyDueRequirementFields, ["identity.future_requirement"]);
    assert.equal(url.searchParams.get("include[0]"), "configuration.merchant");
    assert.equal(url.searchParams.get("include[1]"), "configuration.recipient");
    assert.equal(url.searchParams.get("include[2]"), "configuration.customer");
    assert.equal(url.searchParams.get("include[3]"), "defaults");
    assert.equal(url.searchParams.get("include[4]"), "requirements");
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
      livemode: true,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: {
        currently_due: ["external_account"],
        pending_verification: ["company.tax_id"],
      },
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
    assert.equal(result.account?.livemode, true);
    assert.equal(result.account?.chargesEnabled, true);
    assert.equal(result.account?.payoutsEnabled, true);
    assert.deepEqual(result.account?.currentlyDueRequirementFields, ["external_account"]);
    assert.deepEqual(result.account?.pendingVerificationFields, ["company.tax_id"]);
    assert.equal(requestedUrls.length, 2);
    assert.equal(requestedUrls[0].includes("/v2/core/accounts/acct_123"), true);
    assert.equal(requestedUrls[1], "https://api.stripe.com/v1/accounts/acct_123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
