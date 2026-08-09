import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IntegrationProvider } from "@/lib/integration-setup";

type EnvMap = Record<string, string | undefined>;

type OAuthStatePayload = {
  provider: IntegrationProvider;
  tenantId: string;
  centerId: string | null;
  userId: string;
  nonce: string;
  issuedAt: number;
  returnTo: string;
};

type MarketingOAuthDefinition = {
  provider: IntegrationProvider;
  authorizationUrl: string;
  tokenUrl: string;
  clientIdNames: string[];
  clientSecretNames: string[];
  scopes: string[];
  accessTokenKey: string;
  refreshTokenKey?: string;
  pkce?: boolean;
  tokenAuth?: "body" | "basic";
  authorizationStyle?: "standard" | "tiktok_ads";
  tokenStyle?: "standard" | "tiktok_ads";
};

export type MarketingOAuthStatus = {
  supported: boolean;
  appConfigured: boolean;
  connectHref: string | null;
  requestedScopes: string[];
};

export type MarketingOAuthTokenResult = {
  credentials: Record<string, string>;
  metadata: {
    connectedAt: string;
    expiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    grantedScopes: string[];
    tokenType: string;
  };
};

export type MarketingOAuthRefreshResult = {
  credentials: Record<string, string>;
  expiresAt: string | null;
  refreshTokenExpiresAt: string | null;
};

const graphVersion = process.env.META_GRAPH_API_VERSION || "v23.0";

const definitions: Partial<Record<IntegrationProvider, MarketingOAuthDefinition>> = {
  meta_ads: {
    provider: "meta_ads",
    authorizationUrl: `https://www.facebook.com/${graphVersion}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
    clientIdNames: ["META_APP_ID", "META_CLIENT_ID"],
    clientSecretNames: ["META_APP_SECRET", "META_CLIENT_SECRET"],
    scopes: ["ads_read", "business_management"],
    accessTokenKey: "META_ADS_ACCESS_TOKEN",
  },
  meta_social: {
    provider: "meta_social",
    authorizationUrl: `https://www.facebook.com/${graphVersion}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
    clientIdNames: ["META_APP_ID", "META_CLIENT_ID"],
    clientSecretNames: ["META_APP_SECRET", "META_CLIENT_SECRET"],
    scopes: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_messaging",
      "read_insights",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "instagram_manage_messages",
    ],
    accessTokenKey: "META_SOCIAL_USER_ACCESS_TOKEN",
  },
  google_ads: {
    provider: "google_ads",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdNames: ["GOOGLE_CLIENT_ID"],
    clientSecretNames: ["GOOGLE_CLIENT_SECRET"],
    scopes: ["https://www.googleapis.com/auth/adwords"],
    accessTokenKey: "GOOGLE_ADS_ACCESS_TOKEN",
    refreshTokenKey: "GOOGLE_ADS_REFRESH_TOKEN",
  },
  google_business: {
    provider: "google_business",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdNames: ["GOOGLE_CLIENT_ID"],
    clientSecretNames: ["GOOGLE_CLIENT_SECRET"],
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    accessTokenKey: "GOOGLE_BUSINESS_ACCESS_TOKEN",
    refreshTokenKey: "GOOGLE_BUSINESS_REFRESH_TOKEN",
  },
  tiktok_ads: {
    provider: "tiktok_ads",
    authorizationUrl: "https://ads.tiktok.com/marketing_api/auth",
    tokenUrl: "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/",
    clientIdNames: ["TIKTOK_ADS_APP_ID", "TIKTOK_ADS_CLIENT_ID"],
    clientSecretNames: ["TIKTOK_ADS_APP_SECRET", "TIKTOK_ADS_CLIENT_SECRET"],
    scopes: ["advertiser_management", "reporting"],
    accessTokenKey: "TIKTOK_ADS_ACCESS_TOKEN",
    refreshTokenKey: "TIKTOK_ADS_REFRESH_TOKEN",
    authorizationStyle: "tiktok_ads",
    tokenStyle: "tiktok_ads",
  },
  tiktok_social: {
    provider: "tiktok_social",
    authorizationUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdNames: ["TIKTOK_CLIENT_KEY", "TIKTOK_SOCIAL_CLIENT_KEY"],
    clientSecretNames: ["TIKTOK_CLIENT_SECRET", "TIKTOK_SOCIAL_CLIENT_SECRET"],
    scopes: ["user.info.basic", "user.info.stats", "video.publish", "video.upload"],
    accessTokenKey: "TIKTOK_SOCIAL_ACCESS_TOKEN",
    refreshTokenKey: "TIKTOK_SOCIAL_REFRESH_TOKEN",
  },
  linkedin_ads: {
    provider: "linkedin_ads",
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientIdNames: ["LINKEDIN_CLIENT_ID", "LINKEDIN_ADS_CLIENT_ID"],
    clientSecretNames: ["LINKEDIN_CLIENT_SECRET", "LINKEDIN_ADS_CLIENT_SECRET"],
    scopes: ["r_ads", "r_ads_reporting"],
    accessTokenKey: "LINKEDIN_ADS_ACCESS_TOKEN",
    refreshTokenKey: "LINKEDIN_ADS_REFRESH_TOKEN",
  },
  linkedin_social: {
    provider: "linkedin_social",
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientIdNames: ["LINKEDIN_CLIENT_ID", "LINKEDIN_SOCIAL_CLIENT_ID"],
    clientSecretNames: ["LINKEDIN_CLIENT_SECRET", "LINKEDIN_SOCIAL_CLIENT_SECRET"],
    scopes: ["r_organization_social", "w_organization_social"],
    accessTokenKey: "LINKEDIN_SOCIAL_ACCESS_TOKEN",
    refreshTokenKey: "LINKEDIN_SOCIAL_REFRESH_TOKEN",
  },
  microsoft_ads: {
    provider: "microsoft_ads",
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientIdNames: ["MICROSOFT_ADS_CLIENT_ID"],
    clientSecretNames: ["MICROSOFT_ADS_CLIENT_SECRET"],
    scopes: ["https://ads.microsoft.com/msads.manage", "offline_access"],
    accessTokenKey: "MICROSOFT_ADS_ACCESS_TOKEN",
    refreshTokenKey: "MICROSOFT_ADS_REFRESH_TOKEN",
  },
  pinterest_social: {
    provider: "pinterest_social",
    authorizationUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    clientIdNames: ["PINTEREST_APP_ID", "PINTEREST_CLIENT_ID"],
    clientSecretNames: ["PINTEREST_APP_SECRET", "PINTEREST_CLIENT_SECRET"],
    scopes: ["boards:read", "pins:read", "pins:write", "user_accounts:read"],
    accessTokenKey: "PINTEREST_SOCIAL_ACCESS_TOKEN",
    refreshTokenKey: "PINTEREST_SOCIAL_REFRESH_TOKEN",
    tokenAuth: "basic",
  },
  x_social: {
    provider: "x_social",
    authorizationUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    clientIdNames: ["X_CLIENT_ID", "X_OAUTH_CLIENT_ID"],
    clientSecretNames: ["X_CLIENT_SECRET", "X_OAUTH_CLIENT_SECRET"],
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    accessTokenKey: "X_SOCIAL_ACCESS_TOKEN",
    refreshTokenKey: "X_SOCIAL_REFRESH_TOKEN",
    pkce: true,
    tokenAuth: "basic",
  },
};

function firstEnv(env: EnvMap, names: string[]) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function oauthSecret(env: EnvMap = process.env) {
  const secret = firstEnv(env, ["INTEGRATION_OAUTH_STATE_SECRET", "AUTH_SECRET"]);
  if (secret) return secret;
  if (env.NODE_ENV !== "production") return "dev-only-marketing-oauth-state-secret";
  throw new Error("INTEGRATION_OAUTH_STATE_SECRET or AUTH_SECRET is required for OAuth.");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function marketingOAuthDefinition(provider: IntegrationProvider) {
  return definitions[provider] ?? null;
}

export function marketingOAuthStatus(provider: IntegrationProvider, env: EnvMap = process.env): MarketingOAuthStatus {
  const definition = marketingOAuthDefinition(provider);
  if (!definition) return { supported: false, appConfigured: false, connectHref: null, requestedScopes: [] };
  const appConfigured = Boolean(
    firstEnv(env, definition.clientIdNames) &&
    firstEnv(env, definition.clientSecretNames),
  );
  return {
    supported: true,
    appConfigured,
    connectHref: appConfigured ? `/api/integrations/oauth/${provider}/start` : null,
    requestedScopes: definition.scopes,
  };
}

export function createOAuthNonce() {
  return randomBytes(24).toString("base64url");
}

export function createPkceVerifier() {
  return randomBytes(48).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function signOAuthState(payload: OAuthStatePayload, secret = oauthSecret()) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(token: string, secret = oauthSecret(), now = Date.now()) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload.provider || !payload.tenantId || !payload.userId || !payload.nonce) return null;
    if (!Number.isFinite(payload.issuedAt) || payload.issuedAt > now || now - payload.issuedAt > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function oauthCallbackUrl(requestUrl: string, provider: IntegrationProvider, env: EnvMap = process.env) {
  const configuredOrigin = firstEnv(env, ["APP_URL", "NEXT_PUBLIC_APP_URL"]);
  const vercelOrigin = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
    : "";
  const origin = (configuredOrigin || vercelOrigin || new URL(requestUrl).origin).replace(/\/+$/, "");
  return `${origin}/api/integrations/oauth/${provider}/callback`;
}

export function buildMarketingAuthorization({
  provider,
  state,
  redirectUri,
  env = process.env,
}: {
  provider: IntegrationProvider;
  state: string;
  redirectUri: string;
  env?: EnvMap;
}) {
  const definition = marketingOAuthDefinition(provider);
  if (!definition) throw new Error("This provider does not support OAuth connection.");
  const clientId = firstEnv(env, definition.clientIdNames);
  const clientSecret = firstEnv(env, definition.clientSecretNames);
  if (!clientId || !clientSecret) throw new Error("The platform OAuth app is not configured.");

  const codeVerifier = definition.pkce ? createPkceVerifier() : null;
  const url = new URL(definition.authorizationUrl);
  if (definition.authorizationStyle === "tiktok_ads") {
    url.searchParams.set("app_id", clientId);
    url.searchParams.set("scope", definition.scopes.join(","));
  } else {
    url.searchParams.set(provider.startsWith("tiktok_") ? "client_key" : "client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", definition.scopes.join(provider.startsWith("meta_") || provider.startsWith("tiktok_") ? "," : " "));
  }
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (provider === "google_ads" || provider === "google_business") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
  }
  if (definition.pkce && codeVerifier) {
    url.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { authorizationUrl: url.toString(), codeVerifier };
}

function tokenError(json: Record<string, unknown> | null, status: number) {
  const nested = json?.error && typeof json.error === "object" ? json.error as Record<string, unknown> : null;
  return String(
    nested?.message ||
    json?.error_description ||
    (typeof json?.error === "string" ? json.error : "") ||
    json?.message ||
    `OAuth token exchange returned ${status}.`,
  );
}

function scopeList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? value.split(/[,\s]+/).filter(Boolean) : [];
}

function futureIso(seconds: unknown) {
  const parsed = Number(seconds);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(Date.now() + parsed * 1000).toISOString()
    : null;
}

async function exchangeMetaLongLivedToken({
  definition,
  accessToken,
  clientId,
  clientSecret,
}: {
  definition: MarketingOAuthDefinition;
  accessToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const url = new URL(definition.tokenUrl);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", accessToken);
  const response = await fetch(url);
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof json?.access_token !== "string") {
    throw new Error(tokenError(json, response.status));
  }
  return json;
}

export async function exchangeMarketingOAuthCode({
  provider,
  code,
  redirectUri,
  codeVerifier,
  env = process.env,
}: {
  provider: IntegrationProvider;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
  env?: EnvMap;
}): Promise<MarketingOAuthTokenResult> {
  const definition = marketingOAuthDefinition(provider);
  if (!definition) throw new Error("This provider does not support OAuth connection.");
  const clientId = firstEnv(env, definition.clientIdNames);
  const clientSecret = firstEnv(env, definition.clientSecretNames);
  if (!clientId || !clientSecret) throw new Error("The platform OAuth app is not configured.");

  let response: Response;
  if (definition.tokenStyle === "tiktok_ads") {
    response = await fetch(definition.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        auth_code: code,
        redirect_uri: redirectUri,
      }),
    });
  } else {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    if (provider.startsWith("tiktok_")) body.set("client_key", clientId);
    else if (definition.tokenAuth !== "basic") body.set("client_id", clientId);
    if (definition.tokenAuth !== "basic") body.set("client_secret", clientSecret);
    if (definition.pkce && codeVerifier) body.set("code_verifier", codeVerifier);
    if (provider === "pinterest_social") body.set("continuous_refresh", "true");
    response = await fetch(definition.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(definition.tokenAuth === "basic"
          ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }
          : {}),
      },
      body,
    });
  }

  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  let data = json?.data && typeof json.data === "object" ? json.data as Record<string, unknown> : json;
  if (!response.ok || !data) throw new Error(tokenError(json, response.status));
  let accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) throw new Error(tokenError(json, response.status));
  if (provider === "meta_ads" || provider === "meta_social") {
    data = await exchangeMetaLongLivedToken({
      definition,
      accessToken,
      clientId,
      clientSecret,
    });
    accessToken = String(data.access_token);
  }
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";

  return {
    credentials: {
      [definition.accessTokenKey]: accessToken,
      ...(definition.refreshTokenKey && refreshToken ? { [definition.refreshTokenKey]: refreshToken } : {}),
    },
    metadata: {
      connectedAt: new Date().toISOString(),
      expiresAt: futureIso(data.expires_in),
      refreshTokenExpiresAt: futureIso(data.refresh_token_expires_in ?? data.refresh_expires_in),
      grantedScopes: scopeList(data.scope || data.scopes),
      tokenType: typeof data.token_type === "string" ? data.token_type : "Bearer",
    },
  };
}

export async function refreshMarketingOAuthCredentials({
  provider,
  credentials,
  expiresAt,
  env = process.env,
  now = Date.now(),
}: {
  provider: IntegrationProvider;
  credentials: Record<string, string>;
  expiresAt?: string | null;
  env?: EnvMap;
  now?: number;
}): Promise<MarketingOAuthRefreshResult | null> {
  const definition = marketingOAuthDefinition(provider);
  if (!definition?.refreshTokenKey) return null;
  const refreshToken = credentials[definition.refreshTokenKey]?.trim();
  if (!refreshToken) return null;
  const expiry = expiresAt ? new Date(expiresAt).getTime() : 0;
  if (Number.isFinite(expiry) && expiry > now + 5 * 60 * 1000) return null;

  const clientId = firstEnv(env, definition.clientIdNames);
  const clientSecret = firstEnv(env, definition.clientSecretNames);
  if (!clientId || !clientSecret) throw new Error("The platform OAuth app is not configured for token refresh.");

  let response: Response;
  if (definition.tokenStyle === "tiktok_ads") {
    response = await fetch(definition.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
  } else {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (provider.startsWith("tiktok_")) body.set("client_key", clientId);
    else if (definition.tokenAuth !== "basic") body.set("client_id", clientId);
    if (definition.tokenAuth !== "basic") body.set("client_secret", clientSecret);
    response = await fetch(definition.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(definition.tokenAuth === "basic"
          ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }
          : {}),
      },
      body,
    });
  }

  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const data = json?.data && typeof json.data === "object" ? json.data as Record<string, unknown> : json;
  if (!response.ok || !data) throw new Error(tokenError(json, response.status));
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) throw new Error(tokenError(json, response.status));
  const rotatedRefreshToken = typeof data.refresh_token === "string" ? data.refresh_token : refreshToken;
  return {
    credentials: {
      [definition.accessTokenKey]: accessToken,
      [definition.refreshTokenKey]: rotatedRefreshToken,
    },
    expiresAt: futureIso(data.expires_in),
    refreshTokenExpiresAt: futureIso(data.refresh_token_expires_in ?? data.refresh_expires_in),
  };
}
