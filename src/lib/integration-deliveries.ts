import { Prisma } from "@prisma/client";
import {
  forwardInquiryToGoogleSheets,
  sendInquiryNotificationEmail,
  type InquiryIntegrationResult,
} from "@/lib/inquiry-integrations";
import { sendEmail, sendSms, type IntegrationSendResult } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export type IntegrationDeliveryProvider = "google_sheets" | "sendgrid" | "twilio";
export type IntegrationDeliveryPurpose =
  | "inquiry_backup"
  | "inquiry_notification"
  | "communication_email"
  | "lead_email"
  | "announcement_email"
  | "campaign_email"
  | "registration_email"
  | "parent_invitation_email"
  | "parent_document_request_email"
  | "payment_method_request_email"
  | "daily_report_email"
  | "signature_request_email"
  | "onboarding_email"
  | "fte_reminder_email"
  | "notification_email"
  | "communication_sms"
  | "fte_reminder_sms"
  | "notification_sms";

type IntegrationAttemptResult = InquiryIntegrationResult | (IntegrationSendResult & { skipped?: boolean });

type DeliveryState = {
  status: "accepted" | "delivered" | "failed" | "pending" | "skipped";
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
};

type RecordDeliveryAttemptInput = {
  tenantId: string;
  centerId?: string | null;
  leadId?: string | null;
  dedupeKey?: string | null;
  provider: IntegrationDeliveryProvider;
  purpose: IntegrationDeliveryPurpose;
  payload: Record<string, unknown>;
  result: IntegrationAttemptResult;
  maxAttempts?: number;
};

type RecordCommunicationSmsDeliveryInput = {
  tenantId: string;
  centerId?: string | null;
  messageId?: string | null;
  dedupeKey?: string | null;
  to: string;
  body: string;
  statusCallbackUrl?: string | null;
  result: IntegrationSendResult;
  purpose?: Extract<IntegrationDeliveryPurpose, "communication_sms" | "fte_reminder_sms" | "notification_sms">;
  maxAttempts?: number;
};

type RecordEmailDeliveryInput = {
  tenantId: string;
  centerId?: string | null;
  leadId?: string | null;
  messageId?: string | null;
  dedupeKey?: string | null;
  purpose: Extract<
    IntegrationDeliveryPurpose,
    | "communication_email"
    | "lead_email"
    | "announcement_email"
    | "campaign_email"
    | "registration_email"
    | "parent_invitation_email"
    | "parent_document_request_email"
    | "payment_method_request_email"
    | "daily_report_email"
    | "signature_request_email"
    | "onboarding_email"
    | "fte_reminder_email"
    | "notification_email"
  >;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
  fromName?: string;
  result: IntegrationSendResult;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
};

const RETRY_DELAYS_MINUTES = [5, 15, 60, 180, 720];

export function nextIntegrationRetryAt(attempts: number, now = new Date()) {
  const index = Math.max(0, Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1));
  return new Date(now.getTime() + RETRY_DELAYS_MINUTES[index] * 60_000);
}

export function computeIntegrationDeliveryState({
  result,
  attempts,
  maxAttempts = 5,
  now = new Date(),
}: {
  result: IntegrationAttemptResult;
  attempts: number;
  maxAttempts?: number;
  now?: Date;
}): DeliveryState {
  if (result.skipped) {
    return { status: "skipped", nextAttemptAt: null, deliveredAt: null };
  }

  if (result.ok) {
    return { status: "delivered", nextAttemptAt: null, deliveredAt: now };
  }

  if (attempts >= maxAttempts) {
    return { status: "failed", nextAttemptAt: null, deliveredAt: null };
  }

  return { status: "pending", nextAttemptAt: nextIntegrationRetryAt(attempts, now), deliveredAt: null };
}

export async function recordIntegrationDeliveryAttempt({
  tenantId,
  centerId,
  leadId,
  dedupeKey,
  provider,
  purpose,
  payload,
  result,
  maxAttempts = 5,
}: RecordDeliveryAttemptInput) {
  const attempts = result.skipped ? 0 : 1;
  const state = computeIntegrationDeliveryState({
    result,
    attempts,
    maxAttempts,
  });

  return prisma.integrationDelivery.create({
    data: {
      tenantId,
      centerId,
      leadId,
      dedupeKey: dedupeKey ?? null,
      provider,
      purpose,
      status: state.status,
      attempts,
      maxAttempts,
      payload: payload as Prisma.InputJsonObject,
      lastResult: result as Prisma.InputJsonObject,
      lastError: result.error ?? null,
      nextAttemptAt: state.nextAttemptAt,
      deliveredAt: state.deliveredAt,
    },
  });
}

export async function recordCommunicationSmsDeliveryAttempt({
  tenantId,
  centerId,
  messageId,
  dedupeKey,
  to,
  body,
  statusCallbackUrl,
  result,
  purpose = "communication_sms",
  maxAttempts = 5,
}: RecordCommunicationSmsDeliveryInput) {
  const deliveryResult: IntegrationAttemptResult = result.configured
    ? result
    : { ...result, skipped: true };
  const attempts = deliveryResult.skipped ? 0 : 1;
  const state = computeIntegrationDeliveryState({
    result: deliveryResult,
    attempts,
    maxAttempts,
  });

  return prisma.integrationDelivery.create({
    data: {
      tenantId,
      centerId,
      messageId: messageId ?? null,
      dedupeKey: dedupeKey ?? null,
      provider: "twilio",
      providerMessageId: result.id ?? null,
      purpose,
      direction: "outbound",
      recipient: to,
      status: state.status,
      attempts,
      maxAttempts,
      payload: {
        to,
        body,
        statusCallbackUrl: statusCallbackUrl ?? null,
        tenantId,
        dedupeKey: dedupeKey ?? null,
      } as Prisma.InputJsonObject,
      lastResult: deliveryResult as Prisma.InputJsonObject,
      lastError: deliveryResult.error ?? null,
      nextAttemptAt: state.nextAttemptAt,
      deliveredAt: state.deliveredAt,
    },
  });
}

export async function recordEmailDeliveryAttempt({
  tenantId,
  centerId,
  leadId,
  messageId,
  dedupeKey,
  purpose,
  to,
  subject,
  text,
  html,
  replyTo,
  fromName = "The BEE Suite",
  result,
  maxAttempts = 5,
  metadata = {},
}: RecordEmailDeliveryInput) {
  const deliveryResult: IntegrationAttemptResult = result.configured
    ? result
    : { ...result, skipped: true };
  const attempts = deliveryResult.skipped ? 0 : 1;
  const state = computeIntegrationDeliveryState({
    result: deliveryResult,
    attempts,
    maxAttempts,
  });
  // SendGrid's 202 response only confirms queue acceptance. Delivery is
  // established later by the signed Event Webhook.
  if (deliveryResult.ok) {
    state.status = "accepted";
    state.deliveredAt = null;
  }

  return prisma.integrationDelivery.create({
    data: {
      tenantId,
      centerId,
      leadId,
      messageId: messageId ?? null,
      dedupeKey: dedupeKey ?? null,
      provider: "sendgrid",
      providerMessageId: result.id ?? null,
      purpose,
      direction: "outbound",
      recipient: `${to.length} recipient${to.length === 1 ? "" : "s"}`,
      status: state.status,
      attempts,
      maxAttempts,
      payload: {
        to,
        subject,
        text,
        html: html ?? null,
        replyTo: replyTo ?? null,
        fromName,
        centerId: centerId ?? null,
        leadId: leadId ?? null,
        messageId: messageId ?? null,
        tenantId,
        dedupeKey: dedupeKey ?? null,
        ...metadata,
      } as Prisma.InputJsonObject,
      lastResult: deliveryResult as Prisma.InputJsonObject,
      lastError: deliveryResult.error ?? null,
      nextAttemptAt: state.nextAttemptAt,
      deliveredAt: state.deliveredAt,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const SENDGRID_EMAIL_PURPOSES = new Set([
  "communication_email",
  "lead_email",
  "announcement_email",
  "campaign_email",
  "registration_email",
  "parent_invitation_email",
  "parent_document_request_email",
  "daily_report_email",
  "signature_request_email",
  "onboarding_email",
  "fte_reminder_email",
  "notification_email",
]);

async function sendDelivery(provider: string, purpose: string, payload: Record<string, unknown>) {
  if (provider === "google_sheets" && purpose === "inquiry_backup") {
    return forwardInquiryToGoogleSheets(payload);
  }

  if (provider === "sendgrid" && purpose === "inquiry_notification") {
    return sendInquiryNotificationEmail(payload, stringArray(payload.locationRecipients));
  }

  if (provider === "sendgrid" && SENDGRID_EMAIL_PURPOSES.has(purpose)) {
    return sendEmail({
      to: stringArray(payload.to),
      subject: stringValue(payload.subject),
      text: stringValue(payload.text),
      html: stringValue(payload.html) || undefined,
      replyTo: stringValue(payload.replyTo) || null,
      fromName: stringValue(payload.fromName) || "The BEE Suite",
      categories: [purpose],
      customArgs: {
        purpose,
        centerId: stringValue(payload.centerId) || undefined,
        leadId: stringValue(payload.leadId) || undefined,
        messageId: stringValue(payload.messageId) || undefined,
      },
      tenantId: stringValue(payload.tenantId) || null,
    });
  }

  if (provider === "twilio" && (purpose === "communication_sms" || purpose === "fte_reminder_sms" || purpose === "notification_sms")) {
    return sendSms({
      to: stringValue(payload.to),
      body: stringValue(payload.body),
      statusCallbackUrl: stringValue(payload.statusCallbackUrl) || null,
      tenantId: stringValue(payload.tenantId) || null,
    });
  }

  return {
    ok: false,
    error: `Unsupported delivery target ${provider}:${purpose}.`,
  } satisfies InquiryIntegrationResult;
}

export async function retryPendingIntegrationDeliveries({
  limit = 25,
  dryRun = false,
}: {
  limit?: number;
  dryRun?: boolean;
}) {
  const now = new Date();
  const deliveries = await prisma.integrationDelivery.findMany({
    where: {
      status: "pending",
      attempts: { lt: 5 },
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
    select: {
      id: true,
      tenantId: true,
      provider: true,
      purpose: true,
      attempts: true,
      maxAttempts: true,
      payload: true,
    },
  });

  const results = [];

  for (const delivery of deliveries) {
    if (dryRun) {
      results.push({
        id: delivery.id,
        provider: delivery.provider,
        purpose: delivery.purpose,
        status: "would_retry",
      });
      continue;
    }

    const nextAttempts = delivery.attempts + 1;
    const payload = {
      ...asRecord(delivery.payload),
      tenantId: delivery.tenantId,
    };
    const result = await sendDelivery(delivery.provider, delivery.purpose, payload);
    const state = computeIntegrationDeliveryState({
      result,
      attempts: nextAttempts,
      maxAttempts: delivery.maxAttempts,
    });
    if (delivery.provider === "sendgrid" && result.ok) {
      state.status = "accepted";
      state.deliveredAt = null;
    }

    await prisma.integrationDelivery.update({
      where: { id: delivery.id },
      data: {
        ...("id" in result && result.id ? { providerMessageId: result.id } : {}),
        attempts: nextAttempts,
        status: state.status,
        lastResult: result as Prisma.InputJsonObject,
        lastError: result.error ?? null,
        nextAttemptAt: state.nextAttemptAt,
        deliveredAt: state.deliveredAt,
      },
    });

    results.push({
      id: delivery.id,
      provider: delivery.provider,
      purpose: delivery.purpose,
      status: state.status,
      attempts: nextAttempts,
      error: result.error,
    });
  }

  return {
    processed: results.length,
    results,
  };
}
