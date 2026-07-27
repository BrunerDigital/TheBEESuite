import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getTenantIntegrationCredentialMap, upsertTenantIntegrationCredentials } from "@/lib/integration-credentials";
import { integrationScopeForUser } from "@/lib/integration-scope";
import {
  getIntegrationRuntimeStatus,
  hasRequiredMarketingAccountConfig,
  isMarketingIntegrationProvider,
  normalizeIntegrationProvider,
  readIntegrationConfig,
  sanitizeIntegrationConfig,
} from "@/lib/integration-setup";
import { discoverMarketingConnection } from "@/lib/marketing-account-discovery";
import { exchangeMarketingOAuthCode, oauthCallbackUrl, verifyOAuthState } from "@/lib/marketing-oauth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

function stateCookieName(provider: string) {
  return `bee_oauth_state_${provider}`;
}

function pkceCookieName(provider: string) {
  return `bee_oauth_pkce_${provider}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function redirectResult(request: NextRequest, provider: string, result: string, error?: string) {
  const url = new URL("/billing-settings", request.url);
  url.searchParams.set("view", "integrations");
  url.searchParams.set("provider", provider);
  url.searchParams.set("oauth", result);
  if (error) url.searchParams.set("oauth_error", error.slice(0, 240));
  const response = NextResponse.redirect(url);
  response.cookies.delete(stateCookieName(provider));
  response.cookies.delete(pkceCookieName(provider));
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const providerParam = (await params).provider;
  const provider = normalizeIntegrationProvider(providerParam);
  if (!provider || !isMarketingIntegrationProvider(provider)) {
    return redirectResult(request, providerParam, "error", "Unsupported marketing provider.");
  }

  const user = await getCurrentUser();
  if (!user || !allowedRoles.has(user.role)) {
    return redirectResult(request, provider, "error", "Your BEE Suite session expired. Sign in and connect again.");
  }
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    return redirectResult(
      request,
      provider,
      "error",
      request.nextUrl.searchParams.get("error_description") || "Provider authorization was canceled.",
    );
  }
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state") || "");
  const stateCookie = request.cookies.get(stateCookieName(provider))?.value || "";
  if (!state || state.provider !== provider || state.nonce !== stateCookie) {
    return redirectResult(request, provider, "error", "The connection request expired or could not be verified.");
  }
  const scope = integrationScopeForUser(user, provider);
  if (
    state.userId !== user.id ||
    state.tenantId !== user.tenantId ||
    state.centerId !== scope.centerId
  ) {
    return redirectResult(request, provider, "error", "The connection request does not match your current school access.");
  }

  const code = request.nextUrl.searchParams.get("code") || request.nextUrl.searchParams.get("auth_code") || "";
  if (!code) return redirectResult(request, provider, "error", "The provider did not return an authorization code.");

  try {
    const tokenResult = await exchangeMarketingOAuthCode({
      provider,
      code,
      redirectUri: oauthCallbackUrl(request.url, provider),
      codeVerifier: request.cookies.get(pkceCookieName(provider))?.value,
    });
    const preliminaryCredentials = {
      ...(await getTenantIntegrationCredentialMap(user.tenantId, provider, scope.centerId)),
      ...tokenResult.credentials,
    };
    let discovery = { config: {}, credentials: {}, candidates: [] } as Awaited<ReturnType<typeof discoverMarketingConnection>>;
    let discoveryError = "";
    try {
      discovery = await discoverMarketingConnection({ provider, credentials: preliminaryCredentials });
    } catch (error) {
      discoveryError = error instanceof Error ? error.message : "Connected, but account discovery needs to be retried.";
    }
    const credentials = { ...tokenResult.credentials, ...discovery.credentials };
    await upsertTenantIntegrationCredentials({
      tenantId: user.tenantId,
      centerId: scope.centerId,
      provider,
      credentials,
      userId: user.id,
    });

    const existing = await prisma.integration.findFirst({
      where: { tenantId: user.tenantId, provider, scopeKey: scope.scopeKey },
      orderBy: { lastSyncAt: "desc" },
    });
    const existingRecord = record(existing?.configPlaceholder);
    const existingSetup = readIntegrationConfig(existing?.configPlaceholder);
    const setup = sanitizeIntegrationConfig(provider, { ...existingSetup, ...discovery.config });
    const credentialKeys = Array.from(new Set([
      ...Object.keys(preliminaryCredentials),
      ...Object.keys(discovery.credentials),
    ]));
    const runtime = getIntegrationRuntimeStatus(provider, process.env, credentialKeys);
    const accountConfigured = hasRequiredMarketingAccountConfig(provider, setup);
    const needsAccountSelection = discovery.candidates.length > 1 && !accountConfigured;
    const now = new Date();
    const configPlaceholder = {
      ...existingRecord,
      setup,
      oauth: {
        ...tokenResult.metadata,
        connectedById: user.id,
        centerId: scope.centerId,
        accountSelectionRequired: needsAccountSelection,
        discoveryError: discoveryError || null,
      },
      availableAccounts: discovery.candidates,
    } as Prisma.InputJsonObject;
    const saved = await prisma.integration.upsert({
      where: {
        tenantId_provider_scopeKey: {
          tenantId: user.tenantId,
          provider,
          scopeKey: scope.scopeKey,
        },
      },
      update: {
        centerId: scope.centerId,
        status: runtime.configured && accountConfigured ? "verified" : "in_progress",
        configPlaceholder,
        lastSyncAt: now,
      },
      create: {
        tenantId: user.tenantId,
        centerId: scope.centerId,
        scopeKey: scope.scopeKey,
        provider,
        status: runtime.configured && accountConfigured ? "verified" : "in_progress",
        configPlaceholder,
        lastSyncAt: now,
      },
    });

    await writeAuditLog(user, {
      action: "integration.oauth.connected",
      resource: "Integration",
      resourceId: saved.id,
      metadata: {
        provider,
        centerId: scope.centerId,
        requestedScopes: tokenResult.metadata.grantedScopes,
        accountSelectionRequired: needsAccountSelection,
        discoveredAccountCount: discovery.candidates.length,
        discoverySucceeded: !discoveryError,
      },
    });
    return redirectResult(request, provider, needsAccountSelection ? "choose_account" : "connected");
  } catch (error) {
    return redirectResult(
      request,
      provider,
      "error",
      error instanceof Error ? error.message : "The provider connection could not be completed.",
    );
  }
}
