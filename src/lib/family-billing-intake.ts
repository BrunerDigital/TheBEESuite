export const FAMILY_BILLING_REPORT_CHECKLIST = [
  { title: "Families and children", detail: "Current enrollment and account reports with family, child, and guardian IDs, contacts, classrooms, and schedules." },
  { title: "Relationships and safety", detail: "Guardian/payer relationships, emergency contacts, approved pickups, and child safety information." },
  { title: "Balances and credits", detail: "Account balances as of one agreed date, including zero balances and credits. Include open invoices and payments needed to explain the totals." },
  { title: "Tuition and fees", detail: "Child billing contracts with amount, actual frequency, plan, effective date, discounts, fees, and family or agency responsibility." },
] as const;

export function supportedImportTuitionCadence(value: string): "weekly" | "biweekly" | "four_week" | "monthly" | null {
  const normalized = value.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["weekly", "week", "every_week"].includes(normalized)) return "weekly";
  if (["biweekly", "bi_weekly", "every_2_weeks"].includes(normalized)) return "biweekly";
  if (["four_week", "four_weeks", "4_week", "every_4_weeks"].includes(normalized)) return "four_week";
  if (["monthly", "month", "every_month"].includes(normalized)) return "monthly";
  return null;
}

export function validImportTuitionEffectiveDate(value: string, cadence: string | null) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  if (cadence !== "monthly" && /^\d{4}-W\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const week = Number(value.slice(6));
    const lastDay = new Date(Date.UTC(year, 11, 28));
    const day = lastDay.getUTCDay() || 7;
    lastDay.setUTCDate(lastDay.getUTCDate() + 4 - day);
    const maxWeek = Math.ceil((((lastDay.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1) / 7);
    return week >= 1 && week <= maxWeek;
  }
  return false;
}
