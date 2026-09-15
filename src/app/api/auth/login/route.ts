import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionMeetsMfaPolicy } from "@/lib/mfa-policy";
import { createSessionToken, requiresPasswordResetGate, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import {
  buildDeviceSessionLabel,
  cleanDeviceLabel,
  cleanUserAgent,
  inferDeviceType,
  normalizeDeviceAppMode,
} from "@/lib/device-sessions";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { verifySupabaseLogin } from "@/lib/supabase-auth";
import { resolveLoginIdentifier } from "@/lib/demo-accounts";
import { resolvePortalPostLoginPath } from "@/lib/login-routing";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const loginIdentifier = clean(body.email).toLowerCase();
  const email = resolveLoginIdentifier(loginIdentifier);
  const password = clean(body.password);
  const ipAddress = requestIp(request.headers);
  const rate = await checkPersistentRateLimit({
    key: `login:${ipAddress}:${loginIdentifier || "unknown"}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many login attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rate.resetAt)) } },
    );
  }

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email or username and password are required." },
      { status: 400 },
    );
  }

  const mfaCode = clean(body.mfaCode);
  if (mfaCode) {
    const mfaRate = await checkPersistentRateLimit({ key: `login-mfa:${ipAddress}:${email}`, limit: 8, windowMs: 15 * 60 * 1000 });
    if (!mfaRate.ok) return NextResponse.json(
      { ok: false, error: "Too many verification attempts. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(mfaRate.resetAt)) } },
    );
  }
  // Snapshot before provider authentication so concurrent factor/password changes
  // cannot promote an earlier password-only attempt into a new application session.
  const before = await prisma.user.findFirst({ where: { email, isActive: true }, select: { id: true, sessionVersion: true } });
  const verified = await verifySupabaseLogin({ email, password, mfaCode, mfaFactorId: clean(body.mfaFactorId) });
  if (verified.status === "mfa_required" || verified.status === "invalid_code") {
    return NextResponse.json({
      ok: false, requiresMfa: true, mfaFactors: verified.factors,
      error: verified.status === "invalid_code" ? "That authenticator code did not work. Try a fresh code." : "Enter the code from your authenticator app.",
    }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (verified.status === "unavailable" || verified.status === "unsupported_factor") {
    return NextResponse.json({ ok: false, error: verified.status === "unsupported_factor"
      ? "This account needs a supported authenticator. Contact your administrator for account recovery."
      : "Sign-in verification is unavailable. Please try again shortly." }, { status: 503 });
  }
  if (verified.status !== "verified") {
    return NextResponse.json(
      { ok: false, error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: {
      id: true,
      tenantId: true,
      email: true,
      name: true,
      role: true,
      mustResetPassword: true,
      sessionVersion: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "This account is not active in The BEE Suite." },
      { status: 403 },
    );
  }

  if (!before || before.id !== user.id || before.sessionVersion !== user.sessionVersion) {
    return NextResponse.json({ ok: false, error: "Your account security changed during sign-in. Please sign in again." }, { status: 409 });
  }

  const nextPath = sessionMeetsMfaPolicy(user.role, verified.mfaVerified)
    ? resolvePortalPostLoginPath({ role: user.role, requestedNext: body.next, portal: body.loginPortal })
    : "/account/security";
  const userAgent = cleanUserAgent(request.headers.get("user-agent"));
  const appMode = normalizeDeviceAppMode(body.appMode, nextPath);
  const deviceType = inferDeviceType(userAgent);
  const label = cleanDeviceLabel(body.deviceLabel) || buildDeviceSessionLabel({ appMode, deviceType, userAgent });
  const deviceSession = await prisma.deviceSession.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      label,
      deviceType,
      appMode,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
    },
    select: { id: true, label: true },
  }).catch(() => null);

  if (deviceSession) {
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: "auth.device_session.created",
        resource: "DeviceSession",
        resourceId: deviceSession.id,
        metadata: { appMode, deviceType, label: deviceSession.label },
      },
    }).catch(() => undefined);
  }

  const response = NextResponse.json({
    ok: true,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
    requiresPasswordReset: requiresPasswordResetGate(user),
    nextPath,
  });
  response.cookies.set(SESSION_COOKIE, createSessionToken({ ...user, mfaVerified: verified.mfaVerified, deviceSessionId: deviceSession?.id }), sessionCookieOptions());
  return response;
}

export const POST = withApiLogging("POST", POSTHandler);
