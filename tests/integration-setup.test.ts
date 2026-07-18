import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIntegrationSetupViews,
  getIntegrationRuntimeStatus,
  INTEGRATION_SETUP_DEFINITIONS,
  isMarketingIntegrationProvider,
  MARKETING_INTEGRATION_PROVIDERS,
  normalizeIntegrationSetupStatus,
  sanitizeIntegrationConfig,
} from "@/lib/integration-setup";

test("integration setup definitions cover the active setup surface", () => {
  assert.deepEqual(
    INTEGRATION_SETUP_DEFINITIONS.map((definition) => definition.provider),
    ["supabase", "sendgrid", "google_sheets", "google_calendar", "meta_ads", "google_ads", "tiktok_ads", "linkedin_ads", "microsoft_ads", "meta_social", "linkedin_social", "google_business", "tiktok_social", "pinterest_social", "x_social", "openai", "stripe", "twilio"],
  );
});

test("marketing integrations expose the leading ad platforms and remain distinguishable from infrastructure", () => {
  assert.equal(MARKETING_INTEGRATION_PROVIDERS.includes("meta_ads"), true);
  assert.equal(MARKETING_INTEGRATION_PROVIDERS.includes("meta_social"), true);
  assert.equal(MARKETING_INTEGRATION_PROVIDERS.includes("google_business"), true);
  assert.equal(isMarketingIntegrationProvider("meta_ads"), true);
  assert.equal(isMarketingIntegrationProvider("stripe"), false);
});

test("Google Ads readiness requires developer and OAuth credentials", () => {
  const incomplete = getIntegrationRuntimeStatus("google_ads", {}, ["GOOGLE_ADS_REFRESH_TOKEN"]);
  assert.equal(incomplete.configured, false);

  const ready = getIntegrationRuntimeStatus("google_ads", {}, [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]);
  assert.equal(ready.configured, true);
});

test("marketing account metadata sanitizes public identifiers without accepting tokens", () => {
  assert.deepEqual(sanitizeIntegrationConfig("meta_ads", {
    adAccountId: " act_123 ",
    facebookPageId: "page_456",
    accountLabel: "Downtown enrollment",
    META_ADS_ACCESS_TOKEN: "secret",
  }), {
    adAccountId: "act_123",
    facebookPageId: "page_456",
    accountLabel: "Downtown enrollment",
  });
});

test("Google Calendar setup accepts access token credentials", () => {
  const status = getIntegrationRuntimeStatus("google_calendar", {}, [
    "GOOGLE_CALENDAR_ID",
    "GOOGLE_CALENDAR_ACCESS_TOKEN",
  ]);

  assert.equal(status.configured, true);
  assert.equal(status.status, "Connected");
});

test("Supabase setup accepts Vercel Postgres database URL aliases", () => {
  const status = getIntegrationRuntimeStatus("supabase", {
    POSTGRES_PRISMA_URL: "postgresql://example",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  });

  assert.equal(status.configured, true);
  assert.equal(status.status, "Connected");
});

test("integration setup sanitization keeps only approved non-secret fields", () => {
  const config = sanitizeIntegrationConfig("sendgrid", {
    fromEmail: " hello@thebeesuite.io ",
    verifiedDomain: "thebeesuite.io",
    SENDGRID_API_KEY: "SG.secret",
    apiKey: "SG.secret",
    notes: "DNS verified",
  });

  assert.deepEqual(config, {
    fromEmail: "hello@thebeesuite.io",
    verifiedDomain: "thebeesuite.io",
    notes: "DNS verified",
  });
});

test("integration setup views combine saved metadata with runtime environment readiness", () => {
  const views = buildIntegrationSetupViews([
    {
      id: "int_1",
      provider: "stripe",
      status: "ready_for_test",
      lastSyncAt: null,
      configPlaceholder: {
        setup: {
          mode: "live",
          webhookEndpointPath: "/api/billing/stripe-webhook",
          feeDisclosureStatus: "approved",
        },
      },
    },
  ], {
    STRIPE_SECRET_KEY: "sk_test_present",
    STRIPE_WEBHOOK_SECRET: "whsec_present",
  });

  const stripe = views.find((view) => view.provider === "stripe");
  assert.equal(stripe?.status, "Connected");
  assert.equal(stripe?.setupStatus, "ready_for_test");
  assert.equal(stripe?.config.mode, "live");
  assert.equal(stripe?.env.configured, true);
});

test("legacy integration statuses normalize into setup statuses", () => {
  assert.equal(normalizeIntegrationSetupStatus("placeholder"), "not_started");
  assert.equal(normalizeIntegrationSetupStatus("mock_connected"), "verified");
  assert.equal(normalizeIntegrationSetupStatus("custom"), "in_progress");
});
