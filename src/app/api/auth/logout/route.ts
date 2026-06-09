import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

async function POSTHandler() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export const POST = withApiLogging("POST", POSTHandler);
