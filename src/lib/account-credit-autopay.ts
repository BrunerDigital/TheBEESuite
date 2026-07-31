function cents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function availableAccountCreditCents(input: {
  balanceCents: number;
  openInvoiceTotalCents: number;
  reservedCreditCents?: number;
}) {
  const openInvoiceTotalCents = Math.max(0, cents(input.openInvoiceTotalCents));
  const balanceCents = cents(input.balanceCents);
  const reservedCreditCents = Math.max(0, cents(input.reservedCreditCents ?? 0));
  const unappliedCreditCents = Math.min(
    openInvoiceTotalCents,
    Math.max(0, openInvoiceTotalCents - Math.max(0, balanceCents)),
  );
  return Math.max(0, unappliedCreditCents - reservedCreditCents);
}

export function allocateAccountCreditToInvoice(input: {
  invoiceTotalCents: number;
  availableCreditCents: number;
}) {
  const invoiceTotalCents = Math.max(0, cents(input.invoiceTotalCents));
  const accountCreditAppliedCents = Math.min(
    invoiceTotalCents,
    Math.max(0, cents(input.availableCreditCents)),
  );
  return {
    invoiceTotalCents,
    accountCreditAppliedCents,
    stripeChargePrincipalCents: invoiceTotalCents - accountCreditAppliedCents,
    fullyCoveredByCredit: invoiceTotalCents > 0 && accountCreditAppliedCents === invoiceTotalCents,
  };
}

