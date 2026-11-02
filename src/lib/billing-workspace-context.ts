export const BILLING_SECTIONS = ["overview", "tuition", "payments", "ledger"] as const;
export type BillingSection = typeof BILLING_SECTIONS[number];
export function billingCategory(value?: string | null): "current" | "past" | "prospective" {
  return value === "past" || value === "prospective" ? value : "current";
}

export function billingSection(value?: string | null): BillingSection {
  return BILLING_SECTIONS.find(section => section === value) ?? "overview";
}

/** Persist exact authorized IDs in the current URL; never restore an account by name. */
export function billingContextUrl(href: string, context: { familyId: string; centerId: string; section: BillingSection; category?: string }, resetChild = false) {
  const url = new URL(href);
  for (const [key, value] of Object.entries({ familyId: context.familyId, centerId: context.centerId, billingSection: context.section })) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (resetChild) url.searchParams.delete("childId");
  if (context.category) url.searchParams.set("billingCategory", billingCategory(context.category));
  url.hash = "";
  return `${url.pathname}${url.search}`;
}

export function billingFamilySecondaryLabel(family: { id: string; billingEmail?: string | null; children?: Array<{ fullName: string }> }) {
  return [family.billingEmail, family.children?.map(child => child.fullName).join(", "), `Account ${family.id}`].filter(Boolean).join(" · ");
}
