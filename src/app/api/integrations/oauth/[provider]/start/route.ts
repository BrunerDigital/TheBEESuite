import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { integrationScopeForUser } from "@/lib/integration-scope";
import { isMarketingIntegrationProvider, normalizeIntegrationProvider } from "@/lib/integration-setup";
import {
  buildMarketingAuthorization,
  createOAuthNonce,
  marketingOAuthStatus,
  oauthCallbackUrl,
  signOAuthState,
} from "@/lib/marketing-oauth";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Director access required." }, { status: 403 });
  }

  const provider = normalizeIntegrationProvider((await params).provider);
  if (!provider || !isMarketingIntegrationProvider(provider)) {
    return NextResponse.json({ ok: false, error: "This marketing provider is not supported." }, { status: 404 });
  }
  const oauth = marketingOAuthStatus(provider);
  if (!oauth.supported || !oauth.appConfigured) {
    return NextResponse.json({
      ok: false,
      error: "The BEE Suite OAuth app for this provider still needs its platform client ID and secret.",
    }, { status: 503 });
  }

  const scope = integrationScopeForUser(user, provider);
  if ((user.role === UserRole.CENTER_DIRECTOR || user.role === UserRole.ASSISTANT_DIRECTOR) && !scope.centerId) {
    return NextResponse.json({ ok: false, error: "A school assignment is required before connecting an account." }, { status: 403 });
  }

  const nonce = createOAuthNonce();
  const returnTo = `/billing-settings?view=integrations&provider=${encodeURIComponent(provider)}`;
  const state = signOAuthState({
    provider,
    tenantId: user.tenantId,
    centerId: scope.centerId,
    userId: user.id,
    nonce,
    issuedAt: Date.now(),
    returnTo,
  });
  const redirectUri = oauthCallbackUrl(request.url, provider);
  const authorization = buildMarketingAuthorization({ provider, state, redirectUri });
  const response = NextResponse.redirect(authorization.authorizationUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 10 * 60,
    path: `/api/integrations/oauth/${provider}/callback`,
  };
  response.cookies.set(stateCookieName(provider), nonce, cookieOptions);
  if (authorization.codeVerifier) {
    response.cookies.set(pkceCookieName(provider), authorization.codeVerifier, cookieOptions);
  }
  return response;
}
