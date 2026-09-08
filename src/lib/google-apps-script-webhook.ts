const CONFIGURATION_HOST = "script.google.com";
const REDIRECT_HOST = "script.googleusercontent.com";
const MAX_REDIRECTS = 3;

function parsedHttpsUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || (url.port && url.port !== "443")
      || url.hash
    ) return null;
    return url;
  } catch {
    return null;
  }
}

export function trustedGoogleAppsScriptWebhookUrl(value: unknown) {
  const url = parsedHttpsUrl(value);
  if (!url || url.hostname !== CONFIGURATION_HOST) return null;
  if (!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url.pathname)) return null;
  return url.toString();
}

function trustedGoogleAppsScriptRedirectUrl(value: string, base: string) {
  let resolved: URL;
  try {
    resolved = new URL(value, base);
  } catch {
    return null;
  }
  const parsed = parsedHttpsUrl(resolved.toString());
  if (!parsed) return null;
  if (parsed.hostname === CONFIGURATION_HOST) {
    return trustedGoogleAppsScriptWebhookUrl(parsed.toString());
  }
  if (parsed.hostname !== REDIRECT_HOST || !parsed.pathname.startsWith("/macros/")) return null;
  return parsed.toString();
}

export async function postJsonToGoogleAppsScriptWebhook({
  url,
  payload,
  signal,
  fetchImpl = fetch,
}: {
  url: string;
  payload: unknown;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}) {
  const initialUrl = trustedGoogleAppsScriptWebhookUrl(url);
  if (!initialUrl) throw new Error("Google Apps Script webhook URL is not allowed.");
  let currentUrl: string = initialUrl;

  let method: "GET" | "POST" = "POST";
  let body: string | undefined = JSON.stringify(payload);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response: Response = await fetchImpl(currentUrl, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body,
      redirect: "manual",
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error("Google Apps Script webhook redirected too many times.");

    const location: string | null = response.headers.get("location");
    const redirectUrl: string | null = location ? trustedGoogleAppsScriptRedirectUrl(location, currentUrl) : null;
    if (!redirectUrl) throw new Error("Google Apps Script webhook redirected outside the allowed service.");
    currentUrl = redirectUrl;
    if ([301, 302, 303].includes(response.status)) {
      method = "GET";
      body = undefined;
    }
  }

  throw new Error("Google Apps Script webhook did not complete.");
}
