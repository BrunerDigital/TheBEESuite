export type KioskWarning = {
  type: string;
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
  const balanceCents = safeCents(input.balanceCents);
  const invoiceTotalCents = safeCents(input.nextOpenInvoice?.totalCents);
  const amountCents = balanceCents > 0 ? balanceCents : invoiceTotalCents;
  if (amountCents <= 0) return null;

  const invoiceNumber = input.nextOpenInvoice?.number ? ` (${input.nextOpenInvoice.number})` : "";
  return {
    type: "tuition_balance_due",
    message: `Friendly reminder: tuition balance ${money(amountCents)}${invoiceNumber} is due. You can still check in now, and you can pay through The BEE Suite parent portal.`,
  };
}
