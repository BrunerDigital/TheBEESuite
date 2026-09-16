export const PAY_AHEAD_MAX_MONTHS = 12;

export function payAheadMonthCount(value: unknown) {
  const count = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(count) || count < 1 || count > PAY_AHEAD_MAX_MONTHS) return null;
  return count;
}

export function payAheadTotalCents(monthlyRateCents: number, monthCount: number) {
  if (!Number.isInteger(monthlyRateCents) || monthlyRateCents <= 0) throw new Error("Monthly tuition must be greater than zero.");
  const count = payAheadMonthCount(monthCount);
  if (!count) throw new Error(`Choose between 1 and ${PAY_AHEAD_MAX_MONTHS} months.`);
  return monthlyRateCents * count;
}

export function payAheadDescription(planName: string, monthCount: number) {
  const count = payAheadMonthCount(monthCount);
  if (!count) throw new Error(`Choose between 1 and ${PAY_AHEAD_MAX_MONTHS} months.`);
  return `${planName} · ${count} month${count === 1 ? "" : "s"} paid ahead`;
}
