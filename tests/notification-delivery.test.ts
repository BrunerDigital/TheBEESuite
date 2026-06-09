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
    smsPurpose: "communication_sms",
    statusCallbackUrl: "https://example.com/api/twilio/status",
    providers: {
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
  assert.equal(smsInputs.length, 1);
  assert.equal(emailRecords.length, 1);
  assert.equal(smsRecords.length, 1);
});

test("notification SMS copy is compacted for provider-safe delivery", () => {
  const body = formatNotificationSmsBody("Update", " ".repeat(4) + "x".repeat(800), 80);
  assert.equal(body.length, 80);
  assert.match(body, /\.\.\.$/);
});
