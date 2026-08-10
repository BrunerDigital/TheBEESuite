import { NextResponse, type NextRequest } from "next/server";
import { canonicalPublicRequestRedirectUrl } from "@/lib/public-app-url";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  const canonicalRedirectUrl = canonicalPublicRequestRedirectUrl(request.url);
  if (canonicalRedirectUrl) {
    return NextResponse.redirect(canonicalRedirectUrl, 308);
  }

  if (process.env.NODE_ENV !== "development" && request.nextUrl.pathname === "/device-preview") {
    return new NextResponse(null, { status: 404 });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
