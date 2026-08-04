export const TUITION_CREDIT_CATEGORIES = [
  { id: "employee_discount", label: "Employee discount" },
  { id: "agency_discount", label: "Agency discount" },
  { id: "miscellaneous_credit", label: "Miscellaneous credit" },
  { id: "family_discount", label: "Family discount" },
  { id: "hero_discount", label: "Hero discount" },
] as const;

export type TuitionCreditCategory = (typeof TUITION_CREDIT_CATEGORIES)[number]["id"];

export type TuitionCredit = {
  category: TuitionCreditCategory;
  amountCents: number;
};

const categoryLabels = new Map<string, string>(
  TUITION_CREDIT_CATEGORIES.map((category) => [category.id, category.label]),
);

export function tuitionCreditLabel(category: TuitionCreditCategory) {
  return categoryLabels.get(category) ?? category;
}

export function normalizeTuitionCredits(value: unknown): TuitionCredit[] {
  if (!Array.isArray(value)) return [];
  const totals = new Map<TuitionCreditCategory, number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const category = typeof record.category === "string" && categoryLabels.has(record.category)
      ? record.category as TuitionCreditCategory
      : null;
    const amountCents = typeof record.amountCents === "number" && Number.isFinite(record.amountCents)
      ? Math.round(record.amountCents)
      : 0;
    if (!category || amountCents <= 0) continue;
    totals.set(category, (totals.get(category) ?? 0) + amountCents);
  }
  return TUITION_CREDIT_CATEGORIES.flatMap(({ id }) => {
    const amountCents = totals.get(id) ?? 0;
    return amountCents > 0 ? [{ category: id, amountCents }] : [];
  });
}

export function totalTuitionCreditsCents(credits: TuitionCredit[]) {
  return credits.reduce((total, credit) => total + credit.amountCents, 0);
}

export function tuitionInvoiceItems(input: {
  description: string;
  grossAmountCents: number;
  credits: TuitionCredit[];
}) {
  return [
    { description: input.description, amountCents: input.grossAmountCents, ledgerType: "tuition_charge" },
    ...input.credits.map((credit) => ({
      description: `${tuitionCreditLabel(credit.category)} - ${input.description}`,
      amountCents: -credit.amountCents,
      ledgerType: "tuition_credit",
      creditCategory: credit.category,
    })),
  ];
}
