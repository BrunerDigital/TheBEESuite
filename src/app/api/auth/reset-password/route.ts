import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateSupabasePassword, verifySupabaseRecoveryTokenHash } from "@/lib/supabase-auth";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: unknown;
    tokenHash?: unknown;
    password?: unknown;
  } | null;
  const accessToken = clean(body?.accessToken);
  const tokenHash = clean(body?.tokenHash);
  const password = clean(body?.password);

  if (!accessToken && !tokenHash) {
    return NextResponse.json({ ok: false, error: "Password reset link is missing or expired." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    let resetAccessToken = accessToken;
    let verifiedEmail = "";
    if (!resetAccessToken && tokenHash) {
      const verified = await verifySupabaseRecoveryTokenHash(tokenHash);
      if (!verified.ok) {
        logOperationalError("auth.reset_password.supabase_token_hash_failed", null);
        return NextResponse.json(
          { ok: false, error: "Password reset link is invalid or expired. Request a fresh reset link." },
          { status: 400 },
        );
      }
      resetAccessToken = verified.accessToken;
      verifiedEmail = verified.email;
    }

    const response = await updateSupabasePassword(resetAccessToken, password);
    if (!response.ok) {
      logOperationalError("auth.reset_password.supabase_update_failed", null, { status: response.status });
      return NextResponse.json(
        { ok: false, error: "Password reset link is invalid or expired. Request a fresh reset link." },
        { status: 400 },
      );
    }
    const payload = (await response.json().catch(() => null)) as { email?: string; user?: { email?: string } } | null;
    const email = verifiedEmail || (payload?.email ?? payload?.user?.email ?? "").toLowerCase();
    if (email) {
      await prisma.user.updateMany({
        where: { email },
        data: {
          mustResetPassword: false,
          sessionVersion: { increment: 1 },
        },
      });
    }
  } catch (error) {
    logOperationalError("auth.reset_password.supabase_update_error", error);
    return NextResponse.json(
      { ok: false, error: "Password reset service is unavailable right now." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Password updated. You can now sign in with your new password.",
  });
}

export const POST = withApiLogging("POST", POSTHandler);
