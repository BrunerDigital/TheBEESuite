import { isoWeekBillingPeriod } from "@/lib/billing-workflows";

type FteInvoiceWeekInput = {
  createdAt: Date;
  customFields: unknown;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function weeklyPeriod(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(normalized) ? normalized : null;
}

function monthlyPeriod(fields: Record<string, unknown>) {
  if (fields.billingCadence !== "monthly" && fields.tuitionPlanCadence !== "monthly") return null;
  const value = fields.coverageStartsPeriod ?? fields.billingPeriod;
  return typeof value === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/** Monthly tuition is a weekly reporting equivalent, not weekly invoice activity.
 * Use the month containing the report's Monday; never change the invoice itself.
 */
export function invoiceFteWeekWeight(invoice: FteInvoiceWeekInput, weekStart: Date) {
  const month = monthlyPeriod(record(invoice.customFields));
  if (month) return month === weekStart.toISOString().slice(0, 7) ? 1 / 4 : 0;
  return invoiceBelongsToFteWeek(invoice, weekStart) ? 1 : 0;
}

export function invoiceBelongsToFteWeek(
  invoice: FteInvoiceWeekInput,
  weekStart: Date,
) {
  const fields = record(invoice.customFields);
  const coveredPeriod = weeklyPeriod(fields.coverageStartsPeriod)
    ?? weeklyPeriod(fields.billingPeriod);

  if (coveredPeriod) return coveredPeriod === isoWeekBillingPeriod(weekStart);

  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);
  return invoice.createdAt >= weekStart && invoice.createdAt < weekEndExclusive;
}
