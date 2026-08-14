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
const GARLAND_ACCOUNT_REFLECTION_SOURCE_SHA256 = "6c95575a1aa967606605904e24e29135ef533f0dd47a10f0aa811d22e2afe418";
const GARLAND_PARENT_VISIBILITY_AUTHORIZATION = "user_requested_live_for_director_and_family";

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

export function hasConfirmedFamilyResponsibility(
  accountBalanceCents: number,
  latestLedgerEntryId: string | null,
  ...values: unknown[]
) {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    const fields = value as Record<string, unknown>;
    if (
      fields.familyResponsibilityConfirmed === true
      && Number.isInteger(fields.familyResponsibilityBalanceCents)
      && fields.familyResponsibilityBalanceCents === accountBalanceCents
      && fields.familyResponsibilityConfirmationSourceSha256 === GARLAND_ACCOUNT_REFLECTION_SOURCE_SHA256
      && fields.familyResponsibilityAuthorization === GARLAND_PARENT_VISIBILITY_AUTHORIZATION
      && typeof fields.familyResponsibilityConfirmationLedgerEntryId === "string"
      && fields.familyResponsibilityConfirmationLedgerEntryId === latestLedgerEntryId
      && fields.autopayActivated === false
    ) {
      return true;
    }
    return Object.values(fields).some(visit);
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
  const maximumParentPaymentCents = input.responsibilityReviewRequired
    ? Math.max(0, input.accountBalanceCents)
    : Math.max(0, parentVisibleBillingBalanceCents(input));
  const requestedAmountCents = Math.max(0, Math.round(input.requestedAmountCents ?? 0));

  if (input.responsibilityReviewRequired && requestedAmountCents <= 0) return 0;
  return requestedAmountCents > 0
    ? Math.min(requestedAmountCents, maximumParentPaymentCents)
    : maximumParentPaymentCents;
}

export function isParentVisiblePayment(payment: { provider: string }) {
  return payment.provider.trim().toLowerCase() !== AGENCY_LEDGER_SOURCE_SYSTEM;
}
