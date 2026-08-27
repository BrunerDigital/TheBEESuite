import { NextRequest, NextResponse } from "next/server";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { buildPasswordResetTokenUrl, generateSupabasePasswordRecoveryLink, getPasswordResetRedirectUrl } from "@/lib/supabase-auth";
import {
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
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
    let user: { tenantId: string; isActive: boolean } | null = null;
    try {
      user = await prisma.user.findUnique({
        where: { email },
        select: { tenantId: true, isActive: true },
      });
    } catch (error) {
      logOperationalError("auth.forgot_password.user_lookup_unavailable", error);
      return NextResponse.json({
        ok: true,
        message: "If that email is active, a password reset link will be sent shortly. Use only the newest email because another request replaces older links.",
      });
    }
    if (!user?.isActive) {
      return NextResponse.json({
        ok: true,
        message: "If that email is active, a password reset link will be sent shortly. Use only the newest email because another request replaces older links.",
      });
    }

    const recovery = await generateSupabasePasswordRecoveryLink({ email, redirectTo });
    if (!recovery.ok) {
      const providerStatus = recovery.status ?? null;
      logOperationalError("auth.forgot_password.recovery_link_unavailable", null, { provider: "supabase_auth", reason: recovery.error, providerStatus });
      if (providerStatus === 0 || providerStatus === 401 || providerStatus === 403 || providerStatus === 429 || (providerStatus !== null && providerStatus >= 500)) {
        return NextResponse.json(
          { ok: false, error: "Password reset email is temporarily unavailable. Please wait a minute and try again." },
          { status: 503, headers: { "Retry-After": "60" } },
        );
      }
    } else {
      const resetUrl = buildPasswordResetTokenUrl({ tokenHash: recovery.tokenHash, redirectUrl: recovery.redirectTo || redirectTo, requestUrl: request.url, nextPath });
      const safeResetUrl = escapeHtml(resetUrl);
      const delivery = await sendEmail({
        to: [email],
        subject: "Reset your BEE Suite password",
        text: `A password reset was requested for your BEE Suite account.\n\nReset your password: ${resetUrl}\n\nUse only the newest reset email. If you did not request this, you can ignore it.`,
        html: `<p>A password reset was requested for your BEE Suite account.</p><p><a href="${safeResetUrl}">Reset your password securely</a></p><p>Use only the newest reset email. If you did not request this, you can ignore it.</p>`,
        categories: ["password-reset", "transactional"],
        customArgs: { purpose: "password_reset" },
        disableClickTracking: true,
      });
      try {
        await recordEmailDeliveryAttempt({
          tenantId: user.tenantId,
          purpose: "password_reset_email",
          to: [email],
          subject: "Reset your BEE Suite password",
          text: "Sensitive password reset content omitted from the delivery audit.",
          result: delivery,
          maxAttempts: 1,
          metadata: { sensitiveContentOmitted: true, clickTrackingDisabled: true },
        });
      } catch (error) {
        logOperationalError("auth.forgot_password.delivery_audit_unavailable", error, { provider: delivery.provider });
      }
      if (!delivery.ok) {
        logOperationalError("auth.forgot_password.delivery_unavailable", null, { provider: delivery.provider, configured: delivery.configured, error: delivery.error });
      }
    }
  } catch (error) {
    logOperationalError("auth.forgot_password.request_error", error);
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
