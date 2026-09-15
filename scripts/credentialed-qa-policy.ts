/** Network boundary for read-only credentialed role verification. */
export function credentialedQaBaseUrl(value: string, productionOptIn: boolean) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const canonical = ["thebeesuite.io", "www.thebeesuite.io"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("QA base URL must be an origin without credentials, path, query, or fragment.");
  }
  if (!local && (!canonical || url.protocol !== "https:" || url.port)) {
    throw new Error("QA credentials may only be sent to the canonical HTTPS origin or localhost.");
  }
  if (local && !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid local QA protocol.");
  if (canonical && !productionOptIn) throw new Error("Set ALLOW_SYNTHETIC_ROLE_QA_PRODUCTION_LOGIN=true for production QA.");
  if (canonical) url.hostname = "thebeesuite.io";
  return url.origin;
}

export function credentialedQaRequestAllowed(input: {
  baseUrl: string; url: string; method: string; body: string | null;
  resourceType: string; email: string; password: string;
}) {
  const url = new URL(input.url);
  const sameOrigin = url.origin === new URL(input.baseUrl).origin;
  const method = input.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    // External assets can render; authenticated navigation cannot leave the app.
    return sameOrigin || (["image", "stylesheet", "font", "media"].includes(input.resourceType) && method !== "OPTIONS");
  }
  if (!sameOrigin || method !== "POST" || url.search) return false;
  let body: unknown;
  try { body = JSON.parse(input.body ?? "null"); } catch { return false; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const payload = body as Record<string, unknown>;
  if (url.pathname === "/api/auth/login") {
    return payload.email === input.email && payload.password === input.password
      && Object.keys(payload).every((key) => ["email", "password", "next", "loginPortal", "appMode", "deviceLabel"].includes(key))
      && (payload.next === undefined || ["/dashboard", "/parent-portal", "/teacher-portal"].includes(String(payload.next)))
      && (payload.loginPortal === undefined || ["parents", "teachers", "directors", "executives"].includes(String(payload.loginPortal)))
      && (payload.deviceLabel === undefined || typeof payload.deviceLabel === "string");
  }
  return url.pathname === "/api/device-sessions"
    && payload.action === "heartbeat" && Object.keys(payload).length === 1;
}
