import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getCurrentUser, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { updateSupabaseAuthUserPasswordByEmail, verifySupabasePassword } from "@/lib/supabase-auth";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!user.mustResetPassword) {
    return NextResponse.json({ ok: false, error: "This account does not require a forced password reset." }, { status: 400 });
  }

  const limited = checkRateLimit({
    key: `force-password-reset:${requestIp(request.headers)}:${user.id}`,
    limit: 6,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many password reset attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { currentPassword?: unknown; password?: unknown };
  const currentPassword = clean(body.currentPassword);
  const password = clean(body.password);
  if (!currentPassword) {
    return NextResponse.json({ ok: false, error: "Password is required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password === currentPassword) {
    return NextResponse.json({ ok: false, error: "Choose a new password that is different from the current password." }, { status: 400 });
  }

  const verified = await verifySupabasePassword(user.email, currentPassword);
  if (!verified) {
    return NextResponse.json({ ok: false, error: "Password is incorrect." }, { status: 401 });
  }

  try {
    const auth = await updateSupabaseAuthUserPasswordByEmail({ email: user.email, password });
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error || "Password could not be updated." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        mustResetPassword: false,
        sessionVersion: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        sessionVersion: true,
      },
    });

    await writeAuditLog(user, {
      action: "auth.password_forced_reset_completed",
      resource: "User",
      resourceId: user.id,
      metadata: { email: user.email },
    });

    const response = NextResponse.json({
      ok: true,
      message: "Password updated. Your workspace is ready.",
    });
    response.cookies.set(SESSION_COOKIE, createSessionToken(updated), sessionCookieOptions());
    return response;
  } catch (error) {
    logOperationalError("auth.force_password_reset.failed", error, { userId: user.id });
    return NextResponse.json({ ok: false, error: "Password reset service is unavailable right now." }, { status: 503 });
  }
}

export const POST = withApiLogging("POST", POSTHandler);
