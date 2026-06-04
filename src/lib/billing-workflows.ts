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

export function normalizeBillingPeriod(value: unknown, fallbackDate: Date) {
  const normalized = clean(value);
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  return fallbackDate.toISOString().slice(0, 7);
}

export function normalizeBatchTarget(value: unknown) {
  return clean(value).toLowerCase() === "family" ? "family" : "child";
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
