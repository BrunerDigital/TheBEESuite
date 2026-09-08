export const ONE_TIME_BILLING_ADJUSTMENT_OPTIONS = [
  {
    id: "vacation_credit",
    label: "Vacation credit",
    buttonLabel: "Post vacation credit",
    adjustmentType: "credit",
    defaultDescription: "One-time vacation credit",
  },
  {
    id: "late_fee",
    label: "Late fee",
    buttonLabel: "Post late fee",
    adjustmentType: "debit",
    defaultDescription: "One-time late fee",
  },
  {
    id: "other_credit",
    label: "Other credit",
    buttonLabel: "Post other credit",
    adjustmentType: "credit",
    defaultDescription: "One-time account credit",
  },
  {
    id: "other_debit",
    label: "Other fee / debit",
    buttonLabel: "Post other fee / debit",
    adjustmentType: "debit",
    defaultDescription: "One-time account fee",
  },
] as const;

export type OneTimeBillingAdjustmentReason = (typeof ONE_TIME_BILLING_ADJUSTMENT_OPTIONS)[number]["id"];
export type OneTimeBillingAdjustmentType = (typeof ONE_TIME_BILLING_ADJUSTMENT_OPTIONS)[number]["adjustmentType"];

export function oneTimeBillingAdjustmentOption(value: unknown) {
  return ONE_TIME_BILLING_ADJUSTMENT_OPTIONS.find((option) => option.id === value) ?? null;
}

export function oneTimeBillingAdjustmentDescription(reason: OneTimeBillingAdjustmentReason, note?: string | null) {
  const option = oneTimeBillingAdjustmentOption(reason);
  if (!option) return "";
  const cleanNote = typeof note === "string" ? note.trim() : "";
  return cleanNote ? `${option.defaultDescription} - ${cleanNote}` : option.defaultDescription;
}

export function oneTimeBillingAdjustmentNeedsNote(reason: OneTimeBillingAdjustmentReason) {
  return reason === "other_credit" || reason === "other_debit";
}

export function normalizeOneTimeBillingAdjustmentEffectiveDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return value;
}

export function oneTimeBillingAdjustmentEffectiveAt(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}
