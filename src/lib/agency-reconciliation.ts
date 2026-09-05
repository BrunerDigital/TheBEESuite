import { createHash } from "node:crypto";

export const AGENCY_BATCH_STATUSES = [
  "unmatched",
  "pending_review",
  "partially_allocated",
  "reconciled",
  "exception",
  "rejected",
  "reversed",
] as const;

export const AGENCY_ADJUSTMENT_TYPES = [
  "write_off",
  "recoupment",
  "overpayment",
  "correction_increase",
  "correction_decrease",
] as const;

export const AGENCY_ACCOUNTING_ROLES = new Set([
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "BILLING_ADMIN",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeAgencyPaymentReference(value: unknown) {
  return clean(value).toUpperCase();
}

export function agencyRemittanceReferenceKey(input: { paymentMethod: string; externalReference: string }) {
  return `${clean(input.paymentMethod).toLowerCase()}:${normalizeAgencyPaymentReference(input.externalReference)}`;
}

export function agencyBatchFingerprint(input: {
  centerId: string;
  agencyProgramId: string;
  externalReference: string;
  paidAt: Date | string;
  paymentMethod: string;
  totalCents: number;
  notes?: string | null;
  evidenceName?: string | null;
  evidenceReference?: string | null;
  followUpDueAt?: Date | string | null;
  allocations: Array<{ claimId: string; amountCents: number; notes?: string | null }>;
}) {
  return hash({
    centerId: clean(input.centerId),
    agencyProgramId: clean(input.agencyProgramId),
    externalReference: normalizeAgencyPaymentReference(input.externalReference),
    paidAt: new Date(input.paidAt).toISOString(),
    paymentMethod: clean(input.paymentMethod).toLowerCase(),
    totalCents: Math.round(input.totalCents),
    notes: clean(input.notes),
    evidenceName: clean(input.evidenceName),
    evidenceReference: clean(input.evidenceReference),
    followUpDueAt: input.followUpDueAt ? new Date(input.followUpDueAt).toISOString() : "",
    allocations: [...input.allocations]
      .map((allocation) => ({ claimId: clean(allocation.claimId), amountCents: Math.round(allocation.amountCents), notes: clean(allocation.notes) }))
      .sort((left, right) => left.claimId.localeCompare(right.claimId)),
  });
}

export function agencyAllocationFingerprint(input: {
  batchId: string;
  claimId: string;
  amountCents: number;
  notes?: string | null;
}) {
  return hash({
    batchId: clean(input.batchId),
    claimId: clean(input.claimId),
    amountCents: Math.round(input.amountCents),
    notes: clean(input.notes),
  });
}

export function agencyAdjustmentFingerprint(input: {
  ledgerAccountId: string;
  claimId?: string | null;
  batchId?: string | null;
  type: string;
  amountCents: number;
  effectiveAt: Date | string;
  reason: string;
  evidenceName?: string | null;
  evidenceReference?: string | null;
  followUpDueAt?: Date | string | null;
}) {
  return hash({
    ledgerAccountId: clean(input.ledgerAccountId),
    claimId: clean(input.claimId),
    batchId: clean(input.batchId),
    type: clean(input.type),
    amountCents: Math.round(input.amountCents),
    effectiveAt: new Date(input.effectiveAt).toISOString(),
    reason: clean(input.reason),
    evidenceName: clean(input.evidenceName),
    evidenceReference: clean(input.evidenceReference),
    followUpDueAt: input.followUpDueAt ? new Date(input.followUpDueAt).toISOString() : "",
  });
}

export function signedAgencyAdjustmentCents(type: string, amountCents: number) {
  const cents = Math.max(0, Math.round(amountCents));
  if (!AGENCY_ADJUSTMENT_TYPES.includes(type as (typeof AGENCY_ADJUSTMENT_TYPES)[number])) return 0;
  return new Set(["write_off", "overpayment", "correction_decrease"]).has(type) ? -cents : cents;
}

export function agencyBatchStatus(input: { totalCents: number; allocatedCents: number; hasException?: boolean }) {
  if (input.hasException) return "exception";
  if (input.allocatedCents <= 0) return "unmatched";
  if (input.allocatedCents < input.totalCents) return "partially_allocated";
  return "reconciled";
}

export type AgencyAgingBucket = "current" | "days_1_30" | "days_31_60" | "days_61_90" | "days_91_plus";

export function agencyUtcCalendarRange(startDate: Date | string, endDate: Date | string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startInclusive = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endExclusive = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1));
  return { startInclusive, endExclusive };
}

export function agencyUtcAccountingDate(value: Date | string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isFutureAgencyAccountingDate(value: Date | string, now = new Date()) {
  return agencyUtcAccountingDate(value) > agencyUtcAccountingDate(now);
}

export function agencyReversalEffectiveAt(originalEffectiveAt: Date | string, now = new Date()) {
  const original = new Date(originalEffectiveAt);
  return now < original ? original : now;
}

export function agencyLedgerRunningBalances<T extends { id: string; amountCents: number }>(entries: T[], openingBalanceCents = 0) {
  let balanceAfterCents = openingBalanceCents;
  return entries.map((entry) => {
    balanceAfterCents += entry.amountCents;
    return { id: entry.id, balanceAfterCents };
  });
}

export function agencyUnappliedCashBalance(entries: Array<{ type: string; amountCents: number }>) {
  const unappliedTypes = new Set(["unapplied_cash", "unapplied_cash_allocation", "unapplied_cash_reversal"]);
  const balanceCents = -entries.reduce((total, entry) => unappliedTypes.has(entry.type) ? total + entry.amountCents : total, 0);
  return balanceCents === 0 ? 0 : balanceCents;
}

export function agencyAgingBucket(dueDate: Date | string | null | undefined, asOf = new Date()): AgencyAgingBucket {
  if (!dueDate) return "current";
  const due = new Date(dueDate);
  const asOfUtc = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const days = Math.floor((asOfUtc - dueUtc) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "days_1_30";
  if (days <= 60) return "days_31_60";
  if (days <= 90) return "days_61_90";
  return "days_91_plus";
}

export function isAgencyClaimOverdue(dueDate: Date | string | null | undefined, asOf = new Date()) {
  return agencyAgingBucket(dueDate, asOf) !== "current";
}

export function canCloseAgencyAccountingPeriod(role: string) {
  return AGENCY_ACCOUNTING_ROLES.has(role);
}

export function canReviewAgencyPosting(input: { role: string; reviewerId: string; requestedById: string }) {
  return AGENCY_ACCOUNTING_ROLES.has(input.role) && clean(input.reviewerId) !== clean(input.requestedById);
}
