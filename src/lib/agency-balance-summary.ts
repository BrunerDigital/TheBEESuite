import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgencyBalanceSummary } from "./balance-follow-up";

type SummaryRow = Omit<AgencyBalanceSummary, "centerName" | "outstandingCents" | "receivedCents" | "needsSubmissionCount" | "awaitingPaymentCount" | "overdueCount" | "pendingReviewCount" | "unappliedCents"> & {
  outstandingCents: bigint;
  receivedCents: bigint;
  needsSubmissionCount: bigint;
  awaitingPaymentCount: bigint;
  overdueCount: bigint;
  pendingReviewCount: bigint;
  unappliedCents: bigint;
};

// Aggregate all claims, including historical service periods. Former enrollment
// does not extinguish an agency receivable. These amounts never enter family AR.
export async function loadAgencyBalanceSummary(centerIds: string[], centerNameById: Record<string, string>, asOf: Date, db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma) {
  if (!centerIds.length) return [];
  const rows = await db.$queryRaw<SummaryRow[]>(Prisma.sql`
    SELECT program.id, program."centerId", program.name AS "agencyName",
      COALESCE(claims.outstanding, 0)::bigint AS "outstandingCents",
      COALESCE(claims.received, 0)::bigint AS "receivedCents",
      COALESCE(claims.submission, 0)::bigint AS "needsSubmissionCount",
      COALESCE(claims.awaiting, 0)::bigint AS "awaitingPaymentCount",
      COALESCE(claims.overdue, 0)::bigint AS "overdueCount",
      ledger."balanceCents" AS "ledgerBalanceCents",
      (COALESCE(deposits.review, 0) + COALESCE(adjustments.review, 0))::bigint AS "pendingReviewCount",
      COALESCE(deposits.unapplied, 0)::bigint AS "unappliedCents"
    FROM "AgencyProgram" program
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN claim.status IN ('submitted', 'approved', 'partially_paid')
          THEN GREATEST(COALESCE(claim."approvedCents", claim."claimedCents") - claim."paidCents", 0) ELSE 0 END) AS outstanding,
        SUM(claim."paidCents") AS received,
        COUNT(*) FILTER (WHERE claim.status IN ('draft', 'ready')) AS submission,
        COUNT(*) FILTER (WHERE claim.status IN ('submitted', 'approved', 'partially_paid')
          AND COALESCE(claim."approvedCents", claim."claimedCents") > claim."paidCents") AS awaiting,
        COUNT(*) FILTER (WHERE claim.status IN ('submitted', 'approved', 'partially_paid')
          AND COALESCE(claim."approvedCents", claim."claimedCents") > claim."paidCents"
          AND claim."dueDate"::date < ${asOf.toISOString().slice(0, 10)}::date) AS overdue
      FROM "SubsidyClaim" claim
      WHERE claim."agencyProgramId" = program.id AND claim."centerId" = program."centerId"
    ) claims ON true
    LEFT JOIN "AgencyLedgerAccount" ledger
      ON ledger."agencyProgramId" = program.id AND ledger."centerId" = program."centerId"
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE batch.status = 'pending_review') AS review,
        SUM(GREATEST(batch."unappliedCents", 0)) FILTER (WHERE batch."reviewedAt" IS NOT NULL AND batch.status <> 'rejected') AS unapplied
      FROM "AgencyRemittanceBatch" batch
      WHERE batch."agencyProgramId" = program.id AND batch."centerId" = program."centerId" AND batch."reversedAt" IS NULL
    ) deposits ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS review FROM "AgencyLedgerAdjustment" adjustment
      WHERE adjustment."agencyProgramId" = program.id AND adjustment."centerId" = program."centerId"
        AND adjustment.status = 'pending_review' AND adjustment."reversedAt" IS NULL
    ) adjustments ON true
    WHERE program."centerId" IN (${Prisma.join(centerIds)})
    ORDER BY COALESCE(claims.outstanding, 0) DESC, program.name, program.id
  `);
  return rows.map((row): AgencyBalanceSummary => ({
    ...row,
    centerName: centerNameById[row.centerId] ?? "School",
    outstandingCents: Number(row.outstandingCents), receivedCents: Number(row.receivedCents),
    needsSubmissionCount: Number(row.needsSubmissionCount), awaitingPaymentCount: Number(row.awaitingPaymentCount),
    overdueCount: Number(row.overdueCount), pendingReviewCount: Number(row.pendingReviewCount), unappliedCents: Number(row.unappliedCents),
  }));
}
