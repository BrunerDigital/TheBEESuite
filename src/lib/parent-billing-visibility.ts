const AGENCY_LEDGER_ENTRY_TYPE_VALUES = [
  "agency_payment",
  "agency_receivable",
  "agency_voucher_credit",
  "subsidy_payment",
  "subsidy_receivable",
] as const;

export const AGENCY_LEDGER_ENTRY_TYPES: readonly string[] = AGENCY_LEDGER_ENTRY_TYPE_VALUES;
export const AGENCY_LEDGER_SOURCE_SYSTEM = "subsidy_agency";

type AgencyLedgerEntry = {
  type: string;
  sourceSystem?: string | null;
  amountCents: number;
};

export function isAgencyOnlyLedgerEntry(entry: Pick<AgencyLedgerEntry, "type" | "sourceSystem">) {
  return AGENCY_LEDGER_ENTRY_TYPES.includes(entry.type.trim().toLowerCase())
    || entry.sourceSystem?.trim().toLowerCase() === AGENCY_LEDGER_SOURCE_SYSTEM;
}

export function parentVisibleBillingBalanceCents(input: {
  accountBalanceCents: number;
  agencyLedgerEntries: AgencyLedgerEntry[];
}) {
  const agencyBalanceCents = input.agencyLedgerEntries
    .filter(isAgencyOnlyLedgerEntry)
    .reduce((total, entry) => total + entry.amountCents, 0);

  return input.accountBalanceCents - Math.max(0, agencyBalanceCents);
}

export function parentPaymentAmountCents(input: {
  accountBalanceCents: number;
  agencyLedgerEntries: AgencyLedgerEntry[];
}) {
  return Math.max(0, parentVisibleBillingBalanceCents(input));
}

export function isParentVisiblePayment(payment: { provider: string }) {
  return payment.provider.trim().toLowerCase() !== AGENCY_LEDGER_SOURCE_SYSTEM;
}
