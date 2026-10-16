import { contractReportRange } from "./agency-contract-report";

export const AGENCY_REGISTER_LIMIT = 5000;
export const AGENCY_REGISTER_NOTE = "Each matching claim appears once with its full service period and full amounts, even when it crosses the selected dates. Do not add overlapping reports together. Payments applied are current, non-reversed receipts for those claims, regardless of receipt date; this is not a cash-by-week or historical balance report. Prepared claims are not approved receivables. Approved less payments excludes ledger adjustments, write-offs, and unapplied cash; it is not the agency ledger balance. Family copays are excluded. This report creates no claims, charges, approvals, or payments.";
export type RegisterClaim = {
  id: string; number: string; authorizationId: string | null; status: string;
  servicePeriodStart: Date; servicePeriodEnd: Date; claimedCents: number; approvedCents: number | null; paidCents: number;
  agencyProgram: { name: string }; authorization: { child: { fullName: string } } | null;
  remittances: Array<{ amountCents: number; reversedAt: Date | null }>;
};
export type RegisterAuthorization = {
  id: string; coverageStart: Date; coverageEnd: Date; status: string;
  agencyProgram: { name: string }; child: { fullName: string };
};
type Range = NonNullable<ReturnType<typeof contractReportRange>>;
const date = (value: Date) => value.toISOString().slice(0, 10);
const nextDay = (value: string, offset = 1) => date(new Date(new Date(`${value}T00:00:00Z`).getTime() + offset * 86400000));

export function agencyServiceRegister(claims: RegisterClaim[], authorizations: RegisterAuthorization[], range: Range) {
  const start = date(range.start), end = date(range.end);
  // Deduplicate before summing. Never apportion a multiweek claim without source allocations.
  const selected = [...new Map(claims.map(claim => [claim.id, claim])).values()]
    .filter(claim => date(claim.servicePeriodStart) <= end && date(claim.servicePeriodEnd) >= start);
  const rows = selected.map(claim => {
    const prepared = ["draft", "ready"].includes(claim.status);
    const approved = ["approved", "partially_paid", "paid"].includes(claim.status);
    const paymentsAppliedCents = claim.remittances.filter(receipt => !receipt.reversedAt).reduce((sum, receipt) => sum + receipt.amountCents, 0);
    const approvedAmountCents = approved ? claim.approvedCents : null;
    const review: string[] = [];
    if (paymentsAppliedCents !== claim.paidCents) review.push("Recorded payment total differs from active receipts; accounting review needed.");
    if (approved && approvedAmountCents === null) review.push("Approved amount is missing; no remaining balance inferred.");
    if ((!approved && paymentsAppliedCents !== 0) || (approvedAmountCents !== null && paymentsAppliedCents > approvedAmountCents)) review.push("Payments require accounting review.");
    if (!claim.authorization) review.push("No linked child authorization.");
    if (claim.authorizationId && claim.status !== "void" && selected.some(other => other.id !== claim.id && other.status !== "void"
      && other.authorizationId === claim.authorizationId && date(other.servicePeriodStart) <= date(claim.servicePeriodEnd)
      && date(other.servicePeriodEnd) >= date(claim.servicePeriodStart))) review.push("Another non-void claim overlaps this authorization's service dates; review before relying on totals.");
    const knownStatus = ["draft", "ready", "submitted", "approved", "partially_paid", "paid", "denied", "void"].includes(claim.status);
    if (!knownStatus) review.push("Unrecognized claim status; no receivable inferred.");
    return {
      id: claim.id, number: claim.number, childName: claim.authorization?.child.fullName ?? "No linked child", agencyName: claim.agencyProgram.name,
      serviceStart: date(claim.servicePeriodStart), serviceEnd: date(claim.servicePeriodEnd), status: claim.status,
      stage: prepared ? "Prepared — not submitted" : claim.status === "submitted" ? "Submitted — awaiting decision" : claim.status.replaceAll("_", " "),
      claimAmountCents: claim.claimedCents, approvedAmountCents, paymentsAppliedCents,
      approvedRemainingCents: approvedAmountCents === null ? null : Math.max(0, approvedAmountCents - paymentsAppliedCents),
      crossesSelection: date(claim.servicePeriodStart) < start || date(claim.servicePeriodEnd) > end,
      review,
    };
  });
  const totals = rows.reduce((sum, row) => ({
    preparedCents: sum.preparedCents + (["draft", "ready"].includes(row.status) ? row.claimAmountCents : 0),
    submittedCents: sum.submittedCents + (row.status === "submitted" ? row.claimAmountCents : 0),
    approvedCents: sum.approvedCents + (row.approvedAmountCents ?? 0),
    paymentsAppliedCents: sum.paymentsAppliedCents + row.paymentsAppliedCents,
    approvedRemainingCents: sum.approvedRemainingCents + (row.approvedRemainingCents ?? 0),
  }), { preparedCents: 0, submittedCents: 0, approvedCents: 0, paymentsAppliedCents: 0, approvedRemainingCents: 0 });
  const gaps: Array<{ authorizationId: string; childName: string; agencyName: string; start: string; end: string }> = [];
  for (const authorization of [...new Map(authorizations.map(item => [item.id, item])).values()]) {
    if (!["active", "expired"].includes(authorization.status)) continue;
    let cursor = [start, date(authorization.coverageStart)].sort()[1];
    const through = [end, date(authorization.coverageEnd)].sort()[0];
    if (cursor > through) continue;
    const covered = selected.filter(claim => claim.authorizationId === authorization.id && claim.status !== "void")
      .map(claim => ({ start: date(claim.servicePeriodStart), end: date(claim.servicePeriodEnd) })).sort((a, b) => a.start.localeCompare(b.start));
    const gap = (first: string, last: string) => gaps.push({ authorizationId: authorization.id, childName: authorization.child.fullName, agencyName: authorization.agencyProgram.name, start: first, end: last });
    for (const interval of covered) {
      if (interval.end < cursor || interval.start > through) continue;
      if (interval.start > cursor) gap(cursor, nextDay(interval.start, -1));
      cursor = [cursor, nextDay(interval.end)].sort()[1];
      if (cursor > through) break;
    }
    if (cursor <= through) gap(cursor, through);
  }
  return { start, end, rows, totals, gaps, authorizationCount: authorizations.length, note: AGENCY_REGISTER_NOTE };
}

export type AgencyServiceRegister = ReturnType<typeof agencyServiceRegister>;
