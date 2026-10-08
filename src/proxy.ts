import { NextResponse, type NextRequest } from "next/server";
import { canonicalPublicRequestRedirectUrl } from "@/lib/public-app-url";
import { updateSession } from "@/utils/supabase/middleware";

const PUBLIC_SESSIONLESS_PATHS = new Set([
  "/app",
  "/brand/the-bee-suite/usage/current",
  "/brand/the-bee-suite/usage/current/",
  "/mobile-apps",
  "/eula",
  "/privacy",
  "/resources",
  "/resources/director-training",
  "/support",
  "/terms",
]);

export async function proxy(request: NextRequest) {
  const canonicalRedirectUrl = canonicalPublicRequestRedirectUrl(request.url);
  if (canonicalRedirectUrl) {
    return NextResponse.redirect(canonicalRedirectUrl, 308);
  }

  if (request.nextUrl.pathname === "/device-preview") {
    if (process.env.NODE_ENV !== "development") {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  // Only published static training files are sessionless; no API or sandbox route is included.
  if (["GET", "HEAD"].includes(request.method) && request.nextUrl.pathname.startsWith("/training/directors/current/")) {
    return NextResponse.next();
  }

  if (PUBLIC_SESSIONLESS_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
