import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { getPasswordResetRedirectUrl, requestSupabasePasswordReset } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = clean(body?.email).toLowerCase();

  if (!looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const rate = checkRateLimit({
    key: `forgot-password:${requestIp(request.headers)}:${email}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many reset requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rate.resetAt)) } },
    );
  }

  const redirectTo = getPasswordResetRedirectUrl(request.url);

  try {
    const response = await requestSupabasePasswordReset(email, redirectTo);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Supabase password reset request failed", {
        status: response.status,
        detail: detail.slice(0, 500),
      });
    }
  } catch (error) {
    console.error("Supabase password reset request errored", error);
    return NextResponse.json(
      { ok: false, error: "Password reset email service is not configured yet." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is active, a password reset link will be sent shortly.",
  });
}
