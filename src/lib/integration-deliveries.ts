import { Prisma } from "@prisma/client";
import {
  forwardInquiryToGoogleSheets,
  sendInquiryNotificationEmail,
  type InquiryIntegrationResult,
} from "@/lib/inquiry-integrations";
import { sendSms, type IntegrationSendResult } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export type IntegrationDeliveryProvider = "google_sheets" | "sendgrid" | "twilio";
export type IntegrationDeliveryPurpose = "inquiry_backup" | "inquiry_notification" | "communication_sms";

type IntegrationAttemptResult = InquiryIntegrationResult | (IntegrationSendResult & { skipped?: boolean });

type DeliveryState = {
  status: "delivered" | "failed" | "pending" | "skipped";
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
};

type RecordDeliveryAttemptInput = {
  tenantId: string;
  centerId?: string | null;
  leadId?: string | null;
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
  to: string;
  body: string;
  statusCallbackUrl?: string | null;
  result: IntegrationSendResult;
  maxAttempts?: number;
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
  to,
  body,
  statusCallbackUrl,
  result,
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
      provider: "twilio",
      providerMessageId: result.id ?? null,
      purpose: "communication_sms",
      direction: "outbound",
      recipient: to,
      status: state.status,
      attempts,
      maxAttempts,
      payload: {
        to,
        body,
        statusCallbackUrl: statusCallbackUrl ?? null,
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

async function sendDelivery(provider: string, purpose: string, payload: Record<string, unknown>) {
  if (provider === "google_sheets" && purpose === "inquiry_backup") {
    return forwardInquiryToGoogleSheets(payload);
  }

  if (provider === "sendgrid" && purpose === "inquiry_notification") {
    return sendInquiryNotificationEmail(payload, stringArray(payload.locationRecipients));
  }

  if (provider === "twilio" && purpose === "communication_sms") {
    return sendSms({
      to: stringValue(payload.to),
      body: stringValue(payload.body),
      statusCallbackUrl: stringValue(payload.statusCallbackUrl) || null,
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
    const payload = asRecord(delivery.payload);
    const result = await sendDelivery(delivery.provider, delivery.purpose, payload);
    const state = computeIntegrationDeliveryState({
      result,
      attempts: nextAttempts,
      maxAttempts: delivery.maxAttempts,
    });

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
