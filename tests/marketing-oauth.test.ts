import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { integrationScopeForUser } from "@/lib/integration-scope";
import { hasRequiredMarketingAccountConfig } from "@/lib/integration-setup";
import {
  buildMarketingAuthorization,
  exchangeMarketingOAuthCode,
  marketingOAuthStatus,
  refreshMarketingOAuthCredentials,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/marketing-oauth";

const statePayload = {
  provider: "x_social" as const,
  tenantId: "tenant_1",
  centerId: "center_1",
  userId: "user_1",
  nonce: "nonce_1",
  issuedAt: 1_000_000,
  returnTo: "/billing-settings?view=integrations&provider=x_social",
};

test("OAuth state is signed, school-bound, tamper resistant, and short lived", () => {
  const token = signOAuthState(statePayload, "test-secret");
  assert.deepEqual(verifyOAuthState(token, "test-secret", 1_001_000), statePayload);
  assert.equal(verifyOAuthState(`${token}tampered`, "test-secret", 1_001_000), null);
  assert.equal(verifyOAuthState(token, "test-secret", 1_700_001), null);
});

test("X OAuth uses authorization code PKCE and offline access", () => {
  const authorization = buildMarketingAuthorization({
    provider: "x_social",
    state: "signed-state",
    redirectUri: "https://example.com/api/integrations/oauth/x_social/callback",
    env: {
      X_CLIENT_ID: "client-id",
      X_CLIENT_SECRET: "client-secret",
    },
  });
  const url = new URL(authorization.authorizationUrl);
  assert.equal(url.origin, "https://x.com");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("scope") || "", /offline\.access/);
  assert.ok(authorization.codeVerifier);
});

test("OAuth readiness requires platform app credentials without exposing them as school tokens", () => {
  assert.equal(marketingOAuthStatus("google_ads", {}).appConfigured, false);
  assert.equal(marketingOAuthStatus("google_ads", {
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
  }).appConfigured, true);
});

test("director marketing integrations resolve to the director school scope", () => {
  assert.deepEqual(integrationScopeForUser({
    role: UserRole.ASSISTANT_DIRECTOR,
    primaryCenterId: "center_1",
  }, "meta_social"), {
    centerId: "center_1",
    scopeKey: "center:center_1",
  });
  assert.deepEqual(integrationScopeForUser({
    role: UserRole.CENTER_DIRECTOR,
    primaryCenterId: "center_1",
  }, "meta_social"), {
    centerId: "center_1",
    scopeKey: "center:center_1",
  });
  assert.deepEqual(integrationScopeForUser({
    role: UserRole.BRAND_ADMIN,
    primaryCenterId: "center_1",
  }, "meta_social"), {
    centerId: null,
    scopeKey: "tenant",
  });
});

test("Meta OAuth requests read-only ads access until ad mutation is implemented", () => {
  const authorization = buildMarketingAuthorization({
    provider: "meta_ads",
    state: "signed-state",
    redirectUri: "https://example.com/api/integrations/oauth/meta_ads/callback",
    env: {
      META_APP_ID: "app-id",
      META_APP_SECRET: "app-secret",
    },
  });
  const scopes = new Set((new URL(authorization.authorizationUrl).searchParams.get("scope") || "").split(","));
  assert.equal(scopes.has("ads_read"), true);
  assert.equal(scopes.has("ads_management"), false);
});

test("credential presence alone does not make a marketing account publish-ready", () => {
  assert.equal(hasRequiredMarketingAccountConfig("meta_ads", {}), false);
  assert.equal(hasRequiredMarketingAccountConfig("meta_ads", { adAccountId: "act_123" }), true);
  assert.equal(hasRequiredMarketingAccountConfig("meta_social", { instagramAccountId: "ig_123" }), true);
  assert.equal(hasRequiredMarketingAccountConfig("google_business", { accountId: "a_1" }), false);
});

test("expired OAuth access tokens refresh and retain a rotating refresh token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 7200,
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const refreshed = await refreshMarketingOAuthCredentials({
      provider: "x_social",
      credentials: {
        X_SOCIAL_ACCESS_TOKEN: "old-access",
        X_SOCIAL_REFRESH_TOKEN: "old-refresh",
      },
      expiresAt: "2020-01-01T00:00:00.000Z",
      env: {
        X_CLIENT_ID: "client-id",
        X_CLIENT_SECRET: "client-secret",
      },
      now: Date.parse("2026-07-27T12:00:00.000Z"),
    });
    assert.equal(refreshed?.credentials.X_SOCIAL_ACCESS_TOKEN, "new-access");
    assert.equal(refreshed?.credentials.X_SOCIAL_REFRESH_TOKEN, "new-refresh");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Meta OAuth exchanges the short-lived login token before storing credentials", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        access_token: "short-lived",
        expires_in: 3600,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      access_token: "long-lived",
      expires_in: 5_184_000,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await exchangeMarketingOAuthCode({
      provider: "meta_social",
      code: "oauth-code",
      redirectUri: "https://example.com/api/integrations/oauth/meta_social/callback",
      env: {
        META_APP_ID: "app-id",
        META_APP_SECRET: "app-secret",
      },
    });
    assert.equal(result.credentials.META_SOCIAL_USER_ACCESS_TOKEN, "long-lived");
    assert.equal(requests.length, 2);
    assert.match(requests[1] || "", /grant_type=fb_exchange_token/);
    assert.match(requests[1] || "", /fb_exchange_token=short-lived/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
