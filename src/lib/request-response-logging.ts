import { createHash, randomUUID } from "node:crypto";

const REDACTED = "[REDACTED]";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_STRING_LENGTH = 120;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 50;

const sensitiveKeyPattern =
  /(password|passcode|pin|token|secret|authorization|cookie|session|signature|credential|api[-_]?key|ssn|social|dob|birth|email|phone|address|name|guardian|parent|child|student|family|note|message|description|caption|medical|allerg|custody|incident|payment|card|bank|routing|account|stripe|twilio|sendgrid|supabase|private|key)/i;

const safeValueKeys = new Set([
  "action",
  "active",
  "amount",
  "attempt",
  "category",
  "channel",
  "checked",
  "completed",
  "count",
  "enabled",
  "event",
  "filter",
  "limit",
  "method",
  "mode",
  "offset",
  "ok",
  "page",
  "priority",
  "provider",
  "role",
  "scope",
  "selected",
  "sent",
  "sort",
  "stage",
  "status",
  "step",
  "type",
]);

const piiValuePattern =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\+?\d[\d\s().-]{7,}\d)|(\b\d{3}-\d{2}-\d{4}\b)|(\b\d{13,19}\b)/i;

type RedactionOptions = {
  parentKey?: string;
  depth?: number;
};

type BodySample =
  | { omitted: "empty" | "unsupported_content_type" | "too_large" | "unknown_size" | "unreadable"; contentType?: string; contentLength?: number | null }
  | { contentType: string; value: unknown };

type LogPayload = {
  event: "api.request";
  requestId: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  request: {
    contentType: string | null;
    contentLength: number | null;
    headers: Record<string, unknown>;
    body: BodySample;
  };
  response: {
    status: number;
    contentType: string | null;
    contentLength: number | null;
    body: BodySample;
  };
  durationMs: number;
  userAgentHash: string | null;
  ipHash: string | null;
};

type ApiRouteHandler = (...args: never[]) => Response | Promise<Response>;

function normalizeKey(value: string | undefined) {
  return String(value || "").trim();
}

function shouldRedactKey(key: string | undefined) {
  return sensitiveKeyPattern.test(normalizeKey(key));
}

function shouldRedactValue(value: string) {
  return piiValuePattern.test(value);
}

function isSafeScalarKey(key: string | undefined) {
  return safeValueKeys.has(normalizeKey(key).toLowerCase());
}

function compactString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function hashForLog(value: string | null | undefined) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  return createHash("sha256").update(cleaned).digest("hex").slice(0, 16);
}

function cleanHeaderValue(headers: Headers, key: string) {
  const value = headers.get(key);
  if (!value) return null;
  if (shouldRedactKey(key) || shouldRedactValue(value)) return REDACTED;
  return compactString(value);
}

export function redactForOperationalLog(value: unknown, options: RedactionOptions = {}): unknown {
  const depth = options.depth ?? 0;
  const parentKey = options.parentKey;

  if (value === null || value === undefined) return value;
  if (shouldRedactKey(parentKey)) return REDACTED;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (!isSafeScalarKey(parentKey) || shouldRedactValue(value)) return REDACTED;
    return compactString(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (depth >= 5) return "[MAX_DEPTH]";
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactForOperationalLog(item, { parentKey, depth: depth + 1 })),
    };
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    for (const [key, item] of entries) {
      output[key] = redactForOperationalLog(item, { parentKey: key, depth: depth + 1 });
    }
    const omitted = Object.keys(value as Record<string, unknown>).length - entries.length;
    if (omitted > 0) output.__omittedKeys = omitted;
    return output;
  }
  return REDACTED;
}

export function redactSearchParams(searchParams: URLSearchParams) {
  const output: Record<string, unknown> = {};
  for (const key of Array.from(new Set(searchParams.keys())).sort()) {
    const values = searchParams.getAll(key);
    output[key] = values.length > 1
      ? redactForOperationalLog(values, { parentKey: key })
      : redactForOperationalLog(values[0], { parentKey: key });
  }
  return output;
}

export function redactHeadersForOperationalLog(headers: Headers) {
  return {
    accept: cleanHeaderValue(headers, "accept"),
    contentType: cleanHeaderValue(headers, "content-type"),
    origin: cleanHeaderValue(headers, "origin"),
    referer: cleanHeaderValue(headers, "referer"),
    xRequestId: cleanHeaderValue(headers, "x-request-id"),
    authorization: headers.has("authorization") ? REDACTED : null,
    cookie: headers.has("cookie") ? REDACTED : null,
  };
}

function contentLength(headers: Headers) {
  const raw = headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function contentType(headers: Headers) {
  return headers.get("content-type");
}

function canReadBody(headers: Headers, options: { allowUnknownSize?: boolean } = {}) {
  const type = contentType(headers);
  const length = contentLength(headers);
  if (!type) return { ok: false as const, reason: "empty" as const };
  if (!/application\/json|text\/plain|application\/x-www-form-urlencoded/i.test(type)) {
    return { ok: false as const, reason: "unsupported_content_type" as const };
  }
  if (length === null && !options.allowUnknownSize) return { ok: false as const, reason: "unknown_size" as const };
  if (length === 0) return { ok: false as const, reason: "empty" as const };
  if (length !== null && length > MAX_BODY_BYTES) return { ok: false as const, reason: "too_large" as const };
  return { ok: true as const, type, length };
}

async function sampleBody(readable: Request | Response, options: { allowUnknownSize?: boolean } = {}): Promise<BodySample> {
  const headers = readable.headers;
  const bodyGuard = canReadBody(headers, options);
  if (!bodyGuard.ok) {
    return {
      omitted: bodyGuard.reason,
      contentType: contentType(headers) ?? undefined,
      contentLength: contentLength(headers),
    };
  }

  try {
    const text = await readable.clone().text();
    if (!text.trim()) return { omitted: "empty", contentType: bodyGuard.type, contentLength: bodyGuard.length };
    if (text.length > MAX_BODY_BYTES) {
      return { omitted: "too_large", contentType: bodyGuard.type, contentLength: bodyGuard.length };
    }
    if (/application\/json/i.test(bodyGuard.type)) {
      return { contentType: bodyGuard.type, value: redactForOperationalLog(JSON.parse(text)) };
    }
    if (/application\/x-www-form-urlencoded/i.test(bodyGuard.type)) {
      return { contentType: bodyGuard.type, value: redactSearchParams(new URLSearchParams(text)) };
    }
    return { contentType: bodyGuard.type, value: redactForOperationalLog(text, { parentKey: "body" }) };
  } catch {
    return { omitted: "unreadable", contentType: bodyGuard.type, contentLength: bodyGuard.length };
  }
}

function requestFromArgs(args: unknown[]) {
  return args.find((arg): arg is Request => arg instanceof Request) ?? null;
}

function statusFromError(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return 500;
}

function logPayload(payload: LogPayload) {
  if (process.env.REQUEST_RESPONSE_LOGGING === "off") return;
  console.info(JSON.stringify(payload));
}

function logErrorPayload(payload: Omit<LogPayload, "response">, error: unknown, durationMs: number) {
  logPayload({
    ...payload,
    durationMs,
    response: {
      status: statusFromError(error),
      contentType: null,
      contentLength: null,
      body: {
        contentType: "application/json",
        value: {
          errorType: error instanceof Error ? error.name : "UnknownError",
          message: REDACTED,
        },
      },
    },
  });
}

export function logOperationalError(context: string, error: unknown, metadata: Record<string, unknown> = {}) {
  if (process.env.OPERATIONAL_ERROR_LOGGING === "off") return;

  console.error(
    JSON.stringify({
      event: "operational.error",
      context: compactString(context),
      errorType: error instanceof Error ? error.name : typeof error,
      status: statusFromError(error),
      message: REDACTED,
      metadata: redactForOperationalLog(metadata),
    }),
  );
}

export async function buildApiLogPayload(request: Request, method: string, response: Response, startedAt: number): Promise<LogPayload> {
  const url = new URL(request.url);
  return {
    event: "api.request",
    requestId: request.headers.get("x-request-id") || randomUUID(),
    method,
    path: url.pathname,
    query: redactSearchParams(url.searchParams),
    request: {
      contentType: contentType(request.headers),
      contentLength: contentLength(request.headers),
      headers: redactHeadersForOperationalLog(request.headers),
      body: await sampleBody(request),
    },
    response: {
      status: response.status,
      contentType: contentType(response.headers),
      contentLength: contentLength(response.headers),
      body: await sampleBody(response, { allowUnknownSize: true }),
    },
    durationMs: Date.now() - startedAt,
    userAgentHash: hashForLog(request.headers.get("user-agent")),
    ipHash: hashForLog(request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip")),
  };
}

export function withApiLogging<T extends ApiRouteHandler>(method: string, handler: T): T {
  return (async (...args: Parameters<T>) => {
    const startedAt = Date.now();
    const request = requestFromArgs(args);

    try {
      const response = await handler(...args);
      if (request) logPayload(await buildApiLogPayload(request, method, response, startedAt));
      return response;
    } catch (error) {
      if (request) {
        const url = new URL(request.url);
        const basePayload: Omit<LogPayload, "response"> = {
          event: "api.request",
          requestId: request.headers.get("x-request-id") || randomUUID(),
          method,
          path: url.pathname,
          query: redactSearchParams(url.searchParams),
          request: {
            contentType: contentType(request.headers),
            contentLength: contentLength(request.headers),
            headers: redactHeadersForOperationalLog(request.headers),
            body: await sampleBody(request),
          },
          durationMs: Date.now() - startedAt,
          userAgentHash: hashForLog(request.headers.get("user-agent")),
          ipHash: hashForLog(request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip")),
        };
        logErrorPayload(basePayload, error, Date.now() - startedAt);
      }
      throw error;
    }
  }) as T;
}
