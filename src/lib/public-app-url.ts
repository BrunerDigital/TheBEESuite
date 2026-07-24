export const CANONICAL_APP_BASE_URL = "https://thebeesuite.io";

const CANONICAL_APP_HOSTNAME = new URL(CANONICAL_APP_BASE_URL).hostname;
const PUBLIC_APP_HOSTNAMES = new Set([
  CANONICAL_APP_HOSTNAME,
  `www.${CANONICAL_APP_HOSTNAME}`,
]);

function cleanUrl(value?: string | null) {
  return value?.trim().replace(/\/+$/, "") || "";
}

function hasVercelAppHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "vercel.app" || normalized.endsWith(".vercel.app");
}

function hasPublicAppHost(hostname: string) {
  return PUBLIC_APP_HOSTNAMES.has(hostname.toLowerCase());
}

export function canonicalizePublicUrl(value?: string | null) {
  const cleaned = cleanUrl(value);
  if (!cleaned) return "";

  try {
    const url = new URL(cleaned);
    if (hasPublicAppHost(url.hostname) || hasVercelAppHost(url.hostname)) {
      const canonical = new URL(CANONICAL_APP_BASE_URL);
      url.protocol = canonical.protocol;
      url.host = canonical.host;
    }
    return cleanUrl(url.toString());
  } catch {
    return cleaned;
  }
}

export function canonicalPublicRequestRedirectUrl(value: string) {
  try {
    const requestUrl = new URL(value);
    if (!hasPublicAppHost(requestUrl.hostname)) return null;

    const canonical = new URL(CANONICAL_APP_BASE_URL);
    if (requestUrl.protocol === canonical.protocol && requestUrl.host === canonical.host) {
      return null;
    }

    const redirectUrl = new URL(CANONICAL_APP_BASE_URL);
    redirectUrl.pathname = requestUrl.pathname;
    redirectUrl.search = requestUrl.search;
    redirectUrl.hash = requestUrl.hash;
    return redirectUrl.toString();
  } catch {
    return null;
  }
}

export function securePublicAppUrlForPath(pathname: string, search = "", hash = "") {
  const url = new URL(CANONICAL_APP_BASE_URL);
  url.pathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  url.search = search;
  url.hash = hash;
  return url.toString();
}
