export function filterFamilyLedgerEntries<T extends {
  billingAccount: { family: { id: string } };
}>(entries: readonly T[], familyId: string) {
  if (!familyId) return [];
  return entries.filter((entry) => entry.billingAccount.family.id === familyId);
}

type DatedLedgerEntry = {
  id: string;
  type: string;
  effectiveAt: Date | string;
  invoiceId?: string | null;
};

export function filterLedgerEntriesByDateRange<T extends DatedLedgerEntry>(
  entries: readonly T[],
  startDate: string,
  endDate: string,
  zonedDate: (value: Date | string) => string,
) {
  return entries.filter((entry) => {
    const date = zonedDate(entry.effectiveAt);
    return Boolean(date) && (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });
}

export function standardCustomerStatementEntries<T extends DatedLedgerEntry>(entries: readonly T[]) {
  const voidedInvoiceIds = new Set(entries.flatMap((entry) => (
    entry.type.trim().toLowerCase() === "invoice_void" && entry.invoiceId
      ? [entry.invoiceId]
      : []
  )));

  return entries.filter((entry) => {
    const type = entry.type.trim().toLowerCase();
    if (type === "invoice_void" || type.endsWith("_reversal")) return false;
    return !entry.invoiceId || !voidedInvoiceIds.has(entry.invoiceId);
  });
}
