import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildApiLogPayload,
  logOperationalError,
  redactForOperationalLog,
  redactHeadersForOperationalLog,
  redactSearchParams,
} from "../src/lib/request-response-logging";

test("operational log redaction removes nested PII and keeps safe status fields", () => {
  const redacted = redactForOperationalLog({
    action: "create",
    status: "pending",
    role: "TEACHER",
    email: "parent@example.com",
    childName: "Ava Smith",
    teacherNote: "Ava had a great day.",
    nested: {
      phone: "(555) 123-4567",
      token: "secret-token",
      count: 3,
    },
  }) as Record<string, unknown>;

  assert.equal(redacted.action, "create");
  assert.equal(redacted.status, "pending");
  assert.equal(redacted.role, "TEACHER");
  assert.equal(redacted.email, "[REDACTED]");
  assert.equal(redacted.childName, "[REDACTED]");
  assert.equal(redacted.teacherNote, "[REDACTED]");
  assert.deepEqual(redacted.nested, {
    phone: "[REDACTED]",
    token: "[REDACTED]",
    count: 3,
  });
});

test("operational log redaction summarizes arrays without exposing free-text values", () => {
  const redacted = redactForOperationalLog({
    statuses: ["open", "closed"],
    messages: ["Call mom", "Needs medication note"],
  }) as Record<string, { type: string; length: number; sample: unknown[] }>;

  assert.deepEqual(redacted.statuses, {
    type: "array",
    length: 2,
    sample: ["[REDACTED]", "[REDACTED]"],
  });
  assert.equal(redacted.messages, "[REDACTED]");
});

test("query and headers are redacted before logging", () => {
  const query = redactSearchParams(new URLSearchParams("page=2&email=parent@example.com&token=abc&status=open"));
  assert.deepEqual(query, {
    email: "[REDACTED]",
    page: "2",
    status: "open",
    token: "[REDACTED]",
  });

  const headers = new Headers({
    Authorization: "Bearer secret",
    Cookie: "bee_suite_session=abc",
    "Content-Type": "application/json",
    Origin: "https://thebeesuite.io",
  });

  assert.deepEqual(redactHeadersForOperationalLog(headers), {
    accept: null,
    contentType: "application/json",
    origin: "https://thebeesuite.io",
    referer: null,
    xRequestId: null,
    authorization: "[REDACTED]",
    cookie: "[REDACTED]",
  });
});

test("API log payload records status and redacted request and response bodies", async () => {
  const request = new Request("https://app.test/api/auth/login?email=parent@example.com&status=open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "82",
      "User-Agent": "Playwright",
      "X-Forwarded-For": "203.0.113.10",
      "X-Request-Id": "req_123",
    },
    body: JSON.stringify({
      email: "parent@example.com",
      password: "temporary-password",
      status: "pending",
    }),
  });
  const response = Response.json({
    ok: true,
    user: { email: "parent@example.com", role: "PARENT_GUARDIAN" },
  });

  const payload = await buildApiLogPayload(request, "POST", response, Date.now() - 12);

  assert.equal(payload.event, "api.request");
  assert.equal(payload.requestId, "req_123");
  assert.equal(payload.method, "POST");
  assert.equal(payload.path, "/api/auth/login");
  assert.equal(payload.response.status, 200);
  assert.equal(typeof payload.durationMs, "number");
  assert.equal(payload.userAgentHash?.length, 16);
  assert.equal(payload.ipHash?.length, 16);
  assert.deepEqual(payload.query, { email: "[REDACTED]", status: "open" });
  assert.deepEqual((payload.request.body as { value: unknown }).value, {
    email: "[REDACTED]",
    password: "[REDACTED]",
    status: "pending",
  });
  assert.deepEqual((payload.response.body as { value: unknown }).value, {
    ok: true,
    user: { email: "[REDACTED]", role: "PARENT_GUARDIAN" },
  });
});

test("large or unsupported bodies are summarized instead of read", async () => {
  const request = new Request("https://app.test/api/documents/1/upload", {
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data",
      "Content-Length": "200000",
    },
    body: "file-placeholder",
  });
  const response = new Response("ok", {
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "200000",
    },
  });

  const payload = await buildApiLogPayload(request, "POST", response, Date.now());

  assert.deepEqual(payload.request.body, {
    omitted: "unsupported_content_type",
    contentType: "multipart/form-data",
    contentLength: 200000,
  });
  assert.deepEqual(payload.response.body, {
    omitted: "too_large",
    contentType: "text/plain",
    contentLength: 200000,
  });
});

test("SendGrid webhook logs redact signatures, recipients, ids, and provider failure text", async () => {
  const request = new Request("https://app.test/api/sendgrid/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Twilio-Email-Event-Webhook-Signature": "secret-signature",
      "X-Twilio-Email-Event-Webhook-Timestamp": "1784556000",
    },
    body: JSON.stringify([{
      email: "parent@example.com",
      event: "bounce",
      sg_event_id: "event-secret",
      sg_message_id: "message-secret",
      reason: "Mailbox for parent@example.com does not exist",
    }]),
  });
  const payload = await buildApiLogPayload(request, "POST", Response.json({ ok: false, status: "failed" }), Date.now());
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("parent@example.com"), false);
  assert.equal(serialized.includes("event-secret"), false);
  assert.equal(serialized.includes("message-secret"), false);
  assert.equal(serialized.includes("secret-signature"), false);
  assert.equal(serialized.includes("Mailbox"), false);
  assert.equal(serialized.includes('"event":"bounce"'), true);
});

test("operational error logs redact messages and metadata", () => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (value?: unknown) => {
    lines.push(String(value));
  };

  try {
    logOperationalError("auth.login.failed", new Error("parent@example.com token leaked"), {
      email: "parent@example.com",
      status: 503,
      provider: "supabase",
    });
  } finally {
    console.error = original;
  }

  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0]) as {
    event: string;
    context: string;
    message: string;
    metadata: Record<string, unknown>;
  };
  assert.equal(payload.event, "operational.error");
  assert.equal(payload.context, "auth.login.failed");
  assert.equal(payload.message, "[REDACTED]");
  assert.deepEqual(payload.metadata, {
    email: "[REDACTED]",
    status: 503,
    provider: "supabase",
  });
  assert.equal(lines[0].includes("parent@example.com"), false);
});
