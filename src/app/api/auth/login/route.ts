import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, requiresPasswordResetGate, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import {
  buildDeviceSessionLabel,
  cleanDeviceLabel,
  cleanUserAgent,
  inferDeviceType,
  normalizeDeviceAppMode,
} from "@/lib/device-sessions";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { verifySupabasePassword } from "@/lib/supabase-auth";
import { resolveLoginIdentifier } from "@/lib/demo-accounts";
import { resolvePortalPostLoginPath } from "@/lib/login-routing";
import { ensureParentPortalDefaultLoginForEmail } from "@/lib/parent-portal-logins";

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
  const rate = checkRateLimit({
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

  let verified = await verifySupabasePassword(email, password);
  if (!verified) {
    const parentLogin = await ensureParentPortalDefaultLoginForEmail({ email, password });
    verified = parentLogin.ok;
  }
  if (!verified) {
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

  const nextPath = resolvePortalPostLoginPath({ role: user.role, requestedNext: body.next, portal: body.loginPortal });
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
  response.cookies.set(SESSION_COOKIE, createSessionToken({ ...user, deviceSessionId: deviceSession?.id }), sessionCookieOptions());
  return response;
}

export const POST = withApiLogging("POST", POSTHandler);
