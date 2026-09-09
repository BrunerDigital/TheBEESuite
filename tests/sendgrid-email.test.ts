import assert from "node:assert/strict";
import test from "node:test";
import { APP_REVIEW_PARENT_CONTACT, APP_REVIEW_TEACHER_CONTACT } from "@/lib/app-review-targeting";
import {
  externalProviderEmail,
  externalProviderEmails,
  externalProviderMetadata,
  sendEmail,
} from "@/lib/integrations";

test("external provider email guard rejects reserved App Review identities", () => {
  assert.equal(externalProviderEmail(APP_REVIEW_PARENT_CONTACT.email.toUpperCase()), null);
  assert.equal(externalProviderEmail(APP_REVIEW_TEACHER_CONTACT.email), null);
  assert.equal(externalProviderEmail(" ordinary-parent@example.com "), "ordinary-parent@example.com");
  assert.equal(externalProviderEmail("not-an-email"), null);
  assert.deepEqual(
    externalProviderEmails([
      APP_REVIEW_PARENT_CONTACT.email,
      " ordinary-parent@example.com ",
      APP_REVIEW_TEACHER_CONTACT.email,
      "ORDINARY-PARENT@example.com",
    ]),
    ["ordinary-parent@example.com"],
  );
  assert.deepEqual(externalProviderMetadata({
    familyId: "family-1",
    recipientEmail: APP_REVIEW_PARENT_CONTACT.email,
    blank: null,
  }), { familyId: "family-1" });
});

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
    assert.equal(result.effectiveRecipientCount, 2);
    assert.equal(result.suppressedRecipientCount, 0);
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

test("SendGrid common boundary suppresses reserved App Review recipients", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SENDGRID_API_KEY;
  const originalFrom = process.env.SENDGRID_FROM_EMAIL;
  const sentRecipients: string[][] = [];
  const sentReplyTos: Array<string | null> = [];

  process.env.SENDGRID_API_KEY = "SG.test";
  process.env.SENDGRID_FROM_EMAIL = "noreply@thebeesuite.io";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as {
      personalizations: Array<{ to: Array<{ email: string }> }>;
      reply_to?: { email: string };
    };
    sentRecipients.push(payload.personalizations.flatMap((item) => item.to.map((recipient) => recipient.email)));
    sentReplyTos.push(payload.reply_to?.email ?? null);
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  try {
    const mixed = await sendEmail({
      to: [APP_REVIEW_PARENT_CONTACT.email, "ordinary-parent@example.com", APP_REVIEW_TEACHER_CONTACT.email],
      subject: "School update",
      text: "Please review the portal.",
      replyTo: APP_REVIEW_PARENT_CONTACT.email,
    });
    assert.equal(mixed.ok, true);
    assert.equal(mixed.effectiveRecipientCount, 1);
    assert.equal(mixed.suppressedRecipientCount, 2);
    assert.deepEqual(sentRecipients, [["ordinary-parent@example.com"]]);
    assert.deepEqual(sentReplyTos, [null]);

    const reservedOnly = await sendEmail({
      to: [APP_REVIEW_PARENT_CONTACT.email, APP_REVIEW_TEACHER_CONTACT.email],
      subject: "Review-only update",
      text: "This must stay inside the portal.",
    });
    assert.deepEqual(reservedOnly, {
      ok: false,
      configured: true,
      provider: "sendgrid",
      skipped: true,
      effectiveRecipientCount: 0,
      suppressedRecipientCount: 2,
      error: "Reserved App Review recipients are suppressed.",
    });
    assert.deepEqual(sentRecipients, [["ordinary-parent@example.com"]]);
    assert.deepEqual(sentReplyTos, [null]);
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
  const originalForcePlatform = process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS;
  const authorizations: string[] = [];
  const fromEmails: string[] = [];

  process.env.SENDGRID_API_KEY = "SG.platform";
  process.env.SENDGRID_FROM_EMAIL = "noreply@thebeesuite.io";
  process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK = "true";
  delete process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS;
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
    if (originalForcePlatform === undefined) delete process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS;
    else process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS = originalForcePlatform;
  }
});

test("SendGrid email helper forces shared platform credentials for every tenant", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SENDGRID_API_KEY;
  const originalFrom = process.env.SENDGRID_FROM_EMAIL;
  const originalForcePlatform = process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS;
  const authorizations: string[] = [];
  const fromEmails: string[] = [];

  process.env.SENDGRID_API_KEY = "SG.platform";
  process.env.SENDGRID_FROM_EMAIL = "mrbee@thebeesuite.io";
  process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS = "true";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    authorizations.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""));
    const payload = JSON.parse(String(init?.body)) as { from?: { email?: string } };
    fromEmails.push(payload.from?.email ?? "");
    return new Response(null, {
      status: 202,
      headers: { "x-message-id": "shared-platform-message" },
    });
  }) as typeof fetch;

  try {
    const result = await sendEmail({
      to: ["parent@example.com"],
      subject: "Parent portal invitation",
      text: "Welcome to The BEE Suite.",
      tenantId: "tenant-1",
      credentials: {
        SENDGRID_API_KEY: "SG.tenant",
        SENDGRID_FROM_EMAIL: "tenant@example.com",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.id, "shared-platform-message");
    assert.deepEqual(authorizations, ["Bearer SG.platform"]);
    assert.deepEqual(fromEmails, ["mrbee@thebeesuite.io"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.SENDGRID_FROM_EMAIL;
    else process.env.SENDGRID_FROM_EMAIL = originalFrom;
    if (originalForcePlatform === undefined) delete process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS;
    else process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS = originalForcePlatform;
  }
});

test("SendGrid tenant credential failures fail closed unless platform fallback is explicitly approved", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SENDGRID_API_KEY;
  const originalFrom = process.env.SENDGRID_FROM_EMAIL;
  const originalFallback = process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK;
  const originalForcePlatform = process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS;
  const authorizations: string[] = [];
  process.env.SENDGRID_API_KEY = "SG.platform";
  process.env.SENDGRID_FROM_EMAIL = "noreply@thebeesuite.io";
  delete process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK;
  delete process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS;
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
    if (originalForcePlatform === undefined) delete process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS; else process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS = originalForcePlatform;
  }
});
