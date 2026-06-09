import {
  recordCommunicationSmsDeliveryAttempt,
  recordEmailDeliveryAttempt,
  type IntegrationDeliveryPurpose,
} from "@/lib/integration-deliveries";
import { sendEmail, sendSms, uniqueEmails, type IntegrationSendResult } from "@/lib/integrations";
import { notificationDedupeKey } from "@/lib/notification-policy";
import {
  resolveNotificationPreferenceChannels,
  type NotificationPreferenceRecord,
} from "@/lib/notification-preferences";
import { uniqueSmsRecipients } from "@/lib/twilio-messaging";

export type NotificationDeliveryRecipient = {
  userId?: string | null;
  role: string;
  email?: string | null;
  phone?: string | null;
  emailOptIn?: boolean;
  smsOptIn?: boolean;
};

export type NotificationExternalDeliveryInput = {
  tenantId: string;
  centerId?: string | null;
  leadId?: string | null;
  messageId?: string | null;
  dedupeKey?: string | null;
  type: string;
  title: string;
  body: string;
  recipients: NotificationDeliveryRecipient[];
  preferences: NotificationPreferenceRecord[];
  emailRequested?: boolean;
  smsRequested?: boolean;
  replyTo?: string | null;
  fromName?: string;
  statusCallbackUrl?: string | null;
  emailPurpose?: Extract<IntegrationDeliveryPurpose, "communication_email" | "notification_email">;
  smsPurpose?: Extract<IntegrationDeliveryPurpose, "communication_sms" | "notification_sms">;
  metadata?: Record<string, unknown>;
  providers?: Partial<NotificationDeliveryProviders>;
};

export type NotificationDeliveryProviders = {
  sendEmail: (input: Parameters<typeof sendEmail>[0]) => Promise<IntegrationSendResult>;
  sendSms: (input: Parameters<typeof sendSms>[0]) => Promise<IntegrationSendResult>;
  recordEmailDeliveryAttempt: typeof recordEmailDeliveryAttempt;
  recordCommunicationSmsDeliveryAttempt: typeof recordCommunicationSmsDeliveryAttempt;
};

export type NotificationDeliverySummary = {
  email: {
    requested: boolean;
    attempted: number;
    sent: number;
    configured: boolean;
    provider: "sendgrid";
    error: string | null;
    recipients: string[];
  };
  sms: {
    requested: boolean;
    attempted: number;
    sent: number;
    configured: boolean;
    provider: "twilio";
    error: string | null;
    recipients: string[];
    results: Array<{
      ok: boolean;
      configured: boolean;
      provider: "twilio";
      id: string | null;
      error: string | null;
    }>;
  };
};

function channelDedupeKey(base: string | null | undefined, channel: string, recipient?: string) {
  return base ? notificationDedupeKey([base, channel, recipient]) : null;
}

export function resolveNotificationDeliveryRecipientChannels({
  type,
  recipient,
  preferences,
}: {
  type: string;
  recipient: NotificationDeliveryRecipient;
  preferences: NotificationPreferenceRecord[];
}) {
  return resolveNotificationPreferenceChannels({
    type,
    target: recipient.userId
      ? { mode: "user", userId: recipient.userId, role: recipient.role }
      : { mode: "role", role: recipient.role },
    preferences,
  });
}

export function collectNotificationEmailRecipients({
  type,
  recipients,
  preferences,
}: {
  type: string;
  recipients: NotificationDeliveryRecipient[];
  preferences: NotificationPreferenceRecord[];
}) {
  return uniqueEmails(
    recipients
      .filter((recipient) => recipient.emailOptIn !== false)
      .filter((recipient) => resolveNotificationDeliveryRecipientChannels({ type, recipient, preferences }).emailEnabled)
      .map((recipient) => recipient.email ?? ""),
  );
}

export function collectNotificationSmsRecipients({
  type,
  recipients,
  preferences,
}: {
  type: string;
  recipients: NotificationDeliveryRecipient[];
  preferences: NotificationPreferenceRecord[];
}) {
  return uniqueSmsRecipients(
    recipients
      .filter((recipient) => recipient.smsOptIn !== false)
      .filter((recipient) => resolveNotificationDeliveryRecipientChannels({ type, recipient, preferences }).smsEnabled)
      .map((recipient) => recipient.phone ?? ""),
  );
}

export function formatNotificationSmsBody(title: string, body: string, maxLength = 600) {
  const value = [title.trim(), body.trim()].filter(Boolean).join(": ").replace(/\s+/g, " ").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export async function deliverNotificationExternalChannels({
  tenantId,
  centerId = null,
  leadId = null,
  messageId = null,
  dedupeKey = null,
  type,
  title,
  body,
  recipients,
  preferences,
  emailRequested = true,
  smsRequested = true,
  replyTo = null,
  fromName = "The BEE Suite",
  statusCallbackUrl = null,
  emailPurpose = "notification_email",
  smsPurpose = "notification_sms",
  metadata = {},
  providers: providerOverrides = {},
}: NotificationExternalDeliveryInput): Promise<NotificationDeliverySummary> {
  const providers: NotificationDeliveryProviders = {
    sendEmail,
    sendSms,
    recordEmailDeliveryAttempt,
    recordCommunicationSmsDeliveryAttempt,
    ...providerOverrides,
  };

  const emailRecipients = emailRequested
    ? collectNotificationEmailRecipients({ type, recipients, preferences })
    : [];
  const smsRecipients = smsRequested
    ? collectNotificationSmsRecipients({ type, recipients, preferences })
    : [];

  const emailSummary: NotificationDeliverySummary["email"] = {
    requested: emailRequested,
    attempted: emailRecipients.length,
    sent: 0,
    configured: false,
    provider: "sendgrid",
    error: emailRequested && !emailRecipients.length ? "No email-enabled recipients are available." : null,
    recipients: emailRecipients,
  };

  if (emailRecipients.length) {
    const email = await providers.sendEmail({
      to: emailRecipients,
      subject: title,
      text: body,
      replyTo,
      fromName,
      categories: [emailPurpose, type],
      customArgs: {
        purpose: emailPurpose,
        notificationType: type,
        centerId: centerId ?? undefined,
        leadId: leadId ?? undefined,
        messageId: messageId ?? undefined,
        dedupeKey: dedupeKey ?? undefined,
      },
      tenantId,
    });
    emailSummary.sent = email.ok ? emailRecipients.length : 0;
    emailSummary.configured = email.configured;
    emailSummary.error = email.error ?? null;

    await providers.recordEmailDeliveryAttempt({
      tenantId,
      centerId,
      leadId,
      messageId,
      dedupeKey: channelDedupeKey(dedupeKey, "email"),
      purpose: emailPurpose,
      to: emailRecipients,
      subject: title,
      text: body,
      replyTo,
      fromName,
      result: email,
      metadata: {
        ...metadata,
        notificationType: type,
      },
    });
  }

  const smsResults: NotificationDeliverySummary["sms"]["results"] = [];
  const smsBody = formatNotificationSmsBody(title, body);
  for (const to of smsRecipients) {
    const result = await providers.sendSms({ to, body: smsBody, statusCallbackUrl, tenantId });
    await providers.recordCommunicationSmsDeliveryAttempt({
      tenantId,
      centerId,
      messageId,
      dedupeKey: channelDedupeKey(dedupeKey, "sms", to),
      to,
      body: smsBody,
      statusCallbackUrl,
      result,
      purpose: smsPurpose,
    });
    smsResults.push({
      ok: result.ok,
      configured: result.configured,
      provider: "twilio",
      id: result.id ?? null,
      error: result.error ?? null,
    });
  }

  return {
    email: emailSummary,
    sms: {
      requested: smsRequested,
      attempted: smsRecipients.length,
      sent: smsResults.filter((result) => result.ok).length,
      configured: smsResults.some((result) => result.configured),
      provider: "twilio",
      error: smsRequested && !smsRecipients.length
        ? "No SMS-enabled recipients are available."
        : smsResults.find((result) => result.error)?.error ?? null,
      recipients: smsRecipients,
      results: smsResults,
    },
  };
}
