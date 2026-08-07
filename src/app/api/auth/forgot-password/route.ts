import { NextRequest, NextResponse } from "next/server";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { getPasswordResetRedirectUrl, requestSupabasePasswordReset } from "@/lib/supabase-auth";
import {
  classifyPasswordResetProviderResponse,
  passwordResetEmailCooldownKey,
  passwordResetIpVolumeKey,
} from "@/lib/password-reset-provider-response";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function POSTHandler(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; next?: unknown } | null;
  const email = clean(body?.email).toLowerCase();
  const nextPath = clean(body?.next);

  if (!looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const ip = requestIp(request.headers);
  const [emailRate, ipRate] = await Promise.all([
    checkPersistentRateLimit({
      // Keep the cooldown address-wide (not IP + address) so changing clients
      // cannot turn Supabase's per-user cooldown into an enumeration signal.
      // Persist only a fingerprint, never the submitted email.
      key: passwordResetEmailCooldownKey(email),
      limit: 1,
      windowMs: 60 * 1000,
    }),
    checkPersistentRateLimit({
      key: passwordResetIpVolumeKey(ip),
      limit: 20,
      windowMs: 15 * 60 * 1000,
    }),
  ]);
  const rate = !emailRate.ok ? emailRate : ipRate;
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Please wait about a minute before requesting another reset email." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rate.resetAt)) } },
    );
  }

  const redirectTo = getPasswordResetRedirectUrl(request.url, nextPath);

  try {
    const response = await requestSupabasePasswordReset(email, redirectTo);
    const outcome = classifyPasswordResetProviderResponse(response);

    if (outcome.kind === "temporary_failure") {
      logOperationalError("auth.forgot_password.provider_temporary_failure", null, {
        provider: "supabase_auth",
        status: outcome.providerStatus,
        providerStatus: outcome.providerStatus,
        retryAfterSeconds: outcome.retryAfterSeconds,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Password reset email is temporarily unavailable. Please wait a minute and try again.",
        },
        {
          status: 503,
          headers: { "Retry-After": String(outcome.retryAfterSeconds) },
        },
      );
    }

    if (outcome.kind === "privacy_safe_non_success") {
      logOperationalError("auth.forgot_password.provider_non_success", null, {
        provider: "supabase_auth",
        providerStatus: outcome.providerStatus,
      });
    }
  } catch (error) {
    logOperationalError("auth.forgot_password.supabase_request_error", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Password reset email is temporarily unavailable. Please wait a minute and try again.",
      },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "If that email is active, a password reset link will be sent shortly. Use only the newest email because another request replaces older links.",
  });
}

export const POST = withApiLogging("POST", POSTHandler);
