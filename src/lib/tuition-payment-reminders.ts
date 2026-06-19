import { notificationDedupeKey } from "./notification-policy";

const dayMs = 86_400_000;

export const TUITION_PAYMENT_REMINDER_SETTINGS_KEY = "tuitionPaymentReminderSettings";
export const TUITION_PAYMENT_REMINDER_NOTIFICATION_RETENTION_DAYS = 120;
export const TUITION_PAYMENT_REMINDER_MAX_PAST_DUE_DAYS = 90;

export type TuitionPaymentReminderSettings = {
  enabled: boolean;
  invoiceReadyEnabled: boolean;
  pastDueEnabled: boolean;
  pastDueFirstDaysAfter: number;
  pastDueRepeatEveryDays: number;
  pastDueMaxDaysAfter: number;
};

export type TuitionPaymentReminderPhase = "ready_to_pay" | "past_due_dropoff";

export type TuitionPaymentReminderDecision = {
  phase: TuitionPaymentReminderPhase;
  bucket: string;
  daysPastDue: number;
  priority: "normal" | "high";
};

export const DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS: TuitionPaymentReminderSettings = {
  enabled: true,
  invoiceReadyEnabled: true,
  pastDueEnabled: true,
  pastDueFirstDaysAfter: 3,
  pastDueRepeatEveryDays: 2,
  pastDueMaxDaysAfter: 30,
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

function endOfUtcDay(date: Date) {
  const end = startOfUtcDay(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function ymd(date: Date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export function normalizeTuitionPaymentReminderSettings(value: unknown): TuitionPaymentReminderSettings {
  const input = record(value);
  const defaults = DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS;
  const pastDueFirstDaysAfter = integer(input.pastDueFirstDaysAfter, defaults.pastDueFirstDaysAfter, 1, 30);

  return {
    enabled: bool(input.enabled, defaults.enabled),
    invoiceReadyEnabled: bool(input.invoiceReadyEnabled, defaults.invoiceReadyEnabled),
    pastDueEnabled: bool(input.pastDueEnabled, defaults.pastDueEnabled),
    pastDueFirstDaysAfter,
    pastDueRepeatEveryDays: integer(input.pastDueRepeatEveryDays, defaults.pastDueRepeatEveryDays, 1, 30),
    pastDueMaxDaysAfter: Math.max(
      pastDueFirstDaysAfter,
      integer(
        input.pastDueMaxDaysAfter,
        defaults.pastDueMaxDaysAfter,
        pastDueFirstDaysAfter,
        TUITION_PAYMENT_REMINDER_MAX_PAST_DUE_DAYS,
      ),
    ),
  };
}

export function tuitionPaymentReminderSettingsFromCustomFields(customFields: unknown) {
  return normalizeTuitionPaymentReminderSettings(record(customFields)[TUITION_PAYMENT_REMINDER_SETTINGS_KEY]);
}

export function daysPastTuitionDue(dueDate: Date, now = new Date()) {
  const diff = startOfUtcDay(now).getTime() - startOfUtcDay(dueDate).getTime();
  return Math.max(0, Math.round(diff / dayMs));
}

export function daysSinceInvoiceCreated(createdAt: Date, now = new Date()) {
  const diff = startOfUtcDay(now).getTime() - startOfUtcDay(createdAt).getTime();
  return Math.round(diff / dayMs);
}

export function tuitionPaymentReminderDecision({
  dueDate,
  invoiceCreatedAt,
  hasActiveAutopay,
  now = new Date(),
  settings = DEFAULT_TUITION_PAYMENT_REMINDER_SETTINGS,
}: {
  dueDate: Date;
  invoiceCreatedAt: Date;
  hasActiveAutopay?: boolean;
  now?: Date;
  settings?: TuitionPaymentReminderSettings;
}): TuitionPaymentReminderDecision | null {
  const normalized = normalizeTuitionPaymentReminderSettings(settings);
  if (!normalized.enabled) return null;

  if (normalized.invoiceReadyEnabled && !hasActiveAutopay && daysSinceInvoiceCreated(invoiceCreatedAt, now) === 0) {
    return {
      phase: "ready_to_pay",
      bucket: `ready-${ymd(invoiceCreatedAt)}`,
      daysPastDue: 0,
      priority: "normal",
    };
  }

  const pastDueDays = daysPastTuitionDue(dueDate, now);
  if (!normalized.pastDueEnabled || pastDueDays < normalized.pastDueFirstDaysAfter) return null;
  if (pastDueDays > normalized.pastDueMaxDaysAfter) return null;

  const daysSinceFirstNotice = pastDueDays - normalized.pastDueFirstDaysAfter;
  if (daysSinceFirstNotice % normalized.pastDueRepeatEveryDays !== 0) return null;

  return {
    phase: "past_due_dropoff",
    bucket: `past-due-${ymd(dueDate)}-${pastDueDays}`,
    daysPastDue: pastDueDays,
    priority: "high",
  };
}

export function tuitionPaymentReminderWindow(now = new Date()) {
  const createdStart = startOfUtcDay(now);
  const createdEnd = endOfUtcDay(now);
  const pastDueStart = startOfUtcDay(now);
  pastDueStart.setUTCDate(pastDueStart.getUTCDate() - TUITION_PAYMENT_REMINDER_MAX_PAST_DUE_DAYS);
  return { createdStart, createdEnd, pastDueStart, pastDueEnd: createdStart };
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function invoiceLabel(invoiceNumber?: string | null) {
  return invoiceNumber ? `invoice ${invoiceNumber}` : "your tuition invoice";
}

export function tuitionPaymentReminderCopy(input: {
  phase: TuitionPaymentReminderPhase;
  familyName: string;
  centerName?: string | null;
  invoiceNumber?: string | null;
  dueDate: Date;
  amountCents: number;
  balanceCents?: number | null;
}) {
  const amount = money(input.amountCents);
  const balance = money(Math.max(input.balanceCents ?? input.amountCents, input.amountCents));
  const dueDate = shortDate(input.dueDate);
  const schoolPrefix = input.centerName ? `${input.centerName}: ` : "";
  const invoice = invoiceLabel(input.invoiceNumber);

  if (input.phase === "past_due_dropoff") {
    return {
      title: `Past due tuition balance: ${balance}`,
      body: `${schoolPrefix}${input.familyName}'s tuition balance is past due. Please pay ${balance} in the parent portal before or at your next drop-off. ${invoice} was due ${dueDate}.`,
      priority: "high" as const,
    };
  }

  return {
    title: `Tuition ready to view/pay: ${amount}`,
    body: `${schoolPrefix}${input.familyName}'s ${invoice} for ${amount} is ready to view and pay in the parent portal.`,
    priority: "normal" as const,
  };
}

export function tuitionPaymentReminderDedupeKey(input: {
  invoiceId: string;
  phase: TuitionPaymentReminderPhase;
  bucket: string;
  userId: string;
}) {
  return notificationDedupeKey([
    "tuition_payment_reminder",
    input.invoiceId,
    input.phase,
    input.bucket,
    input.userId,
  ]);
}

export function tuitionPaymentReminderDeliveryDedupeKey(input: {
  invoiceId: string;
  phase: TuitionPaymentReminderPhase;
  bucket: string;
}) {
  return notificationDedupeKey([
    "tuition_payment_reminder",
    input.invoiceId,
    input.phase,
    input.bucket,
    "external",
  ]);
}

export function isTuitionInvoiceLike(input: {
  customFields: unknown;
  items?: Array<{ description: string | null }>;
}) {
  const fields = record(input.customFields);
  const chargeSource = String(fields.chargeSource ?? "").trim().toLowerCase();
  const mode = String(fields.mode ?? "").trim().toLowerCase();
  if (chargeSource === "tuitionplan" || mode === "recurring" || typeof fields.tuitionPlanName === "string") {
    return true;
  }

  return Boolean(input.items?.some((item) => (item.description ?? "").toLowerCase().includes("tuition")));
}
