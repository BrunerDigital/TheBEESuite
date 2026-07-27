import {
  CANONICAL_APP_BASE_URL,
  getAppBaseUrl,
} from "@/lib/supabase-auth";

function parseUrl(value?: string | null) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function isSecurePaymentUrl(value?: string | null) {
  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol === "https:") return true;
  return process.env.NODE_ENV !== "production" && url.protocol === "http:" && isLoopbackHost(url.hostname);
}

export function getSecurePaymentAppBaseUrl(requestUrl?: string) {
  const appBaseUrl = getAppBaseUrl(requestUrl);
  const appUrl = parseUrl(appBaseUrl);
  const incomingUrl = parseUrl(requestUrl);
  const localDevelopmentRequest =
    process.env.NODE_ENV !== "production" &&
    appUrl?.protocol === "http:" &&
    incomingUrl?.protocol === "http:" &&
    isLoopbackHost(appUrl.hostname) &&
    isLoopbackHost(incomingUrl.hostname);

  return localDevelopmentRequest ? appUrl.origin : CANONICAL_APP_BASE_URL;
}

export function invalidPaymentRedirectUrl(...urls: Array<string | null | undefined>) {
  return urls.some((url) => !isSecurePaymentUrl(url));
}
