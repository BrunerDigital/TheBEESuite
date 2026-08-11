import { NextResponse, type NextRequest } from "next/server";
import { canonicalPublicRequestRedirectUrl } from "@/lib/public-app-url";
import { updateSession } from "@/utils/supabase/middleware";

const PUBLIC_SESSIONLESS_PATHS = new Set([
  "/app",
  "/eula",
  "/privacy",
  "/resources",
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
