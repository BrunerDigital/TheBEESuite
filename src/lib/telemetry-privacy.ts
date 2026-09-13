// Browser-safe policy shared by SDK callbacks and first-party diagnostics.
const publicTelemetryPaths = new Set(["/", "/privacy", "/terms", "/eula", "/support", "/resources"]);
const diagnosticRoots = new Set(("data-readiness school-setup dashboard multi-location-dashboard center-dashboard fte-reports classroom-dashboard crm-leads family-detail child-profile enrollment-pipeline waitlist tours calendar messages announcements campaigns automations forms documents attendance daily-reports parent-media-review incident-reports staff billing-invoices terminal-store asset-hub corporate-billing payments compliance reputation analytics ai-command parent-portal teacher-portal agency-admin white-label team-permissions integrations billing-settings notifications audit-logs help workspace parents teachers directors executives login forgot-password reset-password registration onboarding app privacy terms eula support resources children families guardians incidents billing check-in payment-method-form stripe-reauthorization").split(" "));
const collectionSegments = new Set(["children", "families", "guardians", "incidents", "documents", "check-in"]);
const credentialSegments = new Set(["payment-method-form", "reset-password", "stripe-reauthorization"]);

function decoded(value: string): string | null {
  let result = value;
  try {
    for (let count = 0; count < 4 && result.includes("%"); count += 1) result = decodeURIComponent(result);
    return result.includes("%") || /[\\\u0000-\u001f\u007f]/.test(result) ? null : result;
  } catch { return null; }
}

function parsedWebUrl(value: string, base?: string) {
  if (!value || /[%\\\s]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

// Only reviewed static public information pages participate in third-party
// analytics. No account, school, family, credential or free-form URL is queued.
export function isPublicTelemetryLocation(value: string, base?: string) {
  const url = parsedWebUrl(value, base);
  return !!url && !url.search && !url.hash && publicTelemetryPaths.has(url.pathname);
}

export function filterTelemetryEvent<T extends { type: string; url: string; route?: string }>(
  event: T, currentUrl: string, referrer = "",
): T | null {
  const current = parsedWebUrl(currentUrl);
  const target = parsedWebUrl(event.url, currentUrl);
  if (!current || !target || target.origin !== current.origin ||
      !isPublicTelemetryLocation(currentUrl) || !isPublicTelemetryLocation(target.href) ||
      (referrer && !isPublicTelemetryLocation(referrer))) return null;
  if (event.type !== "pageview" && event.type !== "vital") return null;
  // Never forward arbitrary custom-event fields or the SDK's previous route.
  return { type: event.type, url: target.origin + target.pathname,
    ...(event.type === "vital" ? { route: target.pathname } : {}) } as T;
}

export function isCredentialDiagnosticPath(value: unknown) {
  if (typeof value !== "string") return true;
  const path = decoded(value);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return true;
  if (/[?#&](?:access_token|refresh_token|provider_token|provider_refresh_token|token(?:_hash)?|tokenHash|code)=/i.test(path)) return true;
  if (/[?&#=\/](?:payment-method-form|reset-password|stripe-reauthorization)(?:[\/?#&=]|$)/i.test(path)) return true;
  const parts = path.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  return parts.some(part => credentialSegments.has(part.toLowerCase())) ||
    (["parents", "parent-portal"].includes(parts[0]) && parts[1] === "setup");
}

export function normalizeDiagnosticPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = decoded(value);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  const parts = path.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  if (!parts.length) return "/";
  if (!diagnosticRoots.has(parts[0])) return "/:route";
  if (credentialSegments.has(parts[0])) return `/${parts[0]}/:id`;
  return "/" + parts.map((part, index) => {
    if (!index) return part;
    if (collectionSegments.has(parts[index - 1])) return ":id";
    return diagnosticRoots.has(part) || ["setup", "family"].includes(part) ? part : ":id";
  }).join("/").slice(0, 179);
}

export function decodeDiagnosticText(value: string) {
  // Redact before truncating, including copied encoded URLs. Malformed encoding
  // is not useful diagnostic evidence and must not expose a credential prefix.
  return decoded(value) ?? "[REDACTED]";
}
