import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { getCurrentUser, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { manageMfa, type MfaManagementInput } from "@/lib/mfa-management";
import { getSupabaseAuthConfig } from "@/lib/supabase-auth";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  // Require a same-origin browser request in addition to the HttpOnly session.
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: "Open account security in The BEE Suite to continue." }, { status: 403, headers });
  }
  const user = await getCurrentUser({ allowMfaEnrollment: true });
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to manage your authenticators." }, { status: 401, headers });
  if (appReviewReservedIdentityKind(user.email)) return NextResponse.json({ ok: false, error: "Shared App Review account security is managed by the administrator." }, { status: 403, headers });
  const rate = await checkPersistentRateLimit({ key: `profile-mfa:${requestIp(request.headers)}:${user.id}`, limit: 12, windowMs: 15 * 60 * 1000 });
  if (!rate.ok) return NextResponse.json({ ok: false, error: "Too many attempts. Please wait before trying again." }, { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSeconds(rate.resetAt)) } });
  const parsed = await request.json().catch(() => null);
  const body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  if (!["list", "enroll", "confirm", "remove"].includes(body.action) || typeof body.password !== "string" || !body.password || body.password.length > 1024) {
    return NextResponse.json({ ok: false, error: "Choose an action and enter your current password." }, { status: 400, headers });
  }
  let invalidated = false;
  try {
    const { url, key } = getSupabaseAuthConfig("anon");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
    });
    const result = await manageMfa(client, {
      email: user.email.toLowerCase(), password: body.password, action: body.action as MfaManagementInput["action"],
      factorId: clean(body.factorId), code: clean(body.code), currentFactorId: clean(body.currentFactorId), currentCode: clean(body.currentCode), label: clean(body.label),
    }, async () => {
      // Compare-and-swap plus audit in one transaction prevents concurrent security
      // changes from reusing an old application session. No seeds/codes in audit.
      await prisma.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({ where: { id: user.id, email: user.email, isActive: true, sessionVersion: user.sessionVersion }, data: { sessionVersion: { increment: 1 } } });
        if (updated.count !== 1) throw new Error("Security state changed");
        await tx.auditLog.create({ data: { tenantId: user.identityTenantId, userId: user.id, action: "auth.mfa.change_requested", resource: "User", resourceId: user.id, metadata: { operation: body.action } } });
      });
      invalidated = true;
    });
    const response = NextResponse.json(result, { status: result.ok ? 200 : 400, headers });
    if (invalidated) response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  } catch {
    const response = NextResponse.json({ ok: false, error: "Authenticator service is unavailable.", signInRequired: invalidated }, { status: 503, headers });
    if (invalidated) response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  }
}
