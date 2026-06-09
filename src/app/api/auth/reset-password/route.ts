import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateSupabasePassword } from "@/lib/supabase-auth";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: unknown;
    password?: unknown;
  } | null;
  const accessToken = clean(body?.accessToken);
  const password = clean(body?.password);

  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "Password reset link is missing or expired." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const response = await updateSupabasePassword(accessToken, password);
    if (!response.ok) {
      logOperationalError("auth.reset_password.supabase_update_failed", null, { status: response.status });
      return NextResponse.json(
        { ok: false, error: "Password reset link is invalid or expired. Request a fresh reset link." },
        { status: 400 },
      );
    }
    const payload = (await response.json().catch(() => null)) as { email?: string; user?: { email?: string } } | null;
    const email = (payload?.email ?? payload?.user?.email ?? "").toLowerCase();
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
