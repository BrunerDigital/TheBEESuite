import { NextRequest, NextResponse } from "next/server";
import { updateSupabasePassword } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
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
      const detail = await response.text().catch(() => "");
      console.error("Supabase password update failed", {
        status: response.status,
        detail: detail.slice(0, 500),
      });
      return NextResponse.json(
        { ok: false, error: "Password reset link is invalid or expired. Request a fresh reset link." },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Supabase password update errored", error);
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
