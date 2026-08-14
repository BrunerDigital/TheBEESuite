import { Prisma } from "@prisma/client";
import {
  forwardInquiryToGoogleSheets,
  sendInquiryNotificationEmail,
  type InquiryIntegrationResult,
} from "@/lib/inquiry-integrations";
import { sendEmail, sendSms, type IntegrationSendResult } from "@/lib/integrations";
import { fteExternalEscalationWindow, getFteDueState } from "@/lib/fte-report-guardrails";
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
  | "parent_guide_email"
  | "parent_document_request_email"
  | "payment_method_request_email"
  | "daily_report_email"
  | "signature_request_email"
  | "onboarding_email"
  | "account_setup_email"
  | "password_reset_email"
  | "fte_reminder_email"
  | "notification_email"
  | "communication_sms"
  | "fte_reminder_sms"
  | "notification_sms"
  | "payout_notification_sms";

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
  purpose?: Extract<IntegrationDeliveryPurpose, "communication_sms" | "fte_reminder_sms" | "notification_sms" | "payout_notification_sms">;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
};

type FinalizeCommunicationSmsDeliveryInput = {
  id: string;
  result: IntegrationSendResult;
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
    | "parent_guide_email"
    | "parent_document_request_email"
    | "payment_method_request_email"
    | "daily_report_email"
    | "signature_request_email"
    | "onboarding_email"
    | "account_setup_email"
    | "password_reset_email"
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

export async function claimIntegrationDeliveryForRetry({
  id,
  attempts,
  now = new Date(),
}: {
  id: string;
  attempts: number;
  now?: Date;
}) {
  const nextAttempts = attempts + 1;
  const claimed = await prisma.integrationDelivery.updateMany({
    where: {
      id,
      status: "pending",
      attempts,
      providerMessageId: null,
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: now } },
      ],
    },
    data: {
      attempts: nextAttempts,
      nextAttemptAt: nextIntegrationRetryAt(nextAttempts, now),
    },
  });
  return { claimed: claimed.count === 1, attempts: nextAttempts };
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
  metadata = {},
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
        ...metadata,
      } as Prisma.InputJsonObject,
      lastResult: deliveryResult as Prisma.InputJsonObject,
      lastError: deliveryResult.error ?? null,
      nextAttemptAt: state.nextAttemptAt,
      deliveredAt: state.deliveredAt,
    },
  });
}

export async function finalizeCommunicationSmsDeliveryAttempt({
  id,
  result,
  maxAttempts = 5,
}: FinalizeCommunicationSmsDeliveryInput) {
  const deliveryResult: IntegrationAttemptResult = result.configured
    ? result
    : { ...result, skipped: true };
  const attempts = deliveryResult.skipped ? 0 : 1;
  const state = result.acceptanceUnknown
    ? { status: "failed" as const, nextAttemptAt: null, deliveredAt: null }
    : computeIntegrationDeliveryState({
        result: deliveryResult,
        attempts,
        maxAttempts,
      });
  const updated = await prisma.integrationDelivery.updateMany({
    where: { id, status: "attempting", attempts: 1 },
    data: {
      providerMessageId: result.id ?? null,
      status: state.status,
      attempts,
      lastResult: deliveryResult as Prisma.InputJsonObject,
      lastError: deliveryResult.error ?? null,
      nextAttemptAt: state.nextAttemptAt,
      deliveredAt: state.deliveredAt,
    },
  });
  if (updated.count !== 1) {
    throw new Error(`Integration delivery ${id} changed before its initial attempt was finalized.`);
  }
  return state;
}

export async function beginCommunicationSmsDeliveryAttempt(id: string) {
  const claimed = await prisma.integrationDelivery.updateMany({
    where: { id, status: "pending", attempts: 0, providerMessageId: null },
    data: {
      status: "attempting",
      attempts: 1,
      nextAttemptAt: null,
    },
  });
  if (claimed.count !== 1) {
    throw new Error(`Integration delivery ${id} could not begin its initial provider attempt.`);
  }
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

export function staleTimeSensitiveDeliveryReason(
  purpose: string,
  payload: Record<string, unknown>,
  now = new Date(),
) {
  if (purpose !== "fte_reminder_email" && purpose !== "fte_reminder_sms") return null;
  const currentWeek = getFteDueState(now).weekStart.toISOString().slice(0, 10);
  if (stringValue(payload.weekStart) !== currentWeek) return "The FTE reporting week is no longer current.";
  if (!fteExternalEscalationWindow(now)) return "FTE external reminders are outside the approved Friday evening window.";
  return null;
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

  if (provider === "twilio" && (purpose === "communication_sms" || purpose === "fte_reminder_sms" || purpose === "notification_sms" || purpose === "payout_notification_sms")) {
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
  const stalePayoutAttemptBefore = new Date(now.getTime() - 15 * 60_000);
  const stalePayoutAttempts = await prisma.integrationDelivery.updateMany({
    where: {
      status: "attempting",
      purpose: "payout_notification_sms",
      updatedAt: { lte: stalePayoutAttemptBefore },
    },
    data: {
      status: "failed",
      lastError: "Twilio acceptance is unknown after the payout SMS attempt stopped before finalization. Manual reconciliation is required; this alert was not retried to prevent a duplicate text.",
      nextAttemptAt: null,
      deliveredAt: null,
    },
  });
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

    const claim = await claimIntegrationDeliveryForRetry({
      id: delivery.id,
      attempts: delivery.attempts,
      now,
    });
    if (!claim.claimed) {
      results.push({
        id: delivery.id,
        provider: delivery.provider,
        purpose: delivery.purpose,
        status: "claimed_elsewhere",
      });
      continue;
    }

    const nextAttempts = claim.attempts;
    const payload = {
      ...asRecord(delivery.payload),
      tenantId: delivery.tenantId,
    };
    const staleReason = staleTimeSensitiveDeliveryReason(delivery.purpose, payload, now);
    if (staleReason) {
      const skipped = await prisma.integrationDelivery.updateMany({
        where: { id: delivery.id, status: "pending", attempts: nextAttempts },
        data: {
          status: "skipped",
          lastError: staleReason,
          nextAttemptAt: null,
          deliveredAt: null,
        },
      });
      if (skipped.count !== 1) {
        throw new Error(`Integration delivery ${delivery.id} changed after its retry claim.`);
      }
      results.push({
        id: delivery.id,
        provider: delivery.provider,
        purpose: delivery.purpose,
        status: "skipped",
        attempts: nextAttempts,
        error: staleReason,
      });
      continue;
    }
    let result: Awaited<ReturnType<typeof sendDelivery>>;
    try {
      result = await sendDelivery(delivery.provider, delivery.purpose, payload);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : "Integration retry failed before returning a provider result.",
      };
    }
    const state = computeIntegrationDeliveryState({
      result,
      attempts: nextAttempts,
      maxAttempts: delivery.maxAttempts,
    });
    if (delivery.provider === "sendgrid" && result.ok) {
      state.status = "accepted";
      state.deliveredAt = null;
    }

    const updated = await prisma.integrationDelivery.updateMany({
      where: { id: delivery.id, status: "pending", attempts: nextAttempts },
      data: {
        ...("id" in result && result.id ? { providerMessageId: result.id } : {}),
        status: state.status,
        lastResult: result as Prisma.InputJsonObject,
        lastError: result.error ?? null,
        nextAttemptAt: state.nextAttemptAt,
        deliveredAt: state.deliveredAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error(`Integration delivery ${delivery.id} changed after its retry claim.`);
    }

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
    payoutAttemptsRequiringManualReview: stalePayoutAttempts.count,
    results,
  };
}
