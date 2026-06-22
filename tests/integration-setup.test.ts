import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIntegrationSetupViews,
  getIntegrationRuntimeStatus,
  INTEGRATION_SETUP_DEFINITIONS,
  normalizeIntegrationSetupStatus,
  sanitizeIntegrationConfig,
} from "@/lib/integration-setup";

test("integration setup definitions cover the active setup surface", () => {
  assert.deepEqual(
    INTEGRATION_SETUP_DEFINITIONS.map((definition) => definition.provider),
    ["supabase", "sendgrid", "google_sheets", "google_calendar", "openai", "stripe", "twilio"],
  );
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
