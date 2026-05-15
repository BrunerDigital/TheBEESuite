import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const DEFAULT_SUPABASE_URL = "https://nqjrlktoewiueiwrubas.supabase.co";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseAuthConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase auth environment variables are not configured.");
  }
  return { url, key };
}

async function verifySupabasePassword(email: string, password: string) {
  const { url, key } = getSupabaseAuthConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return false;
  const result = (await response.json()) as { user?: { email?: string } };
  return result.user?.email?.toLowerCase() === email;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = clean(body.email).toLowerCase();
  const password = clean(body.password);

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required." },
      { status: 400 },
    );
  }

  const verified = await verifySupabasePassword(email, password);
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
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "This account is not active in The Bee Suite." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), sessionCookieOptions());
  return response;
}
