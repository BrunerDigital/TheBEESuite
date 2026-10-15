import {
  addWeeksToBillingPeriod,
  normalizeBillingCadence,
  normalizeTuitionInvoiceDelayWeeks,
  shouldCreateRecurringTuitionInvoice,
  tuitionInvoiceBillingPeriod,
  weeklyTuitionChargeDateForPeriod,
} from "./billing-workflows";

export function resolveTuitionInvoiceDelay(input: {
  requested: unknown;
  cadence: unknown;
  previousCadence: unknown;
  previousDelay: unknown;
}) {
  if (input.requested !== undefined && input.requested !== 0 && input.requested !== 1) {
    return { ok: false as const, error: "Choose standard invoice timing or a one-week delay." };
  }
  const cadence = normalizeBillingCadence(input.cadence);
  if (input.requested === 1 && cadence !== "biweekly") {
    return { ok: false as const, error: "A one-week invoice delay is available for biweekly tuition only." };
  }
  const delayWeeks = input.requested === undefined
    ? cadence === normalizeBillingCadence(input.previousCadence)
      ? normalizeTuitionInvoiceDelayWeeks(input.previousDelay, cadence)
      : 0
    : input.requested;
  return { ok: true as const, delayWeeks };
}

// Keep historical gaps anchored to the saved start, even after the delayed
// invoice week expires. Every due cycle must have positive coverage evidence.
export function biweeklyCoveragePeriodBeforeRemovingDelay(startsPeriod: string, asOf: Date, coveredPeriods: readonly string[] = []) {
  const covered = new Set(coveredPeriods);
  const today = asOf.toISOString().slice(0, 10);
  let period = startsPeriod;
  // Each successful iteration consumes one distinct covered cycle, so even an
  // old anchor needs at most covered.size + 1 checks before finding a gap.
  while (weeklyTuitionChargeDateForPeriod(period).toISOString().slice(0, 10) <= today) {
    if (!covered.has(period)) return period;
    period = addWeeksToBillingPeriod(period, 2);
  }
  return null;
}

export function nextBiweeklyInvoiceDate(startsPeriod: string, delayWeeks: number, asOf: Date) {
  if (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(startsPeriod)) return null;
  const today = asOf.toISOString().slice(0, 10);
  const firstPeriod = tuitionInvoiceBillingPeriod(undefined, asOf, "biweekly", delayWeeks);
  for (let offset = 0; offset < 8; offset++) {
    const period = addWeeksToBillingPeriod(firstPeriod, offset);
    if (!shouldCreateRecurringTuitionInvoice({
      enabled: true, planId: "preview", amountCents: 1, startsPeriod, billingPeriod: period,
      billingDay: 4, currentDay: 4, cadence: "biweekly",
    })) continue;
    const date = weeklyTuitionChargeDateForPeriod(period, delayWeeks);
    if (date.toISOString().slice(0, 10) >= today) return date;
  }
  // A new assignment may start farther in the future than the preview window.
  const startDate = weeklyTuitionChargeDateForPeriod(startsPeriod, delayWeeks);
  return startDate.toISOString().slice(0, 10) >= today ? startDate : null;
}
