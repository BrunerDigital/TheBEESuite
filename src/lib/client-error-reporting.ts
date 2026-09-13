import { decodeDiagnosticText, isCredentialDiagnosticPath, normalizeDiagnosticPath } from "./telemetry-privacy";

const REDACTED = "[REDACTED]";
const MAX_FIELD_LENGTH = 160;
const MAX_STACK_LENGTH = 1_500;
const MAX_METADATA_KEYS = 20;

const piiPatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\+?\d[\d\s().-]{7,}\d/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{13,19}\b/g,
];

const diagnosticErrorTypes = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError", "ChunkLoadError", "AbortError", "NetworkError", "ClientError"]);
const numericMetadataKeys = new Set(["line", "column", "attempt", "statusCode"]);
const diagnosticStatuses = new Set(["failed", "pending", "loading", "ready", "success", "error", "offline"]);

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
  let cleaned = typeof value === "string" ? decodeDiagnosticText(value.replace(/\s+/g, " ").trim()).replace(/\s+/g, " ").trim() : "";
  if (!cleaned) return "";

  // Never keep an arbitrary URL (including a copied relative/nested recovery
  // URL), credential assignment, or two/three-part signed bearer in free text.
  cleaned = cleaned.replace(/(?:https?:\/\/|\/\/|\/)[^\s<>"']+/gi, "[URL]");
  // Quoted JSON, Basic/Bearer schemes and values containing spaces cannot be
  // safely bounded by a word regex. Suppress that entire free-text field.
  if (/\b(?:token(?:_hash)?|tokenHash|access_token|refresh_token|provider_token|provider_refresh_token|password|code|secret|authorization)["']?\s*[:=]|\b(?:Bearer|Basic)\s+\S/i.test(cleaned)) return REDACTED;
  cleaned = cleaned.replace(/\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]{6,})?\b/g, REDACTED);
  for (const pattern of piiPatterns) {
    cleaned = cleaned.replace(pattern, REDACTED);
  }

  return cleaned.slice(0, maxLength);
}

function normalizeMetadata(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, MAX_METADATA_KEYS)) {
    // Keys are also attacker-controlled. Keep only documented diagnostic fields.
    if (numericMetadataKeys.has(key) && typeof value === "number" && Number.isFinite(value)) {
      metadata[key] = value;
    } else if (key === "status" && typeof value === "string" && diagnosticStatuses.has(value)) {
      metadata.status = value;
    } else if (key === "digest" && typeof value === "string" && /^\d{1,20}$/.test(value)) {
      metadata.digest = value;
    }
  }
  return Object.keys(metadata).length ? metadata : null;
}

export function normalizeClientErrorReportPayload(input: unknown): NormalizedClientErrorReport {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const requestedSource = cleanString(payload.source, 60);
  const source = allowedSources.has(requestedSource) ? requestedSource : "manual";
  const severity = payload.severity === "warning" ? "warning" : "error";
  const suppressed = isCredentialDiagnosticPath(payload.path);
  const errorType = !suppressed && typeof payload.errorType === "string" && diagnosticErrorTypes.has(payload.errorType) ? payload.errorType : "ClientError";
  const message = suppressed ? null : redactClientDiagnosticText(payload.message, MAX_FIELD_LENGTH) || null;
  const stackSample = suppressed ? null : redactClientDiagnosticText(payload.stackSample, MAX_STACK_LENGTH) || null;
  const componentStack = suppressed ? null : redactClientDiagnosticText(payload.componentStack, MAX_STACK_LENGTH) || null;

  return {
    source,
    severity,
    errorType,
    message,
    stackSample,
    componentStack,
    path: normalizeDiagnosticPath(payload.path),
    metadata: suppressed ? null : normalizeMetadata(payload.metadata),
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
