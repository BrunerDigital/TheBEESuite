import assert from "node:assert/strict";
import test from "node:test";
import { sendEmail } from "@/lib/integrations";

test("SendGrid email helper sends private personalizations and captures provider id", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SENDGRID_API_KEY;
  const originalFrom = process.env.SENDGRID_FROM_EMAIL;
  type SendGridPayload = {
    personalizations: Array<{ to: Array<{ email: string }>; custom_args: Record<string, string> }>;
    tracking_settings?: {
      click_tracking?: { enable: boolean; enable_text?: boolean };
      open_tracking?: { enable: boolean };
      subscription_tracking?: { enable: boolean };
    };
    attachments?: Array<{ content: string; filename: string; type: string; disposition: string }>;
  };
  const capture: { payload?: SendGridPayload } = {};

  process.env.SENDGRID_API_KEY = "SG.test";
  process.env.SENDGRID_FROM_EMAIL = "noreply@thebeesuite.io";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capture.payload = JSON.parse(String(init?.body)) as SendGridPayload;
    return new Response(null, {
      status: 202,
      headers: { "x-message-id": "sendgrid-message-123" },
    });
  }) as typeof fetch;

  try {
    const result = await sendEmail({
      to: ["parent@example.com", "director@example.com", "parent@example.com"],
      subject: "Classroom update",
      text: "Today went well.",
      categories: ["communication_email"],
      customArgs: { messageId: "msg_1", count: 2, empty: null },
      disableClickTracking: true,
      attachments: [{
        filename: "tour-packet.pdf",
        content: Buffer.from("PDF placeholder").toString("base64"),
        type: "application/pdf",
      }],
    });

    assert.equal(result.ok, true);
    assert.equal(result.id, "sendgrid-message-123");
    const personalizations = capture.payload?.personalizations;
    assert.ok(personalizations);
    assert.equal(personalizations.length, 2);
    assert.deepEqual(personalizations.map((item) => item.to), [
      [{ email: "parent@example.com" }],
      [{ email: "director@example.com" }],
    ]);
    assert.deepEqual(personalizations[0].custom_args, { messageId: "msg_1", count: "2" });
    assert.deepEqual(capture.payload?.tracking_settings, {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
      subscription_tracking: { enable: false },
    });
    assert.deepEqual(capture.payload?.attachments, [{
      content: Buffer.from("PDF placeholder").toString("base64"),
      filename: "tour-packet.pdf",
      type: "application/pdf",
      disposition: "attachment",
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.SENDGRID_FROM_EMAIL;
    else process.env.SENDGRID_FROM_EMAIL = originalFrom;
  }
});

test("SendGrid email helper falls back to platform credentials when tenant key is rejected", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SENDGRID_API_KEY;
  const originalFrom = process.env.SENDGRID_FROM_EMAIL;
  const originalFallback = process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK;
  const authorizations: string[] = [];
  const fromEmails: string[] = [];

  process.env.SENDGRID_API_KEY = "SG.platform";
  process.env.SENDGRID_FROM_EMAIL = "noreply@thebeesuite.io";
  process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK = "true";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    authorizations.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""));
    const payload = JSON.parse(String(init?.body)) as { from?: { email?: string } };
    fromEmails.push(payload.from?.email ?? "");
    if (authorizations.length === 1) {
      return new Response(JSON.stringify({ errors: [{ message: "unauthorized" }] }), { status: 401 });
    }
    return new Response(null, {
      status: 202,
      headers: { "x-message-id": "platform-fallback-message" },
    });
  }) as typeof fetch;

  try {
    const result = await sendEmail({
      to: ["parent@example.com"],
      subject: "Payment setup",
      text: "Please set up payment.",
      credentials: {
        SENDGRID_API_KEY: "SG.tenant-stale",
        SENDGRID_FROM_EMAIL: "stale@example.com",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.id, "platform-fallback-message");
    assert.deepEqual(authorizations, ["Bearer SG.tenant-stale", "Bearer SG.platform"]);
    assert.deepEqual(fromEmails, ["stale@example.com", "noreply@thebeesuite.io"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.SENDGRID_FROM_EMAIL;
    else process.env.SENDGRID_FROM_EMAIL = originalFrom;
    if (originalFallback === undefined) delete process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK;
    else process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK = originalFallback;
  }
});

test("SendGrid tenant credential failures fail closed unless platform fallback is explicitly approved", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SENDGRID_API_KEY;
  const originalFrom = process.env.SENDGRID_FROM_EMAIL;
  const originalFallback = process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK;
  const authorizations: string[] = [];
  process.env.SENDGRID_API_KEY = "SG.platform";
  process.env.SENDGRID_FROM_EMAIL = "noreply@thebeesuite.io";
  delete process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    authorizations.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""));
    return new Response(null, { status: 401 });
  }) as typeof fetch;
  try {
    const result = await sendEmail({
      to: ["parent@example.com"], subject: "Payment setup", text: "Please set up payment.",
      credentials: { SENDGRID_API_KEY: "SG.tenant-stale", SENDGRID_FROM_EMAIL: "school@example.com" },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(authorizations, ["Bearer SG.tenant-stale"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.SENDGRID_API_KEY; else process.env.SENDGRID_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.SENDGRID_FROM_EMAIL; else process.env.SENDGRID_FROM_EMAIL = originalFrom;
    if (originalFallback === undefined) delete process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK; else process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK = originalFallback;
  }
});
