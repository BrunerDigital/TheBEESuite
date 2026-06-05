import { PaymentStatus } from "@prisma/client";
import { notificationDedupeKey } from "./notification-policy";

export const PAYMENT_DUNNING_NOTIFICATION_RETENTION_DAYS = 120;
export const PAYMENT_DUNNING_MAX_ATTEMPTS = 4;
export const PAYMENT_DUNNING_RETRY_OFFSETS_DAYS = [0, 2, 5, 10] as const;

export type PaymentDunningMetadata = {
  dunningAttemptCount?: unknown;
  dunningLastAttemptAt?: unknown;
  dunningNextAttemptAt?: unknown;
  dunningPaused?: unknown;
  dunningStatus?: unknown;
  invoiceId?: unknown;
  stripeFailureMessage?: unknown;
  stripeError?: unknown;
};

export type PaymentDunningSummary = {
  status: "not_needed" | "ready" | "waiting" | "paused" | "maxed";
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  failureMessage: string | null;
};

function metadataObject(metadata: unknown): PaymentDunningMetadata {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as PaymentDunningMetadata)
    : {};
}

function numberFromMetadata(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function dateFromMetadata(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function paymentDunningAttemptCount(metadata: unknown) {
  return numberFromMetadata(metadataObject(metadata).dunningAttemptCount);
}

export function paymentDunningFailureMessage(metadata: unknown) {
  const fields = metadataObject(metadata);
  if (typeof fields.stripeFailureMessage === "string" && fields.stripeFailureMessage.trim()) {
    return fields.stripeFailureMessage.trim();
  }
  if (typeof fields.stripeError === "string" && fields.stripeError.trim()) {
    return fields.stripeError.trim();
  }
  return null;
}

export function nextPaymentDunningAt(failedAt: Date, attemptCount: number) {
  if (attemptCount >= PAYMENT_DUNNING_MAX_ATTEMPTS) return null;
  const offsetDays = PAYMENT_DUNNING_RETRY_OFFSETS_DAYS[Math.min(attemptCount, PAYMENT_DUNNING_RETRY_OFFSETS_DAYS.length - 1)];
  const next = new Date(failedAt);
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return next;
}

export function paymentDunningSummary(input: {
  paymentStatus: PaymentStatus | string;
  customFields: unknown;
  failedAt?: Date | string | null;
  relatedInvoiceStatus?: PaymentStatus | string | null;
  now?: Date;
}): PaymentDunningSummary {
  const now = input.now ?? new Date();
  const fields = metadataObject(input.customFields);
  const attemptCount = paymentDunningAttemptCount(fields);
  const lastAttemptAt = dateFromMetadata(fields.dunningLastAttemptAt);
  const failedAt = dateFromMetadata(input.failedAt) ?? lastAttemptAt ?? now;
  const nextAttemptAt = dateFromMetadata(fields.dunningNextAttemptAt) ?? nextPaymentDunningAt(failedAt, attemptCount);

  if (input.paymentStatus !== PaymentStatus.FAILED || input.relatedInvoiceStatus === PaymentStatus.PAID) {
    return {
      status: "not_needed",
      attemptCount,
      nextAttemptAt: null,
      lastAttemptAt,
      failureMessage: paymentDunningFailureMessage(fields),
    };
  }

  if (fields.dunningPaused === true) {
    return {
      status: "paused",
      attemptCount,
      nextAttemptAt,
      lastAttemptAt,
      failureMessage: paymentDunningFailureMessage(fields),
    };
  }

  if (attemptCount >= PAYMENT_DUNNING_MAX_ATTEMPTS) {
    return {
      status: "maxed",
      attemptCount,
      nextAttemptAt: null,
      lastAttemptAt,
      failureMessage: paymentDunningFailureMessage(fields),
    };
  }

  if (nextAttemptAt && nextAttemptAt > now) {
    return {
      status: "waiting",
      attemptCount,
      nextAttemptAt,
      lastAttemptAt,
      failureMessage: paymentDunningFailureMessage(fields),
    };
  }

  return {
    status: "ready",
    attemptCount,
    nextAttemptAt,
    lastAttemptAt,
    failureMessage: paymentDunningFailureMessage(fields),
  };
}

export function paymentDunningDedupeKey(input: {
  paymentId: string;
  attemptNumber: number;
  recipient: "staff" | "guardian";
  userId: string;
}) {
  return notificationDedupeKey([
    "payment_dunning",
    input.paymentId,
    input.attemptNumber,
    input.recipient,
    input.userId,
  ]);
}

export function paymentDunningMessageSubject(invoiceNumber: string | null, attemptNumber: number) {
  const invoiceLabel = invoiceNumber ? `invoice ${invoiceNumber}` : "your tuition invoice";
  return `Payment retry needed for ${invoiceLabel} (attempt ${attemptNumber})`;
}

export function paymentDunningCopy(input: {
  familyName: string;
  centerLabel?: string | null;
  invoiceNumber?: string | null;
  amountCents: number;
  attemptNumber: number;
  nextAttemptAt?: Date | null;
  failureMessage?: string | null;
}) {
  const amount = `$${(input.amountCents / 100).toFixed(2)}`;
  const center = input.centerLabel ? ` at ${input.centerLabel}` : "";
  const invoiceLabel = input.invoiceNumber ? `invoice ${input.invoiceNumber}` : "a tuition invoice";
  const nextStep = input.nextAttemptAt
    ? ` If this is not resolved, the next reminder is scheduled for ${input.nextAttemptAt.toISOString().slice(0, 10)}.`
    : " This is the final automated reminder in the retry sequence.";
  const failure = input.failureMessage ? ` Stripe reported: ${input.failureMessage}` : "";

  return {
    staffTitle: `Failed payment follow-up: ${input.familyName}`,
    staffBody: `${input.familyName}${center} has a failed ${amount} payment for ${invoiceLabel}. Retry attempt ${input.attemptNumber} is due now.${failure}${nextStep}`,
    guardianTitle: `Payment retry needed`,
    guardianBody: `A ${amount} payment for ${invoiceLabel} did not complete. Please retry the payment from your parent account or contact the school office for help.${nextStep}`,
    guardianSubject: paymentDunningMessageSubject(input.invoiceNumber ?? null, input.attemptNumber),
  };
}
