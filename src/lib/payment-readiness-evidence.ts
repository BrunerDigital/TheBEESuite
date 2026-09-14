type InvoiceEvidence = {
  id: string;
  status: string;
  ledgerEntries: Array<{
    id: string;
    billingAccountId: string;
    invoiceId: string | null;
    paymentId: string | null;
    type: string;
    amountCents: number;
    sourceSystem: string | null;
  }>;
};

/** Exclude only proven, fully cancelled tuition charges from an audit's positive evidence. */
export function fullyVoidedTuitionChargeIds(billingAccountId: string, invoices: InvoiceEvidence[]) {
  const cancelled = new Set<string>();
  for (const invoice of invoices) {
    const entries = invoice.ledgerEntries;
    if (invoice.status !== "VOID" || entries.length < 2) continue;
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) continue;
    if (entries.some(entry => entry.billingAccountId !== billingAccountId || entry.invoiceId !== invoice.id || entry.paymentId !== null || !Number.isSafeInteger(entry.amountCents))) continue;
    const charges = entries.filter(entry => entry.type === "tuition_charge" && entry.sourceSystem === "bee_suite" && entry.amountCents > 0);
    const voids = entries.filter(entry => entry.type === "invoice_void" && entry.sourceSystem === "bee_suite_manual" && entry.amountCents < 0);
    if (!charges.length || voids.length !== 1 || charges.length + voids.length !== entries.length) continue;
    const total = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (!Number.isSafeInteger(total) || total !== 0) continue;
    for (const charge of charges) cancelled.add(charge.id);
  }
  return cancelled;
}
