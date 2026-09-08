import type { NextRequest } from "next/server";

export function hasTrustedMutationOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;

  // Native WebViews and non-browser first-party clients may omit both headers.
  // Authentication and route-specific authorization still apply.
  return true;
}
