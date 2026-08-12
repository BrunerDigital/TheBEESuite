export type KioskWarning = {
  type: string;
  message: string;
};

export type KioskTuitionBalanceSummary = {
  balanceCents: number;
  amountDueCents: number;
  nextInvoiceNumber: string | null;
  nextInvoiceTotalCents: number;
  nextInvoiceDueDate: Date | string | null;
  paymentUrl: string;
  paymentLabel: string;
  message: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function safeCents(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function buildKioskTuitionBalanceWarning(input: {
  balanceCents?: number | null;
  nextOpenInvoice?: {
    number?: string | null;
    totalCents?: number | null;
    dueDate?: Date | string | null;
  } | null;
}): KioskWarning | null {
  const summary = buildKioskTuitionBalanceSummary(input);
  if (!summary) return null;

  return {
    type: "tuition_balance_due",
    message: summary.message,
  };
}

export function buildKioskTuitionBalanceSummary(input: {
  balanceCents?: number | null;
  nextOpenInvoice?: {
    number?: string | null;
    totalCents?: number | null;
    dueDate?: Date | string | null;
  } | null;
  paymentUrl?: string | null;
}): KioskTuitionBalanceSummary | null {
  const balanceCents = safeCents(input.balanceCents);
  const invoiceTotalCents = safeCents(input.nextOpenInvoice?.totalCents);
  const amountCents = balanceCents > 0 ? balanceCents : invoiceTotalCents;
  if (amountCents <= 0) return null;

  const invoiceNumber = input.nextOpenInvoice?.number ? ` (${input.nextOpenInvoice.number})` : "";
  return {
    balanceCents,
    amountDueCents: amountCents,
    nextInvoiceNumber: input.nextOpenInvoice?.number ?? null,
    nextInvoiceTotalCents: invoiceTotalCents,
    nextInvoiceDueDate: input.nextOpenInvoice?.dueDate ?? null,
    paymentUrl: input.paymentUrl || "/parent-portal?view=payments",
    paymentLabel: "Review or pay in the Parent Portal",
    message: `A tuition balance of ${money(amountCents)}${invoiceNumber} is on the family account. You can complete check-in now. Review or pay the balance in The BEE Suite Parent Portal.`,
  };
}
