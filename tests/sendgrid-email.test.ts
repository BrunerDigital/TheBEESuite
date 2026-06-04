import assert from "node:assert/strict";
import test from "node:test";
import { sendEmail } from "@/lib/integrations";

test("SendGrid email helper sends private personalizations and captures provider id", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SENDGRID_API_KEY;
  const originalFrom = process.env.SENDGRID_FROM_EMAIL;
  type SendGridPayload = {
    personalizations: Array<{ to: Array<{ email: string }>; custom_args: Record<string, string> }>;
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
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.SENDGRID_FROM_EMAIL;
    else process.env.SENDGRID_FROM_EMAIL = originalFrom;
  }
});
