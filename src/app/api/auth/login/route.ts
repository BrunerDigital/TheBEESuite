import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { verifySupabasePassword } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
