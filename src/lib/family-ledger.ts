export function filterFamilyLedgerEntries<T extends {
  billingAccount: { family: { id: string } };
}>(entries: readonly T[], familyId: string) {
  if (!familyId) return [];
  return entries.filter((entry) => entry.billingAccount.family.id === familyId);
}

/** Display effective-date balances only when the complete account ledger reconciles.
 * Posting-time snapshots remain untouched, including imported opening balances.
 */
export function reconciledFamilyLedgerEntries<T extends {
  id: string;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: Date | string;
  createdAt?: Date | string;
}>(entries: readonly T[], accountBalanceCents: number | null): T[] {
  if (accountBalanceCents === null || !Number.isSafeInteger(accountBalanceCents)
    || entries.some(entry => !Number.isSafeInteger(entry.amountCents)
      || !Number.isFinite(new Date(entry.effectiveAt).getTime()))
    || entries.reduce((sum, entry) => sum + entry.amountCents, 0) !== accountBalanceCents) {
    return [...entries];
  }
  const chronological = [...entries].sort((left, right) =>
    new Date(left.effectiveAt).getTime() - new Date(right.effectiveAt).getTime()
    || new Date(left.createdAt ?? left.effectiveAt).getTime() - new Date(right.createdAt ?? right.effectiveAt).getTime()
    || left.id.localeCompare(right.id));
  let balance = 0;
  const balances = new Map(chronological.map(entry => {
    balance += entry.amountCents;
    return [entry.id, balance] as const;
  }));
  return entries.map(entry => ({ ...entry, balanceAfterCents: balances.get(entry.id)! }));
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
    if (type === "invoice_void") return false;
    return !entry.invoiceId || !voidedInvoiceIds.has(entry.invoiceId);
  });
}
