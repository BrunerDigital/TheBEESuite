import assert from "node:assert/strict";
import test from "node:test";
import {
  collectNotificationEmailRecipients,
  collectNotificationSmsRecipients,
  deliverNotificationExternalChannels,
  formatNotificationSmsBody,
} from "@/lib/notification-delivery";

test("notification delivery filters email and SMS recipients by user overrides and role defaults", () => {
  const preferences = [
    {
      userId: null,
      role: "PARENT_GUARDIAN",
      type: "messages",
      emailEnabled: false,
      smsEnabled: true,
      pushEnabled: true,
    },
    {
      userId: "guardian-1",
      role: null,
      type: "messages",
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
    },
    {
      userId: "guardian-2",
      role: null,
      type: "messages",
      emailEnabled: false,
      smsEnabled: true,
      pushEnabled: true,
    },
  ];
  const recipients = [
    { role: "PARENT_GUARDIAN", email: "billing@example.com", smsOptIn: false },
    { userId: "guardian-1", role: "PARENT_GUARDIAN", email: "one@example.com", phone: "+1 941 555 0101", smsOptIn: true },
    { userId: "guardian-2", role: "PARENT_GUARDIAN", email: "two@example.com", phone: "+1 941 555 0102", smsOptIn: true },
    { role: "PARENT_GUARDIAN", email: "pickup@example.com", phone: "+1 941 555 0103", smsOptIn: false },
  ];

  assert.deepEqual(
    collectNotificationEmailRecipients({ type: "messages", recipients, preferences }),
    ["one@example.com"],
  );
  assert.deepEqual(
    collectNotificationSmsRecipients({ type: "messages", recipients, preferences }),
    ["+1 941 555 0102"],
  );
});

test("notification delivery never selects reserved App Review identities for external channels", () => {
  const preferences = [{
    userId: null,
    role: "PARENT_GUARDIAN",
    type: "messages",
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: true,
  }];
  const recipients = [
    {
      userId: "app-review-parent",
      role: "PARENT_GUARDIAN",
      email: "app-review-parent@thebeesuite.io",
      phone: "+1 555 010 0424",
    },
    {
      userId: "ordinary-parent",
      role: "PARENT_GUARDIAN",
      email: "ordinary@example.com",
      phone: "+1 941 555 0102",
    },
  ];

  assert.deepEqual(
    collectNotificationEmailRecipients({ type: "messages", recipients, preferences }),
    ["ordinary@example.com"],
  );
  assert.deepEqual(
    collectNotificationSmsRecipients({ type: "messages", recipients, preferences }),
    ["+1 941 555 0102"],
  );
});

test("notification external delivery sends through enabled channels and records attempts", async () => {
  const emailInputs: unknown[] = [];
  const smsInputs: unknown[] = [];
  const emailRecords: unknown[] = [];
  const smsRecords: unknown[] = [];

  const summary = await deliverNotificationExternalChannels({
    tenantId: "tenant-1",
    centerId: "center-1",
    messageId: "message-1",
    dedupeKey: "message-1",
    type: "messages",
    title: "New parent message",
    body: "A parent sent a portal reply.",
    recipients: [
      {
        userId: "director-1",
        role: "CENTER_DIRECTOR",
        email: "director@example.com",
        phone: "+1 941 555 1111",
      },
    ],
    preferences: [
      {
        userId: null,
        role: "CENTER_DIRECTOR",
        type: "messages",
        emailEnabled: true,
        smsEnabled: true,
        pushEnabled: true,
      },
    ],
    emailPurpose: "communication_email",
    emailBrandKind: "miss-honeys-learning-center",
    fromName: "Miss Honey's Learning Center",
    smsPurpose: "communication_sms",
    disableEmailClickTracking: true,
    statusCallbackUrl: "https://example.com/api/twilio/status",
    providers: {
      permittedMessageRecipients: async (_tenantId, _messageId, _ids, copies) => copies,
      sendEmail: async (input) => {
        emailInputs.push(input);
        return { ok: true, configured: true, provider: "sendgrid", id: "email-1" };
      },
      sendSms: async (input) => {
        smsInputs.push(input);
        return { ok: false, configured: true, provider: "twilio", error: "Twilio returned 400." };
      },
      recordEmailDeliveryAttempt: async (input) => {
        emailRecords.push(input);
        return null as never;
      },
      recordCommunicationSmsDeliveryAttempt: async (input) => {
        smsRecords.push(input);
        return null as never;
      },
    },
  });

  assert.equal(summary.email.attempted, 1);
  assert.equal(summary.email.sent, 1);
  assert.equal(summary.sms.attempted, 1);
  assert.equal(summary.sms.sent, 0);
  assert.equal(summary.sms.error, "Twilio returned 400.");
  assert.equal(emailInputs.length, 1);
  assert.equal((emailInputs[0] as { disableClickTracking?: boolean }).disableClickTracking, true);
  assert.equal((emailInputs[0] as { fromName?: string }).fromName, "Miss Honey's Learning Center");
  assert.match((emailInputs[0] as { html: string }).html, /miss-honeys-learning-center\/logo-transparent\.png/);
  assert.doesNotMatch((emailInputs[0] as { html: string }).html, /src="https:\/\/thebeesuite\.io\/brand\/kid-city-usa\/logo-horizontal\.png"/);
  assert.equal(smsInputs.length, 1);
  assert.equal(emailRecords.length, 1);
  assert.equal(smsRecords.length, 1);
});

test("notification SMS copy is compacted for provider-safe delivery", () => {
  const body = formatNotificationSmsBody("Update", " ".repeat(4) + "x".repeat(800), 80);
  assert.equal(body.length, 80);
  assert.match(body, /\.\.\.$/);
});

test("external message copies recheck late blocks before email and each SMS provider call", async () => {
  for (const blockAt of ["before-email", "during-email", "during-first-sms"]) {
    let blocked = blockAt === "before-email";
    const emails: string[][] = [], sms: string[] = [], records: string[] = [];
    const summary = await deliverNotificationExternalChannels({
      tenantId: "tenant-1", messageId: "message-1", type: "messages", title: "Synthetic message", body: "Synthetic content",
      recipients: [
        { userId: "guardian-1", role: "PARENT_GUARDIAN", email: "one@example.test", phone: "+15555550101" },
        { userId: "guardian-2", role: "PARENT_GUARDIAN", phone: "+15555550102" },
      ],
      preferences: [{ userId: null, role: "PARENT_GUARDIAN", type: "messages", emailEnabled: true, smsEnabled: true, pushEnabled: true }],
      providers: {
        permittedMessageRecipients: async (tenantId, messageId, ids, copies) => {
          assert.equal(tenantId, "tenant-1"); assert.equal(messageId, "message-1"); assert.deepEqual(ids, ["guardian-1", "guardian-2"]);
          return blocked ? [] : copies;
        },
        sendEmail: async input => {
          emails.push(input.to as string[]); if (blockAt === "during-email") blocked = true;
          return { ok: true, configured: true, provider: "sendgrid" };
        },
        sendSms: async input => {
          sms.push(input.to); if (blockAt === "during-first-sms") blocked = true;
          return { ok: true, configured: true, provider: "twilio" };
        },
        recordEmailDeliveryAttempt: async () => { records.push("email"); return null as never; },
        recordCommunicationSmsDeliveryAttempt: async () => { records.push("sms"); return null as never; },
      },
    });
    assert.equal(emails.length, blockAt === "before-email" ? 0 : 1);
    assert.deepEqual(sms, blockAt === "during-first-sms" ? ["+15555550101"] : []);
    assert.equal(summary.email.attempted, emails.length); assert.equal(summary.sms.attempted, sms.length);
    assert.deepEqual(summary.sms.recipients, sms); assert.equal(records.length, emails.length + sms.length);
  }
});
