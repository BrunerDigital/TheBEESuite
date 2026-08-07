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

const SUBSIDY_MARKER = /subsid|voucher|ccdf|copay|co-pay|familyresponsibility|agencyresponsibility|fundingtype|\belc\b/i;
const SUBSIDY_KEY_MARKER = /subsid|voucher|ccdf|copay|co-pay|agencyresponsibility|agencyportion|\belc\b/i;

export function hasSubsidyResponsibilityEvidence(...values: unknown[]) {
  const visit = (value: unknown): boolean => {
    if (typeof value === "string") return SUBSIDY_MARKER.test(value);
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
      if (visit(item)) return true;
      if (!SUBSIDY_KEY_MARKER.test(key)) return false;
      if (typeof item === "number") return item > 0;
      if (typeof item === "boolean") return item;
      return item != null && String(item).trim() !== "" && !/^(?:0|false|none|family|private|private_pay)$/i.test(String(item).trim());
    });
  };
  return values.some(visit);
}

export function parentBalanceNeedsResponsibilityReview(input: {
  accountBalanceCents: number;
  agencyLedgerEntries: AgencyLedgerEntry[];
  responsibilityEvidence: unknown[];
}) {
  return input.accountBalanceCents > 0
    && hasSubsidyResponsibilityEvidence(...input.responsibilityEvidence)
    && !input.agencyLedgerEntries.some(isAgencyOnlyLedgerEntry);
}

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
  requestedAmountCents?: number;
  responsibilityReviewRequired?: boolean;
}) {
  if (input.responsibilityReviewRequired) {
    const requestedAmountCents = Math.max(0, Math.round(input.requestedAmountCents ?? 0));
    return Math.min(requestedAmountCents, Math.max(0, input.accountBalanceCents));
  }
  return Math.max(0, parentVisibleBillingBalanceCents(input));
}

export function isParentVisiblePayment(payment: { provider: string }) {
  return payment.provider.trim().toLowerCase() !== AGENCY_LEDGER_SOURCE_SYSTEM;
}
