import { NextResponse } from "next/server";

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/training/directors/current/index.html", request.url), 307);
}
