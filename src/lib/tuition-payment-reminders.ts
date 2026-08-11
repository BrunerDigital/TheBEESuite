import { isCurrentlyEnrolledChildRecord } from "./enrollment-status";
import { notificationDedupeKey } from "./notification-policy";

const dayMs = 86_400_000;

export const BEE_SUITE_PARENT_PORTAL_URL = "https://thebeesuite.io/parents";
export const TUITION_PAYMENT_REMINDER_VERSION = "current-family-balance-v2";
export const TUITION_PAYMENT_REMINDER_SETTINGS_KEY = "tuitionPaymentReminderSettings";
export const TUITION_PAYMENT_REMINDER_NOTIFICATION_RETENTION_DAYS = 120;

export type TuitionPaymentReminderSettings = {
  enabled: boolean;
  repeatEveryDays: number;
};

export type TuitionPaymentReminderPhase = "balance_available";

export type TuitionPaymentReminderDecision = {
  phase: TuitionPaymentReminderPhase;
  bucket: string;
  priority: "normal";
};

export const DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS: TuitionPaymentReminderSettings = {
  enabled: true,
  repeatEveryDays: 7,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function cadenceBucket(now: Date, repeatEveryDays: number) {
  const mondayAnchor = Date.UTC(1970, 0, 5);
  const period = Math.floor((startOfUtcDay(now).getTime() - mondayAnchor) / (repeatEveryDays * dayMs));
  return `balance-${repeatEveryDays}d-${period}`;
}

export function normalizeTuitionPaymentReminderSettings(value: unknown): TuitionPaymentReminderSettings {
  const input = record(value);
  const defaults = DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS;

  return {
    enabled: bool(input.enabled, defaults.enabled),
    repeatEveryDays: integer(
      input.repeatEveryDays,
      defaults.repeatEveryDays,
      1,
      30,
    ),
  };
}

export function tuitionPaymentReminderSettingsFromCustomFields(customFields: unknown) {
  return normalizeTuitionPaymentReminderSettings(record(customFields)[TUITION_PAYMENT_REMINDER_SETTINGS_KEY]);
}

export function tuitionPaymentReminderDecision({
  hasActiveAutopay,
  hasPendingPayment,
  now = new Date(),
  settings = DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS,
}: {
  hasActiveAutopay?: boolean;
  hasPendingPayment?: boolean;
  now?: Date;
  settings?: TuitionPaymentReminderSettings;
}): TuitionPaymentReminderDecision | null {
  const normalized = normalizeTuitionPaymentReminderSettings(settings);
  if (!normalized.enabled || hasActiveAutopay || hasPendingPayment) return null;

  return {
    phase: "balance_available",
    bucket: cadenceBucket(now, normalized.repeatEveryDays),
    priority: "normal",
  };
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function tuitionPaymentReminderCopy(input: {
  familyName: string;
  centerName: string;
  balanceCents: number;
}) {
  const balance = money(Math.max(0, input.balanceCents));
  return {
    title: "Tuition balance reminder",
    body: [
      "Hello,",
      `${input.centerName} has a current tuition balance of ${balance} for ${input.familyName}. Review the balance and payment options in The BEE Suite Parent Portal.`,
      `Sign in securely: ${BEE_SUITE_PARENT_PORTAL_URL}\nAfter signing in, open Payments to review your balance and payment options.`,
      "If you recently submitted a payment or one is processing, no action is needed. Bank payments can take several business days to appear on your account.",
      "Want easier access? Install the Parent Portal on your device:\n- iPhone or iPad: open the portal in Safari, tap Share, then Add to Home Screen.\n- Android: open it in Chrome, tap the menu, then Install app or Add to Home screen.\n- Computer: open it in Chrome or Edge and select the browser's Install option.",
      `For your security, always use ${BEE_SUITE_PARENT_PORTAL_URL} and never send card, bank, or password information through email or text. For questions about your balance, subsidies, credits, or payment arrangements, contact ${input.centerName} directly.`,
    ].join("\n\n"),
    priority: "normal" as const,
  };
}

export function isCurrentFamilyBalanceReminderEligible(input: {
  balanceCents: number;
  parentVisibleBalanceCents: number;
  responsibilityReviewRequired: boolean;
  checkoutReady: boolean;
  billingApproved: boolean;
  children: Array<{ enrollmentStatus?: string | null; classroomId?: string | null }>;
}) {
  return input.balanceCents > 0
    && input.parentVisibleBalanceCents > 0
    && !input.responsibilityReviewRequired
    && input.checkoutReady
    && input.billingApproved
    && input.children.some(isCurrentlyEnrolledChildRecord);
}

export function tuitionPaymentReminderDedupeKey(input: {
  billingAccountId: string;
  phase: TuitionPaymentReminderPhase;
  bucket: string;
  userId: string;
}) {
  return notificationDedupeKey([
    "tuition_payment_reminder",
    TUITION_PAYMENT_REMINDER_VERSION,
    input.billingAccountId,
    input.phase,
    input.bucket,
    input.userId,
  ]);
}

export function tuitionPaymentReminderDeliveryDedupeKey(input: {
  billingAccountId: string;
  phase: TuitionPaymentReminderPhase;
  bucket: string;
}) {
  return notificationDedupeKey([
    "tuition_payment_reminder",
    TUITION_PAYMENT_REMINDER_VERSION,
    input.billingAccountId,
    input.phase,
    input.bucket,
    "external",
  ]);
}
