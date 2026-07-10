const REDACTED = "[REDACTED]";
const MAX_FIELD_LENGTH = 160;
const MAX_STACK_LENGTH = 1_500;
const MAX_PATH_LENGTH = 180;
const MAX_METADATA_KEYS = 20;

const piiPatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\+?\d[\d\s().-]{7,}\d/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{13,19}\b/g,
];

const sensitivePathSegments = new Set([
  "children",
  "families",
  "guardians",
  "incidents",
  "documents",
  "billing",
  "payment-method-form",
  "parent-portal",
]);

const allowedSources = new Set([
  "window.error",
  "window.unhandledrejection",
  "react.error_boundary",
  "react.global_error",
  "manual",
]);

export type NormalizedClientErrorReport = {
  source: string;
  errorType: string;
  severity: "error" | "warning";
  message: string | null;
  stackSample: string | null;
  componentStack: string | null;
  path: string | null;
  metadata: Record<string, string | number | boolean> | null;
};

function cleanString(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function redactClientDiagnosticText(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  let cleaned = cleanString(value, maxLength);
  if (!cleaned) return "";

  for (const pattern of piiPatterns) {
    cleaned = cleaned.replace(pattern, REDACTED);
  }

  return cleaned;
}

function normalizePath(value: unknown) {
  const raw = cleanString(value, MAX_PATH_LENGTH);
  if (!raw || !raw.startsWith("/")) return null;

  const pathname = raw.split(/[?#]/)[0] || "/";
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return "/";

  const sanitized: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index];
    const previous = sanitized[sanitized.length - 1];
    const looksLikeIdentifier = /^[a-z0-9_-]{12,}$/i.test(segment) || /^[0-9]+$/.test(segment);
    sanitized.push(previous && sensitivePathSegments.has(previous) && looksLikeIdentifier ? ":id" : segment);
  }

  return `/${sanitized.join("/")}`.slice(0, MAX_PATH_LENGTH);
}

function normalizeMetadata(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, MAX_METADATA_KEYS)) {
    const cleanKey = cleanString(key, 50);
    if (!cleanKey) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      metadata[cleanKey] = value;
    } else if (typeof value === "string") {
      metadata[cleanKey] = redactClientDiagnosticText(value, MAX_FIELD_LENGTH);
    }
  }
  return Object.keys(metadata).length ? metadata : null;
}

export function normalizeClientErrorReportPayload(input: unknown): NormalizedClientErrorReport {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const requestedSource = cleanString(payload.source, 60);
  const source = allowedSources.has(requestedSource) ? requestedSource : "manual";
  const severity = payload.severity === "warning" ? "warning" : "error";
  const errorType = redactClientDiagnosticText(payload.errorType, 80) || "ClientError";
  const message = redactClientDiagnosticText(payload.message, MAX_FIELD_LENGTH) || null;
  const stackSample = redactClientDiagnosticText(payload.stackSample, MAX_STACK_LENGTH) || null;
  const componentStack = redactClientDiagnosticText(payload.componentStack, MAX_STACK_LENGTH) || null;

  return {
    source,
    severity,
    errorType,
    message,
    stackSample,
    componentStack,
    path: normalizePath(payload.path),
    metadata: normalizeMetadata(payload.metadata),
  };
}

export function clientErrorFingerprintParts(report: NormalizedClientErrorReport) {
  return [
    report.source,
    report.errorType,
    report.message || "",
    report.path || "",
    report.stackSample?.split(" ").slice(0, 24).join(" ") || "",
  ];
}
