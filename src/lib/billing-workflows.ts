function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCurrencyCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const normalized = clean(value).replace(/[$,\s]/g, "");
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function normalizeAgencyPaymentMetadata(input: {
  agencyName?: unknown;
  authorizationNumber?: unknown;
  externalReference?: unknown;
  coverageStart?: unknown;
  coverageEnd?: unknown;
  notes?: unknown;
}) {
  const agencyName = clean(input.agencyName).slice(0, 120);
  const authorizationNumber = clean(input.authorizationNumber).slice(0, 120);
  const externalReference = clean(input.externalReference).slice(0, 160);
  const coverageStart = clean(input.coverageStart);
  const coverageEnd = clean(input.coverageEnd);
  const notes = clean(input.notes).slice(0, 1000);
  return {
    agencyName,
    authorizationNumber,
    externalReference,
    coverageStart: /^\d{4}-\d{2}-\d{2}$/.test(coverageStart) ? coverageStart : "",
    coverageEnd: /^\d{4}-\d{2}-\d{2}$/.test(coverageEnd) ? coverageEnd : "",
    notes,
  };
}

export function agencyPaymentDescription(input: {
  agencyName?: string | null;
  childName?: string | null;
  coverageStart?: string | null;
  coverageEnd?: string | null;
}) {
  const agency = clean(input.agencyName) || "Agency subsidy";
  const child = clean(input.childName);
  const coverage = input.coverageStart && input.coverageEnd
    ? ` (${input.coverageStart} to ${input.coverageEnd})`
    : input.coverageStart
      ? ` (${input.coverageStart})`
      : "";
  return [agency, child].filter(Boolean).join(" - ") + coverage;
}

export function normalizeBillingPeriod(value: unknown, fallbackDate: Date) {
  const normalized = clean(value);
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  return fallbackDate.toISOString().slice(0, 7);
}

export function normalizeBillingCadence(value: unknown) {
  return clean(value).toLowerCase().startsWith("week") ? "weekly" : "monthly";
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isoWeekBillingPeriod(date: Date) {
  const value = utcDateOnly(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function normalizeWeeklyBillingPeriod(value: unknown, fallbackDate: Date) {
  const normalized = clean(value).toUpperCase();
  const weeklyMatch = normalized.match(/^(\d{4})-W(\d{1,2})$/);
  if (weeklyMatch) {
    const week = Number.parseInt(weeklyMatch[2], 10);
    if (week >= 1 && week <= 53) return `${weeklyMatch[1]}-W${String(week).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}$/.test(normalized)) return isoWeekBillingPeriod(new Date(`${normalized}-01T12:00:00.000Z`));
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return isoWeekBillingPeriod(new Date(`${normalized}T12:00:00.000Z`));
  return isoWeekBillingPeriod(fallbackDate);
}

export function normalizeRecurringBillingPeriod(value: unknown, fallbackDate: Date, cadence: unknown) {
  return normalizeBillingCadence(cadence) === "weekly"
    ? normalizeWeeklyBillingPeriod(value, fallbackDate)
    : normalizeBillingPeriod(value, fallbackDate);
}

export function normalizeBatchTarget(value: unknown) {
  return clean(value).toLowerCase() === "family" ? "family" : "child";
}

export function normalizeBillingDay(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(clean(value), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 28);
}

export function normalizeWeeklyBillingDay(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(clean(value), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 7);
}

export function normalizeRecurringBillingDay(value: unknown, cadence: unknown) {
  return normalizeBillingCadence(cadence) === "weekly" ? normalizeWeeklyBillingDay(value) : normalizeBillingDay(value);
}

export function utcBillingWeekday(date: Date) {
  return date.getUTCDay() || 7;
}

export function recurringDueDateForPeriod(period: string, billingDay: number, cadence: unknown) {
  if (normalizeBillingCadence(cadence) !== "weekly") {
    return new Date(`${period}-${String(normalizeBillingDay(billingDay)).padStart(2, "0")}T12:00:00.000Z`);
  }

  const match = period.toUpperCase().match(/^(\d{4})-W(\d{2})$/);
  const year = match ? Number.parseInt(match[1], 10) : new Date().getUTCFullYear();
  const week = match ? Number.parseInt(match[2], 10) : 1;
  const fourthOfJanuary = new Date(Date.UTC(year, 0, 4, 12));
  const weekOneMonday = new Date(fourthOfJanuary);
  weekOneMonday.setUTCDate(fourthOfJanuary.getUTCDate() - (fourthOfJanuary.getUTCDay() || 7) + 1);
  const dueDate = new Date(weekOneMonday);
  dueDate.setUTCDate(weekOneMonday.getUTCDate() + ((week - 1) * 7) + normalizeWeeklyBillingDay(billingDay) - 1);
  return dueDate;
}

export function shouldCreateRecurringTuitionInvoice(input: {
  enabled: boolean;
  planId?: string | null;
  amountCents: number;
  startsPeriod?: string | null;
  billingPeriod: string;
  billingDay: number;
  currentDay: number;
}) {
  if (!input.enabled || !input.planId || input.amountCents <= 0) return false;
  if (input.startsPeriod && input.startsPeriod > input.billingPeriod) return false;
  return input.billingDay <= input.currentDay;
}

export function billingDedupeKey(input: {
  familyId: string;
  chargeSource: string;
  sourceId: string;
  billingPeriod: string;
  batchTarget?: string;
  childIds?: string[];
}) {
  const childScope = input.childIds?.length ? input.childIds.slice().sort().join("+") : "family";
  return [
    "billing",
    input.familyId,
    input.chargeSource || "custom",
    input.sourceId || "custom",
    input.billingPeriod,
    input.batchTarget || "single",
    childScope,
  ].join(":");
}
