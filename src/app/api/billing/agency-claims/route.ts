import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import {
  activeRemittanceTotalCents,
  agencyClaimApprovalLedgerExternalId,
  agencyRemittanceLedgerExternalId,
  agencyRemittanceReversalLedgerExternalId,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  AGENCY_SUBMISSION_METHODS,
  agencyControlledLedgerSetupBlockers,
  agencyProgramSetupBlockers,
  agencyProgramStatus,
  agencyReconciliationActivationBlockers,
  claimAmountCents,
  claimSubmissionBlockers,
  nextRemittanceStatus,
  normalizeAgencyRequirements,
  normalizeStateCode,
  subsidyClaimNumber,
} from "@/lib/agency-subsidy-billing";
import {
  AGENCY_ADJUSTMENT_TYPES,
  agencyAdjustmentFingerprint,
  agencyAllocationFingerprint,
  agencyBatchFingerprint,
  agencyBatchStatus,
  agencyLedgerRunningBalances,
  agencyRemittanceReferenceKey,
  agencyReversalEffectiveAt,
  agencyUtcCalendarRange,
  canCloseAgencyAccountingPeriod,
  canReviewAgencyPosting,
  normalizeAgencyPaymentReference,
  isFutureAgencyAccountingDate,
  signedAgencyAdjustmentCents,
} from "@/lib/agency-reconciliation";
import { currentlyEnrolledStatusValues, isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";
import { AGENCY_LEDGER_ENTRY_TYPES } from "@/lib/parent-billing-visibility";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

const CURRENT_ENROLLMENT_STATUSES = currentlyEnrolledStatusValues();
const AUTHORIZATION_UNIT_TYPES = new Set(["weekly", "daily", "hourly", "monthly"]);
const REMITTANCE_METHODS = new Set(["ach", "check", "agency_portal", "other"]);
const SUBMISSION_METHODS = new Set<string>(AGENCY_SUBMISSION_METHODS);
const UNIT_PRECISION = 1_000_000;
const POSTGRES_INT_MAX_CENTS = 2_147_483_647;
const AGENCY_RECEIVABLE_CLAIM_STATUSES = new Set(["approved", "partially_paid", "paid"]);
const CLAIM_PAGE_SIZE = 100;
const AGENCY_LEDGER_ENTRY_LIMIT = 250;
const AGENCY_BATCH_LIMIT = 100;
const AGENCY_ADJUSTMENT_LIMIT = 100;
const AGENCY_CSV_EXPORT_MAX_ROWS = 100_000;
const AGENCY_CSV_EXPORT_MAX_BYTES = 64 * 1024 * 1024;
const ACTIVE_REMITTANCE_BATCH_STATUSES = ["pending_review", "unmatched", "partially_allocated", "exception", "reconciled"];
const OPEN_REMITTANCE_BATCH_STATUSES = new Set(["pending_review", "unmatched", "partially_allocated", "exception"]);
const REVERSIBLE_REMITTANCE_BATCH_STATUSES = new Set(ACTIVE_REMITTANCE_BATCH_STATUSES);
const AGENCY_READ_SNAPSHOT_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 10_000,
  timeout: 120_000,
} as const;
const AGENCY_WRITE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 120_000,
} as const;

class AgencyWorkflowError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type AgencySummaryRow = {
  claimedCents: bigint;
  approvedCents: bigint;
  paidCents: bigint;
  outstandingCents: bigint;
  needsSubmission: bigint;
  missingDocumentClaims: bigint;
};

type AgencyReconciliationClaimAggregateRow = {
  agencyProgramId: string;
  approvedCents: bigint;
  remittedCents: bigint;
  currentCents: bigint;
  days1To30Cents: bigint;
  days31To60Cents: bigint;
  days61To90Cents: bigint;
  days91PlusCents: bigint;
  overdueClaimCount: bigint;
};

type AgencyPeriodLedgerAggregateRow = {
  agencyProgramId: string;
  ledgerCents: bigint;
  unappliedLedgerCents: bigint;
};

type AgencyPeriodExpectedAggregateRow = {
  agencyProgramId: string;
  expectedCents: bigint;
  missingLedgerEventCount: bigint;
};

type RecoveredAgencyLedgerEventRow = {
  agencyLedgerAccountId: string;
};

type RecoveredAgencyLedgerEventCounts = {
  recoveredClaimReceivableCount: number;
  recoveredRemittanceReceivedCount: number;
  recoveredRemittanceReversalCount: number;
};

function prismaConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2028", "P2034"].includes(error.code);
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
}

function isBeforeUtcAccountingDay(candidate: Date, boundary: Date) {
  return Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate())
    < Date.UTC(boundary.getUTCFullYear(), boundary.getUTCMonth(), boundary.getUTCDate());
}

async function agencyReconciliationClaimAggregates(
  tx: Prisma.TransactionClient,
  centerIds: string[],
  asOf = new Date(),
  agencyProgramIds?: string[],
) {
  const today = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const days30Ago = new Date(today);
  const days60Ago = new Date(today);
  const days90Ago = new Date(today);
  days30Ago.setUTCDate(days30Ago.getUTCDate() - 30);
  days60Ago.setUTCDate(days60Ago.getUTCDate() - 60);
  days90Ago.setUTCDate(days90Ago.getUTCDate() - 90);
  const agencyProgramFilter = agencyProgramIds?.length
    ? Prisma.sql`AND claim."agencyProgramId" IN (${Prisma.join(agencyProgramIds)})`
    : Prisma.empty;
  return tx.$queryRaw<AgencyReconciliationClaimAggregateRow[]>(Prisma.sql`
    WITH claim_balances AS (
      SELECT claim."agencyProgramId",
        claim."dueDate",
        COALESCE(claim."approvedCents", claim."claimedCents")::bigint AS "approvedCents",
        claim."paidCents"::bigint AS "paidCents",
        COALESCE(SUM(remittance."amountCents") FILTER (WHERE remittance."reversedAt" IS NULL), 0)::bigint AS "remittedCents"
      FROM "SubsidyClaim" claim
      LEFT JOIN "SubsidyRemittance" remittance ON remittance."claimId" = claim.id
      WHERE claim."centerId" IN (${Prisma.join(centerIds)})
        ${agencyProgramFilter}
        AND claim."approvedCents" > 0
        AND claim.status IN ('approved', 'partially_paid', 'paid')
      GROUP BY claim.id, claim."agencyProgramId", claim."dueDate", claim."approvedCents", claim."claimedCents", claim."paidCents"
    ), claim_outstanding AS (
      SELECT *, GREATEST(0::bigint, "approvedCents" - "remittedCents") AS "outstandingCents"
      FROM claim_balances
    )
    SELECT "agencyProgramId",
      COALESCE(SUM("approvedCents"), 0)::bigint AS "approvedCents",
      COALESCE(SUM("remittedCents"), 0)::bigint AS "remittedCents",
      COALESCE(SUM("outstandingCents") FILTER (WHERE "dueDate" IS NULL OR "dueDate" >= ${today}), 0)::bigint AS "currentCents",
      COALESCE(SUM("outstandingCents") FILTER (WHERE "dueDate" < ${today} AND "dueDate" >= ${days30Ago}), 0)::bigint AS "days1To30Cents",
      COALESCE(SUM("outstandingCents") FILTER (WHERE "dueDate" < ${days30Ago} AND "dueDate" >= ${days60Ago}), 0)::bigint AS "days31To60Cents",
      COALESCE(SUM("outstandingCents") FILTER (WHERE "dueDate" < ${days60Ago} AND "dueDate" >= ${days90Ago}), 0)::bigint AS "days61To90Cents",
      COALESCE(SUM("outstandingCents") FILTER (WHERE "dueDate" < ${days90Ago}), 0)::bigint AS "days91PlusCents",
      COUNT(*) FILTER (WHERE "approvedCents" > "paidCents" AND "dueDate" IS NOT NULL AND "dueDate" < ${today})::bigint AS "overdueClaimCount"
    FROM claim_outstanding
    GROUP BY "agencyProgramId"
  `);
}

function cents(value: unknown) {
  const text = typeof value === "number" ? String(value) : clean(value).replace(/[$,]/g, "");
  if (!/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) return 0;
  const amount = Number(text) * 100;
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function validCurrencyInput(value: unknown, allowBlank = false) {
  const text = typeof value === "number" ? String(value) : clean(value).replace(/[$,]/g, "");
  return (allowBlank && !text) || /^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text);
}

function numberValue(value: unknown) {
  const text = typeof value === "number" ? String(value) : clean(value);
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return 0;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : 0;
}

function unitsAtPrecision(value: number) {
  return Math.round(value * UNIT_PRECISION);
}

function hasNumericInput(value: unknown) {
  return typeof value === "number" ? Number.isFinite(value) : Boolean(clean(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function agencyAllocationRows(value: unknown) {
  if (!Array.isArray(value)) return { allocations: [], hasDuplicateClaims: false, hasInvalidRows: value !== undefined };
  const seen = new Set<string>();
  const allocations: Array<{ claimId: string; amountCents: number; notes: string | null }> = [];
  let hasDuplicateClaims = false;
  let hasInvalidRows = false;
  for (const item of value) {
    const row = recordValue(item);
    const claimId = clean(row.claimId);
    const amountCents = cents(row.amountDollars);
    if (!claimId || !validCurrencyInput(row.amountDollars) || amountCents <= 0 || amountCents > POSTGRES_INT_MAX_CENTS) {
      hasInvalidRows = true;
      continue;
    }
    if (seen.has(claimId)) {
      hasDuplicateClaims = true;
      continue;
    }
    seen.add(claimId);
    allocations.push({ claimId, amountCents, notes: clean(row.notes) || null });
  }
  return { allocations, hasDuplicateClaims, hasInvalidRows };
}

async function assertAgencyPeriodOpen(tx: Prisma.TransactionClient, centerId: string, effectiveAt: Date) {
  const accountingDate = dateValue(dateInput(effectiveAt)) ?? effectiveAt;
  const closed = await tx.agencyAccountingPeriod.findFirst({
    where: { centerId, status: "closed", endDate: { gte: accountingDate } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: { name: true },
  });
  if (closed) throw new AgencyWorkflowError(`${closed.name} or a later accounting period is closed. Post a current-period correcting entry instead of backdating this transaction.`, 409);
}

async function requireAgencyReconciliationEnabled(tx: Prisma.TransactionClient, centerId: string) {
  const center = await tx.center.findUnique({
    where: { id: centerId },
    select: {
      agencyReconciliationEnabled: true,
      agencyPrograms: {
        where: { status: "active" },
        select: {
          name: true,
          status: true,
          receivableGlCode: true,
          cashGlCode: true,
          adjustmentGlCode: true,
          costCenterCode: true,
        },
      },
    },
  });
  if (!center?.agencyReconciliationEnabled) {
    throw new AgencyWorkflowError("The reviewed agency reconciliation workflow is not activated for this school. Continue using the existing direct remittance process.", 409);
  }
  const blockers = agencyReconciliationActivationBlockers(center.agencyPrograms);
  if (blockers.length) {
    throw new AgencyWorkflowError(`Reviewed agency reconciliation is blocked until every active program has complete accounting mappings. ${blockers.join(" ")}`, 409);
  }
}

async function agencyReconciliationVarianceCount(tx: Prisma.TransactionClient, centerId: string, endExclusive: Date) {
  const [ledgerAggregates, claimAggregates, remittanceAggregates, adjustmentAggregates] = await Promise.all([
    tx.$queryRaw<AgencyPeriodLedgerAggregateRow[]>`
      SELECT account."agencyProgramId",
        COALESCE(SUM(entry."amountCents"), 0)::bigint AS "ledgerCents",
        COALESCE(SUM(entry."amountCents") FILTER (
          WHERE entry.type IN ('unapplied_cash', 'unapplied_cash_allocation', 'unapplied_cash_reversal')
        ), 0)::bigint AS "unappliedLedgerCents"
      FROM "AgencyLedgerAccount" account
      LEFT JOIN "AgencyLedgerEntry" entry
        ON entry."agencyLedgerAccountId" = account.id
        AND entry."effectiveAt" < ${endExclusive}
      WHERE account."centerId" = ${centerId}
      GROUP BY account."agencyProgramId"
    `,
    tx.$queryRaw<AgencyPeriodExpectedAggregateRow[]>`
      WITH scoped_claims AS (
        SELECT claim."agencyProgramId",
          COALESCE(claim."approvedCents", claim."claimedCents")::bigint AS "approvedCents",
          COALESCE(approval."effectiveAt", claim."approvedAt", claim."createdAt") AS "approvalEffectiveAt",
          approval.id AS "approvalEntryId"
        FROM "SubsidyClaim" claim
        LEFT JOIN LATERAL (
          SELECT entry.id, entry."effectiveAt"
          FROM "AgencyLedgerEntry" entry
          WHERE entry."claimId" = claim.id
            AND entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND entry.type = 'claim_approved'
          ORDER BY entry."effectiveAt" ASC, entry."createdAt" ASC, entry.id ASC
          LIMIT 1
        ) approval ON TRUE
        WHERE claim."centerId" = ${centerId}
          AND claim."approvedCents" > 0
          AND claim.status IN ('approved', 'partially_paid', 'paid')
      )
      SELECT "agencyProgramId",
        COALESCE(SUM("approvedCents") FILTER (WHERE "approvalEffectiveAt" < ${endExclusive}), 0)::bigint AS "expectedCents",
        COUNT(*) FILTER (WHERE "approvalEffectiveAt" < ${endExclusive} AND "approvalEntryId" IS NULL)::bigint AS "missingLedgerEventCount"
      FROM scoped_claims
      GROUP BY "agencyProgramId"
    `,
    tx.$queryRaw<AgencyPeriodExpectedAggregateRow[]>`
      WITH scoped_remittances AS (
        SELECT remittance.id,
          remittance."amountCents",
          remittance."paidAt",
          remittance."reversedAt",
          claim."agencyProgramId"
        FROM "SubsidyRemittance" remittance
        JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
        WHERE claim."centerId" = ${centerId}
      ), remittance_events AS (
        SELECT remittance.id,
          remittance."amountCents",
          remittance."paidAt",
          remittance."reversedAt",
          remittance."agencyProgramId",
          COALESCE(BOOL_OR(entry.type = 'remittance_received' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "receivedBeforeEnd",
          COALESCE(BOOL_OR(entry.type = 'remittance_received'), FALSE) AS "receivedAny",
          COALESCE(BOOL_OR(entry.type = 'remittance_reversal' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "reversalBeforeEnd",
          COALESCE(BOOL_OR(entry.type = 'remittance_reversal'), FALSE) AS "reversalAny"
        FROM scoped_remittances remittance
        LEFT JOIN "AgencyLedgerEntry" entry
          ON entry."remittanceId" = remittance.id
          AND entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
        GROUP BY remittance.id, remittance."amountCents", remittance."paidAt", remittance."reversedAt", remittance."agencyProgramId"
      ), applicable_remittances AS (
        SELECT *
        FROM remittance_events
        WHERE "receivedBeforeEnd"
          OR ("paidAt" < ${endExclusive} AND NOT "receivedAny")
          OR "reversalBeforeEnd"
          OR ("reversedAt" < ${endExclusive} AND NOT "reversalAny")
      )
      SELECT "agencyProgramId",
        COALESCE(SUM(
          CASE WHEN "receivedBeforeEnd" OR ("paidAt" < ${endExclusive} AND NOT "receivedAny") THEN -"amountCents" ELSE 0 END
          + CASE WHEN "reversalBeforeEnd" OR ("reversedAt" < ${endExclusive} AND NOT "reversalAny") THEN "amountCents" ELSE 0 END
        ), 0)::bigint AS "expectedCents",
        COALESCE(SUM(
          CASE WHEN "paidAt" < ${endExclusive} AND NOT "receivedAny" THEN 1 ELSE 0 END
          + CASE WHEN "reversedAt" < ${endExclusive} AND NOT "reversalAny" THEN 1 ELSE 0 END
        ), 0)::bigint AS "missingLedgerEventCount"
      FROM applicable_remittances
      GROUP BY "agencyProgramId"
    `,
    tx.$queryRaw<AgencyPeriodExpectedAggregateRow[]>`
      WITH scoped_adjustments AS (
        SELECT adjustment.id,
          adjustment."agencyProgramId",
          adjustment."amountCents",
          adjustment."effectiveAt",
          adjustment."reversedAt"
        FROM "AgencyLedgerAdjustment" adjustment
        WHERE adjustment."centerId" = ${centerId}
          AND adjustment."reviewedAt" IS NOT NULL
          AND adjustment.status <> 'rejected'
      ), adjustment_events AS (
        SELECT adjustment.id,
          adjustment."agencyProgramId",
          adjustment."amountCents",
          adjustment."effectiveAt",
          adjustment."reversedAt",
          COALESCE(BOOL_OR(entry.type LIKE 'adjustment_%' AND entry.type <> 'adjustment_reversal' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "adjustmentBeforeEnd",
          COALESCE(BOOL_OR(entry.type LIKE 'adjustment_%' AND entry.type <> 'adjustment_reversal'), FALSE) AS "adjustmentAny",
          COALESCE(BOOL_OR(entry.type = 'adjustment_reversal' AND entry."effectiveAt" < ${endExclusive}), FALSE) AS "reversalBeforeEnd",
          COALESCE(BOOL_OR(entry.type = 'adjustment_reversal'), FALSE) AS "reversalAny"
        FROM scoped_adjustments adjustment
        LEFT JOIN "AgencyLedgerEntry" entry
          ON entry."adjustmentId" = adjustment.id
          AND entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
        GROUP BY adjustment.id, adjustment."agencyProgramId", adjustment."amountCents", adjustment."effectiveAt", adjustment."reversedAt"
      ), applicable_adjustments AS (
        SELECT *
        FROM adjustment_events
        WHERE "adjustmentBeforeEnd"
          OR ("effectiveAt" < ${endExclusive} AND NOT "adjustmentAny")
          OR "reversalBeforeEnd"
          OR ("reversedAt" < ${endExclusive} AND NOT "reversalAny")
      )
      SELECT "agencyProgramId",
        COALESCE(SUM(
          CASE WHEN "adjustmentBeforeEnd" OR ("effectiveAt" < ${endExclusive} AND NOT "adjustmentAny") THEN "amountCents" ELSE 0 END
          + CASE WHEN "reversalBeforeEnd" OR ("reversedAt" < ${endExclusive} AND NOT "reversalAny") THEN -"amountCents" ELSE 0 END
        ), 0)::bigint AS "expectedCents",
        COALESCE(SUM(
          CASE WHEN "effectiveAt" < ${endExclusive} AND NOT "adjustmentAny" THEN 1 ELSE 0 END
          + CASE WHEN "reversedAt" < ${endExclusive} AND NOT "reversalAny" THEN 1 ELSE 0 END
        ), 0)::bigint AS "missingLedgerEventCount"
      FROM applicable_adjustments
      GROUP BY "agencyProgramId"
    `,
  ]);
  const totals = new Map<string, { expected: number; ledger: number }>();
  const row = (agencyProgramId: string) => {
    const current = totals.get(agencyProgramId) ?? { expected: 0, ledger: 0 };
    totals.set(agencyProgramId, current);
    return current;
  };
  for (const aggregate of ledgerAggregates) {
    const current = row(aggregate.agencyProgramId);
    current.ledger += Number(aggregate.ledgerCents);
    current.expected += Number(aggregate.unappliedLedgerCents);
  }
  let missingLedgerEventCount = 0;
  for (const aggregate of [...claimAggregates, ...remittanceAggregates, ...adjustmentAggregates]) {
    row(aggregate.agencyProgramId).expected += Number(aggregate.expectedCents);
    missingLedgerEventCount += Number(aggregate.missingLedgerEventCount);
  }
  const netVarianceCount = [...totals.values()].filter((current) => current.ledger !== current.expected).length;
  return netVarianceCount + missingLedgerEventCount;
}

async function agencyClaimSourceConflictCount(tx: Prisma.TransactionClient, centerId: string, endExclusive: Date) {
  const [result] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    WITH claim_sources AS (
      SELECT claim.id,
        claim.status,
        claim."approvedCents",
        claim."claimedCents",
        claim."paidCents"::bigint AS "paidCents",
        (COALESCE(approval."effectiveAt", claim."approvedAt", claim."createdAt") < ${endExclusive}
          OR COALESCE(BOOL_OR(remittance."paidAt" < ${endExclusive}), FALSE)) AS "sourceInScope",
        COUNT(remittance.id) FILTER (
          WHERE remittance."paidAt" >= ${endExclusive}
             OR remittance."reversedAt" >= ${endExclusive}
        )::bigint AS "laterFinancialEventCount",
        COALESCE(SUM(remittance."amountCents") FILTER (
          WHERE remittance."paidAt" < ${endExclusive}
            AND (remittance."reversedAt" IS NULL OR remittance."reversedAt" >= ${endExclusive})
        ), 0)::bigint AS "activeRemittanceCents"
      FROM "SubsidyClaim" claim
      LEFT JOIN "SubsidyRemittance" remittance ON remittance."claimId" = claim.id
      LEFT JOIN "AgencyLedgerEntry" approval
        ON approval."claimId" = claim.id
       AND approval."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
       AND approval.type = 'claim_approved'
      WHERE claim."centerId" = ${centerId}
      GROUP BY claim.id, claim.status, claim."approvedCents", claim."claimedCents", claim."paidCents", approval."effectiveAt", claim."approvedAt", claim."createdAt"
    )
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM claim_sources
    WHERE "sourceInScope" AND (
      COALESCE("approvedCents", 0) <= 0
      OR "approvedCents" > "claimedCents"
      OR ("laterFinancialEventCount" = 0 AND (
        status NOT IN ('approved', 'partially_paid', 'paid')
        OR "paidCents" <> "activeRemittanceCents"
        OR (status = 'approved' AND "activeRemittanceCents" <> 0)
        OR (status = 'partially_paid' AND ("activeRemittanceCents" <= 0 OR "activeRemittanceCents" >= "approvedCents"))
        OR (status = 'paid' AND "activeRemittanceCents" <> "approvedCents")
      ))
    )
  `;
  return Number(result?.conflictCount ?? 0);
}

function claimRequirements(claim: {
  agencyProgram: { requirements?: unknown };
  authorization?: { requiredDocuments?: unknown } | null;
}) {
  return [
    ...normalizeAgencyRequirements(claim.agencyProgram.requirements),
    ...normalizeAgencyRequirements(claim.authorization?.requiredDocuments),
  ].filter((item, index, all) => item.required && all.findIndex((candidate) => candidate.key === item.key) === index);
}

function csvRow(values: unknown[]) {
  return `${values.map((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const text = String(value ?? "");
    const formulaSafeText = typeof value === "string" && /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${formulaSafeText.replaceAll('"', '""')}"`;
  }).join(",")}\r\n`;
}

type AgencyLedgerClaimInput = {
  id: string;
  centerId: string;
  agencyProgramId: string;
  number: string;
  status: string;
  approvedCents: number | null;
  approvedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  externalReference: string | null;
  agencyProgram: { name: string; centerId: string };
  authorization?: { agencyProgramId: string } | null;
};

async function recalculateAgencyLedgerBalances(tx: Prisma.TransactionClient, agencyLedgerAccountId: string) {
  const [bounds] = await tx.$queryRaw<Array<{ minimumBalanceCents: bigint | null; maximumBalanceCents: bigint | null }>>`
    WITH running AS (
      SELECT SUM("amountCents"::bigint) OVER (
        ORDER BY "effectiveAt" ASC, "createdAt" ASC, id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS "balanceCents"
      FROM "AgencyLedgerEntry"
      WHERE "agencyLedgerAccountId" = ${agencyLedgerAccountId}
    )
    SELECT MIN("balanceCents") AS "minimumBalanceCents", MAX("balanceCents") AS "maximumBalanceCents"
    FROM running
  `;
  if (
    (bounds?.minimumBalanceCents !== null && bounds?.minimumBalanceCents !== undefined && bounds.minimumBalanceCents < BigInt(-POSTGRES_INT_MAX_CENTS - 1))
    || (bounds?.maximumBalanceCents !== null && bounds?.maximumBalanceCents !== undefined && bounds.maximumBalanceCents > BigInt(POSTGRES_INT_MAX_CENTS))
  ) {
    throw new AgencyWorkflowError("This posting would exceed the supported agency-ledger balance range. No financial entry was committed.", 409);
  }
  await tx.$executeRaw`
    WITH running AS (
      SELECT id,
        SUM("amountCents") OVER (
          ORDER BY "effectiveAt" ASC, "createdAt" ASC, id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::integer AS "balanceAfterCents"
      FROM "AgencyLedgerEntry"
      WHERE "agencyLedgerAccountId" = ${agencyLedgerAccountId}
    )
    UPDATE "AgencyLedgerEntry" AS ledger_entry
    SET "balanceAfterCents" = running."balanceAfterCents"
    FROM running
    WHERE ledger_entry.id = running.id
      AND ledger_entry."balanceAfterCents" IS DISTINCT FROM running."balanceAfterCents"
  `;
  const latestEntry = await tx.agencyLedgerEntry.findFirst({
    where: { agencyLedgerAccountId },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { balanceAfterCents: true },
  });
  return tx.agencyLedgerAccount.update({
    where: { id: agencyLedgerAccountId },
    data: { balanceCents: latestEntry?.balanceAfterCents ?? 0 },
  });
}

async function appendAgencyLedgerEntry(tx: Prisma.TransactionClient, input: {
  centerId: string;
  agencyProgramId: string;
  claimId?: string | null;
  remittanceId?: string | null;
  remittanceBatchId?: string | null;
  adjustmentId?: string | null;
  type: string;
  description: string;
  amountCents: number;
  effectiveAt: Date;
  externalReference?: string | null;
  externalId: string;
  metadata?: Prisma.InputJsonValue;
  accountingSnapshot?: { glCode: string | null; costCenterCode: string | null };
}, options: { recalculate?: boolean } = {}) {
  const account = await tx.agencyLedgerAccount.upsert({
    where: { centerId_agencyProgramId: { centerId: input.centerId, agencyProgramId: input.agencyProgramId } },
    create: { centerId: input.centerId, agencyProgramId: input.agencyProgramId, balanceCents: 0 },
    update: { balanceCents: { increment: 0 } },
    include: { agencyProgram: { select: { receivableGlCode: true, cashGlCode: true, adjustmentGlCode: true, costCenterCode: true } } },
  });
  const entry = await tx.agencyLedgerEntry.create({ data: {
    agencyLedgerAccountId: account.id,
    claimId: input.claimId || null,
    remittanceId: input.remittanceId || null,
    remittanceBatchId: input.remittanceBatchId || null,
    adjustmentId: input.adjustmentId || null,
    type: input.type,
    description: input.description,
    amountCents: input.amountCents,
    balanceAfterCents: 0,
    effectiveAt: input.effectiveAt,
    externalReference: input.externalReference || null,
    glCodeSnapshot: input.accountingSnapshot ? input.accountingSnapshot.glCode : agencyEntryGlCode(input.type, account.agencyProgram),
    costCenterCodeSnapshot: input.accountingSnapshot ? input.accountingSnapshot.costCenterCode : account.agencyProgram.costCenterCode,
    sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
    externalId: input.externalId,
    metadata: input.metadata,
  } });
  if (options.recalculate === false) return { account, entry };
  const updatedAccount = await recalculateAgencyLedgerBalances(tx, account.id);
  const updatedEntry = await tx.agencyLedgerEntry.findUniqueOrThrow({ where: { id: entry.id } });
  return { account: updatedAccount, entry: updatedEntry };
}

async function ensureAgencyClaimReceivable(tx: Prisma.TransactionClient, claim: AgencyLedgerClaimInput, options: { recalculate?: boolean } = {}) {
  if (claim.agencyProgram.centerId !== claim.centerId) throw new AgencyWorkflowError("The claim and agency program school relationship is inconsistent. No receivable was posted.", 409);
  if (claim.authorization && claim.authorization.agencyProgramId !== claim.agencyProgramId) throw new AgencyWorkflowError("The claim and authorization agency relationship is inconsistent. No receivable was posted.", 409);
  const approvedCents = claim.approvedCents ?? 0;
  if (approvedCents <= 0 || !AGENCY_RECEIVABLE_CLAIM_STATUSES.has(claim.status)) throw new AgencyWorkflowError("Record a supported positive agency approval before creating its receivable.", 409);
  // Legacy approvals can have no approvedAt. createdAt is the only stable fallback;
  // updatedAt changes after payments and must never rewrite approval chronology.
  const effectiveAt = claim.approvedAt ?? claim.createdAt;
  const externalId = agencyClaimApprovalLedgerExternalId(claim.id);
  const existing = await tx.agencyLedgerEntry.findUnique({
    where: { sourceSystem_externalId: { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM, externalId } },
    include: { agencyLedgerAccount: { select: { centerId: true, agencyProgramId: true } } },
  });
  if (existing) {
    if (existing.agencyLedgerAccount.centerId !== claim.centerId
      || existing.agencyLedgerAccount.agencyProgramId !== claim.agencyProgramId
      || existing.claimId !== claim.id
      || existing.remittanceId !== null
      || existing.type !== "claim_approved"
      || existing.amountCents !== approvedCents
      || existing.effectiveAt.getTime() !== effectiveAt.getTime()
      || existing.externalReference !== claim.externalReference) {
      throw new AgencyWorkflowError("The existing agency receivable conflicts with the current approved claim evidence.", 409);
    }
    return { entry: existing, created: false };
  }
  await assertAgencyPeriodOpen(tx, claim.centerId, effectiveAt);
  const result = await appendAgencyLedgerEntry(tx, {
    centerId: claim.centerId,
    agencyProgramId: claim.agencyProgramId,
    claimId: claim.id,
    type: "claim_approved",
    description: `${claim.agencyProgram.name} approved ${claim.number}`,
    amountCents: approvedCents,
    effectiveAt,
    externalReference: claim.externalReference,
    externalId,
    metadata: { claimNumber: claim.number },
  }, options);
  return { entry: result.entry, created: true };
}

async function recoverMissingAgencyLedgerCutoverEvents(
  tx: Prisma.TransactionClient,
  centerId: string,
  endExclusive: Date,
  recoveredById: string,
): Promise<RecoveredAgencyLedgerEventCounts> {
  const [scopeConflict] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    /* agency-close:scope-evidence */
    WITH scope_conflicts AS (
      SELECT 'claim:' || claim.id AS id
      FROM "SubsidyClaim" claim
      JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
      LEFT JOIN "SubsidyAuthorization" authorization_row ON authorization_row.id = claim."authorizationId"
      WHERE claim."centerId" = ${centerId}
        AND (program."centerId" <> claim."centerId"
          OR (authorization_row.id IS NOT NULL AND (
            authorization_row."centerId" <> claim."centerId"
            OR authorization_row."agencyProgramId" <> claim."agencyProgramId"
          )))
      UNION ALL
      SELECT 'remittance:' || remittance.id
      FROM "SubsidyRemittance" remittance
      JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
      JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
      JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
      WHERE (claim."centerId" = ${centerId} OR batch."centerId" = ${centerId})
        AND (allocation."claimId" <> claim.id
          OR batch."centerId" <> claim."centerId"
          OR batch."agencyProgramId" <> claim."agencyProgramId")
      UNION ALL
      SELECT 'adjustment:' || adjustment.id
      FROM "AgencyLedgerAdjustment" adjustment
      JOIN "AgencyLedgerAccount" account ON account.id = adjustment."ledgerAccountId"
      LEFT JOIN "SubsidyClaim" claim ON claim.id = adjustment."claimId"
      LEFT JOIN "AgencyRemittanceBatch" batch ON batch.id = adjustment."batchId"
      WHERE adjustment."centerId" = ${centerId}
        AND (account."centerId" <> adjustment."centerId"
          OR account."agencyProgramId" <> adjustment."agencyProgramId"
          OR (claim.id IS NOT NULL AND (
            claim."centerId" <> adjustment."centerId"
            OR claim."agencyProgramId" <> adjustment."agencyProgramId"
          ))
          OR (batch.id IS NOT NULL AND (
            batch."centerId" <> adjustment."centerId"
            OR batch."agencyProgramId" <> adjustment."agencyProgramId"
          )))
    )
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM scope_conflicts
  `;
  if (Number(scopeConflict?.conflictCount ?? 0) > 0) throw new AgencyWorkflowError("Agency ledger close found source evidence outside its exact claim, school, program, batch, or account scope.", 409);
  // These source rows and their events commit atomically in the application, and the
  // migrations backfill pre-cutover history. Neither carries enough event-time mapping
  // evidence to reconstruct a missing event safely at close, so fail closed instead.
  const [claimEvidenceConflict] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    /* agency-close:claim-evidence */
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM "SubsidyClaim" claim
    WHERE claim."centerId" = ${centerId}
      AND claim."approvedCents" > 0
      AND claim.status IN ('approved', 'partially_paid', 'paid')
      AND COALESCE(claim."approvedAt", claim."createdAt") < ${endExclusive}
      AND (
        (SELECT COUNT(*)
         FROM "AgencyLedgerEntry" candidate
         WHERE (candidate."claimId" = claim.id AND candidate.type = 'claim_approved')
            OR (candidate."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
              AND candidate."externalId" = 'claim-approved:' || claim.id)) <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM "AgencyLedgerEntry" entry
          JOIN "AgencyLedgerAccount" account ON account.id = entry."agencyLedgerAccountId"
          WHERE entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND entry."externalId" = 'claim-approved:' || claim.id
            AND entry.type = 'claim_approved'
            AND entry."claimId" = claim.id
            AND entry."remittanceId" IS NULL
            AND entry."remittanceBatchId" IS NULL
            AND entry."adjustmentId" IS NULL
            AND entry."amountCents" = claim."approvedCents"
            AND entry."effectiveAt" = COALESCE(claim."approvedAt", claim."createdAt")
            AND entry."externalReference" IS NOT DISTINCT FROM claim."externalReference"
            AND account."centerId" = claim."centerId"
            AND account."agencyProgramId" = claim."agencyProgramId"
        )
      )
  `;
  if (Number(claimEvidenceConflict?.conflictCount ?? 0) > 0) {
    throw new AgencyWorkflowError("Agency ledger close found a missing, duplicate, or conflicting claim-approval event. Restore and verify its immutable evidence before closing the period.", 409);
  }

  const [directReceiptEvidenceConflict] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    /* agency-close:direct-receipt-evidence */
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM "SubsidyRemittance" remittance
    JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
    WHERE claim."centerId" = ${centerId}
      AND remittance."paidAt" < ${endExclusive}
      AND NOT EXISTS (
        SELECT 1
        FROM "AgencyRemittanceAllocation" allocation
        WHERE allocation."remittanceId" = remittance.id
      )
      AND (
        remittance."amountCents" <= 0
        OR NULLIF(BTRIM(remittance."externalReference"), '') IS NULL
        OR remittance."paymentMethod" NOT IN ('ach', 'check', 'agency_portal', 'other')
        OR NULLIF(BTRIM(remittance."enteredById"), '') IS NULL
        OR (SELECT COUNT(*)
            FROM "AgencyLedgerEntry" candidate
            WHERE (candidate."remittanceId" = remittance.id AND candidate.type = 'remittance_received')
               OR (candidate."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
                 AND candidate."externalId" = 'remittance:' || remittance.id)) <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM "AgencyLedgerEntry" entry
          JOIN "AgencyLedgerAccount" account ON account.id = entry."agencyLedgerAccountId"
          WHERE entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND entry."externalId" = 'remittance:' || remittance.id
            AND entry.type = 'remittance_received'
            AND entry."claimId" = claim.id
            AND entry."remittanceId" = remittance.id
            AND entry."remittanceBatchId" IS NULL
            AND entry."adjustmentId" IS NULL
            AND entry."amountCents" = -remittance."amountCents"
            AND entry."effectiveAt" = remittance."paidAt"
            AND entry."externalReference" = remittance."externalReference"
            AND account."centerId" = claim."centerId"
            AND account."agencyProgramId" = claim."agencyProgramId"
        )
      )
  `;
  if (Number(directReceiptEvidenceConflict?.conflictCount ?? 0) > 0) {
    throw new AgencyWorkflowError("Agency ledger close found a missing, duplicate, or conflicting direct-remittance receipt. Direct receipts cannot be reconstructed without their original event-time evidence.", 409);
  }

  // Only a reviewed controlled batch persists the immutable cash and cost-center
  // snapshots needed for safe receipt recovery. Invalid source state and any
  // colliding receipt evidence block close before an insert is attempted.
  const [controlledReceiptConflict] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    /* agency-close:controlled-receipt-precheck */
    WITH expected_receipts AS (
      SELECT remittance.id AS "remittanceId",
        remittance."amountCents",
        remittance."paidAt",
        remittance."externalReference",
        remittance."enteredById",
        remittance."reversedAt",
        claim.id AS "claimId",
        claim."centerId",
        claim."agencyProgramId",
        allocation."claimId" AS "allocationClaimId",
        allocation.id AS "allocationId",
        allocation."amountCents" AS "allocationAmountCents",
        allocation.status AS "allocationStatus",
        allocation.fingerprint AS "allocationFingerprint",
        allocation."idempotencyKey" AS "allocationIdempotencyKey",
        allocation."reviewedAt" AS "allocationReviewedAt",
        allocation."reviewedById" AS "allocationReviewedById",
        allocation."requestedById" AS "allocationRequestedById",
        allocation."createdAt" AS "allocationCreatedAt",
        batch.id AS "batchId",
        batch."centerId" AS "batchCenterId",
        batch."agencyProgramId" AS "batchAgencyProgramId",
        batch.status AS "batchStatus",
        batch."paidAt" AS "batchPaidAt",
        batch."externalReference" AS "batchExternalReference",
        batch."enteredById" AS "batchEnteredById",
        batch."idempotencyKey" AS "batchIdempotencyKey",
        batch."reconciliationFingerprint" AS "batchFingerprint",
        batch."totalCents" AS "batchTotalCents",
        batch."allocatedCents" AS "batchAllocatedCents",
        batch."unappliedCents" AS "batchUnappliedCents",
        batch."reviewedAt" AS "batchReviewedAt",
        batch."reviewedById" AS "batchReviewedById",
        batch."reversedAt" AS "batchReversedAt",
        batch."cashGlCodeSnapshot",
        batch."costCenterCodeSnapshot",
        account.id AS "accountId",
        COALESCE(allocation."reviewedAt", remittance."paidAt") AS "expectedEffectiveAt",
        'agency-remittance-batch:' || MD5(
          claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
          LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
          UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':' ||
          CASE WHEN remittance."reversedAt" IS NULL
            THEN 'active'
            ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
          END
        ) AS "expectedLegacyBatchId",
        'agency-remittance-batch:' || MD5(
          claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
          LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
          UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':active'
        ) AS "expectedLegacyActiveBatchId"
      FROM "SubsidyRemittance" remittance
      JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
      JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
      JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
      LEFT JOIN "AgencyLedgerAccount" account
        ON account."centerId" = claim."centerId"
        AND account."agencyProgramId" = claim."agencyProgramId"
      WHERE claim."centerId" = ${centerId}
    ), classified AS (
      SELECT expected.*,
        (
          expected."allocationClaimId" = expected."claimId"
          AND expected."batchCenterId" = expected."centerId"
          AND expected."batchAgencyProgramId" = expected."agencyProgramId"
          AND expected."accountId" IS NOT NULL
          AND expected."amountCents" > 0
          AND expected."allocationAmountCents" = expected."amountCents"
          AND expected."batchPaidAt" = expected."paidAt"
          AND expected."batchExternalReference" = expected."externalReference"
          AND NULLIF(BTRIM(expected."externalReference"), '') IS NOT NULL
          AND NULLIF(BTRIM(expected."enteredById"), '') IS NOT NULL
          AND NULLIF(BTRIM(expected."cashGlCodeSnapshot"), '') IS NOT NULL
          AND NULLIF(BTRIM(expected."costCenterCodeSnapshot"), '') IS NOT NULL
          AND expected."expectedEffectiveAt" IS NOT NULL
          AND DATE_TRUNC('day', expected."expectedEffectiveAt") >= DATE_TRUNC('day', expected."paidAt")
          AND (
            (
              expected."batchReviewedAt" IS NOT NULL
              AND NULLIF(BTRIM(expected."batchReviewedById"), '') IS NOT NULL
              AND expected."batchReviewedById" <> expected."batchEnteredById"
              AND expected."allocationReviewedAt" IS NOT NULL
              AND NULLIF(BTRIM(expected."allocationReviewedById"), '') IS NOT NULL
              AND expected."allocationReviewedById" = expected."enteredById"
              AND expected."allocationReviewedById" <> expected."allocationRequestedById"
              AND (expected."allocationCreatedAt" > expected."batchReviewedAt" OR (
                expected."allocationRequestedById" = expected."batchEnteredById"
                AND expected."allocationReviewedById" = expected."batchReviewedById"
              ))
              AND (
                (expected."reversedAt" IS NULL
                  AND expected."batchReversedAt" IS NULL
                  AND expected."allocationStatus" = 'posted'
                  AND expected."batchStatus" IN ('pending_review', 'unmatched', 'partially_allocated', 'exception', 'reconciled'))
                OR (expected."reversedAt" IS NOT NULL
                  AND expected."batchReversedAt" IS NOT NULL
                  AND expected."reversedAt" = expected."batchReversedAt"
                  AND expected."allocationStatus" = 'reversed'
                  AND expected."batchStatus" = 'reversed')
              )
            )
            OR (
              expected."allocationReviewedAt" IS NULL
              AND expected."allocationReviewedById" IS NULL
              AND expected."batchReviewedAt" IS NULL
              AND expected."batchReviewedById" IS NULL
              AND expected."allocationId" = 'agency-remittance-allocation:' || expected."remittanceId"
              AND (
                (expected."allocationIdempotencyKey" = 'legacy-allocation:' || expected."remittanceId"
                  AND expected."batchIdempotencyKey" = 'legacy:' || SUBSTRING(expected."batchId" FROM LENGTH('agency-remittance-batch:') + 1))
                OR (expected."allocationIdempotencyKey" = 'legacy-allocation:adoption:' || expected."remittanceId"
                  AND expected."batchIdempotencyKey" = 'legacy:adoption:' || SUBSTRING(expected."batchId" FROM LENGTH('agency-remittance-batch:') + 1))
              )
              AND expected."allocationRequestedById" = expected."enteredById"
              AND expected."allocationFingerprint" = MD5(expected."batchId" || ':' || expected."claimId" || ':' || expected."amountCents"::text)
              AND expected."batchId" IN (expected."expectedLegacyBatchId", expected."expectedLegacyActiveBatchId")
              AND expected."batchFingerprint" = MD5(
                expected."centerId" || ':' || expected."agencyProgramId" || ':' || expected."batchTotalCents"::text || ':' ||
                CASE WHEN expected."batchId" = expected."expectedLegacyActiveBatchId"
                  THEN 'active'
                  ELSE 'reversed:' || TO_CHAR(expected."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
                END
              )
              AND expected."batchAllocatedCents" = expected."batchTotalCents"
              AND expected."batchUnappliedCents" = 0
              AND expected."batchEnteredById" = expected."enteredById"
              AND (
                (expected."reversedAt" IS NULL
                  AND expected."batchReversedAt" IS NULL
                  AND expected."allocationStatus" = 'posted'
                  AND expected."batchStatus" = 'reconciled')
                OR (expected."reversedAt" IS NOT NULL
                  AND expected."batchReversedAt" = expected."reversedAt"
                  AND expected."allocationStatus" = 'reversed'
                  AND expected."batchStatus" = 'reversed')
              )
            )
          )
        ) AS "sourceValid"
      FROM expected_receipts expected
    )
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM classified expected
    WHERE (expected."paidAt" < ${endExclusive}
        OR expected."allocationReviewedAt" < ${endExclusive}
        OR expected."reversedAt" < ${endExclusive})
      AND (
        NOT expected."sourceValid"
        OR EXISTS (
          SELECT 1
          FROM "AgencyLedgerEntry" entry
          JOIN "AgencyLedgerAccount" account ON account.id = entry."agencyLedgerAccountId"
          WHERE (
            (entry."remittanceId" = expected."remittanceId" AND entry.type = 'remittance_received')
            OR (entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
              AND entry."externalId" = 'remittance:' || expected."remittanceId")
            OR entry.id = 'agency-ledger-remittance:' || expected."remittanceId"
          ) AND NOT (
            entry."agencyLedgerAccountId" IS NOT DISTINCT FROM expected."accountId"
            AND entry."claimId" IS NOT DISTINCT FROM expected."claimId"
            AND entry."remittanceId" IS NOT DISTINCT FROM expected."remittanceId"
            AND entry."remittanceBatchId" IS NOT DISTINCT FROM expected."batchId"
            AND entry."adjustmentId" IS NULL
            AND entry.type IS NOT DISTINCT FROM 'remittance_received'
            AND entry."amountCents" IS NOT DISTINCT FROM -expected."amountCents"
            AND entry."effectiveAt" IS NOT DISTINCT FROM expected."expectedEffectiveAt"
            AND entry."externalReference" IS NOT DISTINCT FROM expected."externalReference"
            AND entry."glCodeSnapshot" IS NOT DISTINCT FROM expected."cashGlCodeSnapshot"
            AND entry."costCenterCodeSnapshot" IS NOT DISTINCT FROM expected."costCenterCodeSnapshot"
            AND entry."sourceSystem" IS NOT DISTINCT FROM ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND entry."externalId" IS NOT DISTINCT FROM 'remittance:' || expected."remittanceId"
            AND account."centerId" IS NOT DISTINCT FROM expected."centerId"
            AND account."agencyProgramId" IS NOT DISTINCT FROM expected."agencyProgramId"
          )
        )
      )
  `;
  if (Number(controlledReceiptConflict?.conflictCount ?? 0) > 0) {
    throw new AgencyWorkflowError("Agency ledger close found invalid controlled-batch source facts or conflicting receipt evidence. Restore and verify the exact batch, allocation, claim, account, date, amount, reference, and accounting snapshots before closing.", 409);
  }

  const recoveredRemittanceReceipts = await tx.$queryRaw<RecoveredAgencyLedgerEventRow[]>`
    /* agency-close:controlled-receipt-recovery */
    INSERT INTO "AgencyLedgerEntry" (
      id, "agencyLedgerAccountId", "claimId", "remittanceId", "remittanceBatchId", type, description,
      "amountCents", "balanceAfterCents", "effectiveAt", "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot",
      "sourceSystem", "externalId", metadata, "createdAt"
    )
    SELECT
      'agency-ledger-remittance:' || remittance.id,
      account.id,
      claim.id,
      remittance.id,
      batch.id,
      'remittance_received',
      program.name || ' remittance for ' || claim.number,
      -remittance."amountCents",
      0,
      COALESCE(allocation."reviewedAt", remittance."paidAt"),
      remittance."externalReference",
      batch."cashGlCodeSnapshot",
      batch."costCenterCodeSnapshot",
      ${AGENCY_LEDGER_SOURCE_SYSTEM},
      'remittance:' || remittance.id,
      jsonb_build_object(
        'claimNumber', claim.number,
        'paymentMethod', remittance."paymentMethod",
        'remittanceBatchId', batch.id,
        'originalPaidAt', remittance."paidAt",
        'recoveredAtPeriodClose', true,
        'recoveredById', ${recoveredById}
      ),
      remittance."createdAt"
    FROM "SubsidyRemittance" remittance
    JOIN "SubsidyClaim" claim
      ON claim.id = remittance."claimId"
    JOIN "AgencyProgram" program
      ON program.id = claim."agencyProgramId"
      AND program."centerId" = claim."centerId"
    JOIN "AgencyLedgerAccount" account
      ON account."centerId" = claim."centerId"
      AND account."agencyProgramId" = claim."agencyProgramId"
    JOIN "AgencyRemittanceAllocation" allocation
      ON allocation."remittanceId" = remittance.id
      AND allocation."claimId" = claim.id
      AND allocation."amountCents" = remittance."amountCents"
      AND allocation.status IN ('posted', 'reversed')
    JOIN "AgencyRemittanceBatch" batch
      ON batch.id = allocation."batchId"
      AND batch."centerId" = claim."centerId"
      AND batch."agencyProgramId" = claim."agencyProgramId"
      AND batch."paidAt" = remittance."paidAt"
      AND batch."externalReference" = remittance."externalReference"
      AND NULLIF(BTRIM(batch."cashGlCodeSnapshot"), '') IS NOT NULL
      AND NULLIF(BTRIM(batch."costCenterCodeSnapshot"), '') IS NOT NULL
    WHERE claim."centerId" = ${centerId}
      AND remittance."amountCents" > 0
      AND NULLIF(BTRIM(remittance."externalReference"), '') IS NOT NULL
      AND NULLIF(BTRIM(remittance."enteredById"), '') IS NOT NULL
      AND (
        (
          allocation."reviewedAt" IS NOT NULL
          AND NULLIF(BTRIM(allocation."reviewedById"), '') IS NOT NULL
          AND allocation."reviewedById" = remittance."enteredById"
          AND allocation."reviewedById" <> allocation."requestedById"
          AND batch."reviewedAt" IS NOT NULL
          AND NULLIF(BTRIM(batch."reviewedById"), '') IS NOT NULL
          AND batch."reviewedById" <> batch."enteredById"
          AND (allocation."createdAt" > batch."reviewedAt" OR (
            allocation."requestedById" = batch."enteredById"
            AND allocation."reviewedById" = batch."reviewedById"
          ))
          AND (
            (remittance."reversedAt" IS NULL
              AND batch."reversedAt" IS NULL
              AND allocation.status = 'posted'
              AND batch.status IN ('pending_review', 'unmatched', 'partially_allocated', 'exception', 'reconciled'))
            OR (remittance."reversedAt" IS NOT NULL
              AND batch."reversedAt" = remittance."reversedAt"
              AND allocation.status = 'reversed'
              AND batch.status = 'reversed')
          )
        )
        OR (
          allocation."reviewedAt" IS NULL
          AND allocation."reviewedById" IS NULL
          AND batch."reviewedAt" IS NULL
          AND batch."reviewedById" IS NULL
          AND allocation.id = 'agency-remittance-allocation:' || remittance.id
          AND (
            (allocation."idempotencyKey" = 'legacy-allocation:' || remittance.id
              AND batch."idempotencyKey" = 'legacy:' || SUBSTRING(batch.id FROM LENGTH('agency-remittance-batch:') + 1))
            OR (allocation."idempotencyKey" = 'legacy-allocation:adoption:' || remittance.id
              AND batch."idempotencyKey" = 'legacy:adoption:' || SUBSTRING(batch.id FROM LENGTH('agency-remittance-batch:') + 1))
          )
          AND allocation."requestedById" = remittance."enteredById"
          AND allocation.fingerprint = MD5(batch.id || ':' || claim.id || ':' || remittance."amountCents"::text)
          AND batch.id IN (
            'agency-remittance-batch:' || MD5(
              claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
              LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
              UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':' ||
              CASE WHEN remittance."reversedAt" IS NULL
                THEN 'active'
                ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
              END
            ),
            'agency-remittance-batch:' || MD5(
              claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
              LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
              UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':active'
            )
          )
          AND batch."reconciliationFingerprint" = MD5(
            claim."centerId" || ':' || claim."agencyProgramId" || ':' || batch."totalCents"::text || ':' ||
            CASE WHEN batch.id = 'agency-remittance-batch:' || MD5(
              claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
              LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
              UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':active'
            ) THEN 'active'
              ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
            END
          )
          AND batch."allocatedCents" = batch."totalCents"
          AND batch."unappliedCents" = 0
          AND batch."enteredById" = remittance."enteredById"
          AND (
            (remittance."reversedAt" IS NULL AND batch."reversedAt" IS NULL AND allocation.status = 'posted' AND batch.status = 'reconciled')
            OR (remittance."reversedAt" IS NOT NULL AND batch."reversedAt" = remittance."reversedAt" AND allocation.status = 'reversed' AND batch.status = 'reversed')
          )
        )
      )
      AND DATE_TRUNC('day', COALESCE(allocation."reviewedAt", remittance."paidAt")) >= DATE_TRUNC('day', remittance."paidAt")
      AND COALESCE(allocation."reviewedAt", remittance."paidAt") < ${endExclusive}
      AND NOT EXISTS (
        SELECT 1
        FROM "AgencyLedgerEntry" entry
        WHERE (entry."remittanceId" = remittance.id AND entry.type = 'remittance_received')
           OR (entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
             AND entry."externalId" = 'remittance:' || remittance.id)
           OR entry.id = 'agency-ledger-remittance:' || remittance.id
      )
    ON CONFLICT DO NOTHING
    RETURNING "agencyLedgerAccountId"
  `;

  const [controlledReceiptPostRecoveryConflict] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    /* agency-close:controlled-receipt-postcheck */
    WITH expected_receipts AS (
      SELECT remittance.id AS "remittanceId",
        remittance."amountCents",
        remittance."paidAt",
        remittance."externalReference",
        claim.id AS "claimId",
        claim."centerId",
        claim."agencyProgramId",
        allocation."batchId",
        COALESCE(allocation."reviewedAt", remittance."paidAt") AS "expectedEffectiveAt",
        batch."cashGlCodeSnapshot",
        batch."costCenterCodeSnapshot",
        account.id AS "accountId"
      FROM "SubsidyRemittance" remittance
      JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
      JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
      JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
      JOIN "AgencyLedgerAccount" account
        ON account."centerId" = claim."centerId"
        AND account."agencyProgramId" = claim."agencyProgramId"
      WHERE claim."centerId" = ${centerId}
    )
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM expected_receipts expected
    WHERE expected."expectedEffectiveAt" < ${endExclusive}
      AND (
        (SELECT COUNT(*)
         FROM "AgencyLedgerEntry" candidate
         WHERE (candidate."remittanceId" = expected."remittanceId" AND candidate.type = 'remittance_received')
            OR (candidate."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
              AND candidate."externalId" = 'remittance:' || expected."remittanceId")
            OR candidate.id = 'agency-ledger-remittance:' || expected."remittanceId") <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM "AgencyLedgerEntry" entry
          JOIN "AgencyLedgerAccount" account ON account.id = entry."agencyLedgerAccountId"
          WHERE entry."agencyLedgerAccountId" = expected."accountId"
            AND entry."claimId" = expected."claimId"
            AND entry."remittanceId" = expected."remittanceId"
            AND entry."remittanceBatchId" = expected."batchId"
            AND entry."adjustmentId" IS NULL
            AND entry.type = 'remittance_received'
            AND entry."amountCents" = -expected."amountCents"
            AND entry."effectiveAt" = expected."expectedEffectiveAt"
            AND entry."externalReference" = expected."externalReference"
            AND entry."glCodeSnapshot" = expected."cashGlCodeSnapshot"
            AND entry."costCenterCodeSnapshot" = expected."costCenterCodeSnapshot"
            AND entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND entry."externalId" = 'remittance:' || expected."remittanceId"
            AND account."centerId" = expected."centerId"
            AND account."agencyProgramId" = expected."agencyProgramId"
        )
      )
  `;
  if (Number(controlledReceiptPostRecoveryConflict?.conflictCount ?? 0) > 0) {
    throw new AgencyWorkflowError("Agency ledger close could not establish the exact controlled-batch receipt after recovery. No period was closed.", 409);
  }

  // A reversal has independent reviewer/reason evidence and therefore cannot be
  // reconstructed. Require the exact receipt-linked compensating event instead.
  const [remittanceReversalConflict] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    /* agency-close:remittance-reversal-evidence */
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM "SubsidyRemittance" remittance
    JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
    LEFT JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
    WHERE claim."centerId" = ${centerId}
      AND remittance."reversedAt" IS NOT NULL
      AND remittance."reversedAt" < ${endExclusive}
      AND (
        DATE_TRUNC('day', remittance."reversedAt") < DATE_TRUNC('day', remittance."paidAt")
        OR NULLIF(BTRIM(remittance."reversedById"), '') IS NULL
        OR NULLIF(BTRIM(remittance."reversalReason"), '') IS NULL
        OR (SELECT COUNT(*)
            FROM "AgencyLedgerEntry" candidate
            WHERE (candidate."remittanceId" = remittance.id AND candidate.type = 'remittance_reversal')
               OR (candidate."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
                 AND candidate."externalId" = 'remittance-reversal:' || remittance.id)
               OR candidate.id = 'agency-ledger-remittance-reversal:' || remittance.id) <> 1
        OR NOT EXISTS (
          SELECT 1
          FROM "AgencyLedgerEntry" reversal
          JOIN "AgencyLedgerEntry" receipt
            ON receipt."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND receipt."externalId" = 'remittance:' || remittance.id
          JOIN "AgencyLedgerAccount" account ON account.id = reversal."agencyLedgerAccountId"
          WHERE reversal."agencyLedgerAccountId" = receipt."agencyLedgerAccountId"
            AND reversal."claimId" = claim.id
            AND reversal."remittanceId" = remittance.id
            AND reversal."remittanceBatchId" IS NOT DISTINCT FROM allocation."batchId"
            AND reversal."adjustmentId" IS NULL
            AND reversal.type = 'remittance_reversal'
            AND reversal."amountCents" = remittance."amountCents"
            AND reversal."effectiveAt" = GREATEST(remittance."reversedAt", receipt."effectiveAt")
            AND reversal."effectiveAt" >= receipt."effectiveAt"
            AND reversal."externalReference" = remittance."externalReference"
            AND reversal."glCodeSnapshot" IS NOT DISTINCT FROM receipt."glCodeSnapshot"
            AND reversal."costCenterCodeSnapshot" IS NOT DISTINCT FROM receipt."costCenterCodeSnapshot"
            AND reversal."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND reversal."externalId" = 'remittance-reversal:' || remittance.id
            AND account."centerId" = claim."centerId"
            AND account."agencyProgramId" = claim."agencyProgramId"
        )
      )
  `;
  if (Number(remittanceReversalConflict?.conflictCount ?? 0) > 0) {
    throw new AgencyWorkflowError("Agency ledger close found a missing, duplicate, or conflicting remittance reversal. Restore and verify its exact receipt, reviewer, reason, date, amount, source key, and accounting snapshots before closing.", 409);
  }

  const [adjustmentEvidenceConflict] = await tx.$queryRaw<Array<{ conflictCount: bigint }>>`
    /* agency-close:adjustment-evidence */
    SELECT COUNT(*)::bigint AS "conflictCount"
    FROM "AgencyLedgerAdjustment" adjustment
    JOIN "AgencyLedgerAccount" account ON account.id = adjustment."ledgerAccountId"
    WHERE adjustment."centerId" = ${centerId}
      AND adjustment.status IN ('posted', 'reversed')
      AND (adjustment."effectiveAt" < ${endExclusive} OR adjustment."reversedAt" < ${endExclusive})
      AND (
        account."centerId" <> adjustment."centerId"
        OR account."agencyProgramId" <> adjustment."agencyProgramId"
        OR adjustment.type NOT IN ('write_off', 'recoupment', 'overpayment', 'correction_increase', 'correction_decrease')
        OR adjustment."amountCents" = 0
        OR adjustment."reviewedAt" IS NULL
        OR NULLIF(BTRIM(adjustment."reviewedById"), '') IS NULL
        OR adjustment."reviewedById" = adjustment."requestedById"
        OR NULLIF(BTRIM(adjustment."evidenceReference"), '') IS NULL
        OR NULLIF(BTRIM(adjustment."glCodeSnapshot"), '') IS NULL
        OR NULLIF(BTRIM(adjustment."costCenterCodeSnapshot"), '') IS NULL
        OR (SELECT COUNT(*)
            FROM "AgencyLedgerEntry" candidate
            WHERE candidate."adjustmentId" = adjustment.id
               OR (candidate."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
                 AND candidate."externalId" IN (
                   'adjustment:' || adjustment.id,
                   'adjustment-reversal:' || adjustment.id
                 ))) <> CASE WHEN adjustment.status = 'reversed' THEN 2 ELSE 1 END
        OR NOT EXISTS (
          SELECT 1
          FROM "AgencyLedgerEntry" entry
          WHERE entry."agencyLedgerAccountId" = adjustment."ledgerAccountId"
            AND entry."claimId" IS NOT DISTINCT FROM adjustment."claimId"
            AND entry."remittanceId" IS NULL
            AND entry."remittanceBatchId" IS NOT DISTINCT FROM adjustment."batchId"
            AND entry."adjustmentId" = adjustment.id
            AND entry.type = 'adjustment_' || adjustment.type
            AND entry."amountCents" = adjustment."amountCents"
            AND entry."effectiveAt" = adjustment."effectiveAt"
            AND entry."externalReference" IS NOT DISTINCT FROM adjustment."evidenceReference"
            AND entry."glCodeSnapshot" IS NOT DISTINCT FROM adjustment."glCodeSnapshot"
            AND entry."costCenterCodeSnapshot" IS NOT DISTINCT FROM adjustment."costCenterCodeSnapshot"
            AND entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
            AND entry."externalId" = 'adjustment:' || adjustment.id
        )
        OR (adjustment.status = 'reversed' AND (
          adjustment."reversedAt" IS NULL
          OR adjustment."reversedAt" < adjustment."effectiveAt"
          OR NULLIF(BTRIM(adjustment."reversedById"), '') IS NULL
          OR adjustment."reversedById" = adjustment."requestedById"
          OR NULLIF(BTRIM(adjustment."reversalReason"), '') IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "AgencyLedgerEntry" entry
            WHERE entry."agencyLedgerAccountId" = adjustment."ledgerAccountId"
              AND entry."claimId" IS NOT DISTINCT FROM adjustment."claimId"
              AND entry."remittanceId" IS NULL
              AND entry."remittanceBatchId" IS NOT DISTINCT FROM adjustment."batchId"
              AND entry."adjustmentId" = adjustment.id
              AND entry.type = 'adjustment_reversal'
              AND entry."amountCents" = -adjustment."amountCents"
              AND entry."effectiveAt" = adjustment."reversedAt"
              AND entry."externalReference" IS NOT DISTINCT FROM adjustment."evidenceReference"
              AND entry."glCodeSnapshot" IS NOT DISTINCT FROM adjustment."glCodeSnapshot"
              AND entry."costCenterCodeSnapshot" IS NOT DISTINCT FROM adjustment."costCenterCodeSnapshot"
              AND entry."sourceSystem" = ${AGENCY_LEDGER_SOURCE_SYSTEM}
              AND entry."externalId" = 'adjustment-reversal:' || adjustment.id
          )
        ))
      )
  `;
  if (Number(adjustmentEvidenceConflict?.conflictCount ?? 0) > 0) {
    throw new AgencyWorkflowError("Agency ledger close found missing, duplicate, or conflicting adjustment evidence. Restore and verify the exact original and reversal events before closing.", 409);
  }

  const accountIds = [...new Set(recoveredRemittanceReceipts.map((row) => row.agencyLedgerAccountId))];
  for (const accountId of accountIds) await recalculateAgencyLedgerBalances(tx, accountId);
  return {
    recoveredClaimReceivableCount: 0,
    recoveredRemittanceReceivedCount: recoveredRemittanceReceipts.length,
    recoveredRemittanceReversalCount: 0,
  };
}

type AgencyPostingClaim = AgencyLedgerClaimInput & {
  claimedCents: number;
  paidCents: number;
  status: string;
  authorization: {
    centerId: string;
    agencyProgramId: string;
    familyId: string;
    authorizationNumber: string;
    family: {
      id: string;
      centerId: string | null;
      billingAccount: { id: string; familyId: string; balanceCents: number } | null;
    };
  } | null;
  remittances: Array<{ amountCents: number; reversedAt: Date | null }>;
};

async function recalculateLegacyFamilyLedgerBalances(tx: Prisma.TransactionClient, billingAccountId: string, finalBalanceCents: number) {
  const entries = await tx.ledgerEntry.findMany({
    where: { billingAccountId },
    orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, amountCents: true, balanceAfterCents: true },
  });
  const entryTotalCents = entries.reduce((total, candidate) => total + candidate.amountCents, 0);
  const runningBalances = agencyLedgerRunningBalances(entries, finalBalanceCents - entryTotalCents);
  const existingBalanceById = new Map(entries.map((candidate) => [candidate.id, candidate.balanceAfterCents]));
  for (const running of runningBalances) {
    if (existingBalanceById.get(running.id) === running.balanceAfterCents) continue;
    await tx.ledgerEntry.update({ where: { id: running.id }, data: { balanceAfterCents: running.balanceAfterCents } });
  }
}

async function applyLegacyFamilyLedgerSettlement(tx: Prisma.TransactionClient, input: {
  claim: AgencyPostingClaim;
  amountCents: number;
  paidAt: Date;
  ledgerEffectiveAt?: Date;
  reference: string;
  remittanceId: string;
}) {
  if (input.claim.agencyProgram.centerId !== input.claim.centerId) {
    throw new AgencyWorkflowError("The claim and agency program school relationship is inconsistent. No family ledger was changed.", 409);
  }
  const authorization = input.claim.authorization;
  if (!authorization) return { appliedCents: 0, entryId: null as string | null };
  if (
    authorization.centerId !== input.claim.centerId
    || authorization.agencyProgramId !== input.claim.agencyProgramId
    || authorization.familyId !== authorization.family.id
    || authorization.family.centerId !== input.claim.centerId
  ) {
    throw new AgencyWorkflowError("The claim authorization and family school relationship is inconsistent. No family ledger was changed.", 409);
  }
  const billingAccount = authorization.family.billingAccount;
  if (!billingAccount) return { appliedCents: 0, entryId: null as string | null };
  if (billingAccount.familyId !== authorization.family.id) {
    throw new AgencyWorkflowError("The family billing account relationship is inconsistent. No family ledger was changed.", 409);
  }
  const authorizationNumber = authorization.authorizationNumber;
  const agencyName = input.claim.agencyProgram.name.trim().toLowerCase();
  const agencyEntries = await tx.ledgerEntry.findMany({
    where: {
      billingAccountId: billingAccount.id,
      OR: [
        { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
        { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
      ],
    },
    orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const matchingOutstandingCents = agencyEntries.reduce((total, entry) => {
    const metadata = recordValue(entry.metadata);
    const entryAuthorizationNumber = clean(metadata.authorizationNumber);
    const entryAgencyName = clean(metadata.agencyName).toLowerCase();
    const matches = entryAuthorizationNumber && entryAgencyName
      ? entryAuthorizationNumber === authorizationNumber && entryAgencyName === agencyName
      : entryAuthorizationNumber
        ? entryAuthorizationNumber === authorizationNumber
        : entryAgencyName === agencyName;
    return matches ? total + entry.amountCents : total;
  }, 0);
  const totalAgencyResponsibilityCents = agencyEntries.reduce((total, entry) => total + entry.amountCents, 0);
  // The parent portal excludes only the positive net agency-only balance. A
  // matching legacy subset can be larger than that net when unrelated negative
  // history is present, so cap the mirror at both figures to keep the parent's
  // visible responsibility exactly unchanged.
  const appliedCents = Math.min(
    input.amountCents,
    Math.max(0, matchingOutstandingCents),
    Math.max(0, totalAgencyResponsibilityCents),
  );
  if (appliedCents <= 0) return { appliedCents: 0, entryId: null as string | null };
  const parentVisibleBeforeCents = billingAccount.balanceCents - Math.max(0, totalAgencyResponsibilityCents);
  const updatedAccount = await tx.billingAccount.update({
    where: { id: billingAccount.id },
    data: { balanceCents: { decrement: appliedCents } },
  });
  const entry = await tx.ledgerEntry.create({ data: {
    billingAccountId: billingAccount.id,
    type: "agency_payment",
    description: `Legacy family-ledger settlement for ${input.claim.agencyProgram.name} remittance ${input.claim.number}`,
    amountCents: -appliedCents,
    balanceAfterCents: 0,
    effectiveAt: input.ledgerEffectiveAt ?? input.paidAt,
    sourceSystem: "subsidy_agency",
    externalId: `agency-remittance:${input.remittanceId}`,
    metadata: {
      claimId: input.claim.id,
      claimNumber: input.claim.number,
      remittanceId: input.remittanceId,
      appliedCents,
      agencyName: input.claim.agencyProgram.name,
      authorizationNumber,
      externalReference: input.reference,
      originalPaidAt: input.paidAt.toISOString(),
      postingRule: (input.ledgerEffectiveAt ?? input.paidAt).getTime() === input.paidAt.getTime()
        ? "source_receipt"
        : "independent_review",
      legacyCompatibilityMirror: true,
    },
  } });
  const parentVisibleAfterCents = updatedAccount.balanceCents - Math.max(0, totalAgencyResponsibilityCents - appliedCents);
  if (parentVisibleAfterCents !== parentVisibleBeforeCents) {
    throw new AgencyWorkflowError("The legacy compatibility mirror would change parent-visible responsibility. No family ledger was changed.", 409);
  }
  await recalculateLegacyFamilyLedgerBalances(tx, billingAccount.id, updatedAccount.balanceCents);
  return { appliedCents, entryId: entry.id };
}

async function postAgencyClaimAllocation(tx: Prisma.TransactionClient, input: {
  claim: AgencyPostingClaim;
  batchId: string;
  allocationId: string;
  amountCents: number;
  paidAt: Date;
  ledgerEffectiveAt?: Date;
  paymentMethod: string;
  reference: string;
  notes?: string | null;
  reviewerId: string;
  accountingSnapshot: { glCode: string | null; costCenterCode: string | null };
}, options: { recalculateAgencyLedger?: boolean } = {}) {
  // A late allocation becomes effective when its independent review posts it.
  // Reuse that exact timestamp for the receipt, allocation review, and compatibility mirror.
  const ledgerEffectiveAt = input.ledgerEffectiveAt ?? input.paidAt;
  const reviewedAt = input.ledgerEffectiveAt ?? new Date();
  const payable = input.claim.approvedCents ?? input.claim.claimedCents;
  const paidBeforeCents = activeRemittanceTotalCents(input.claim.remittances);
  if (!new Set(["approved", "partially_paid"]).has(input.claim.status)) {
    throw new AgencyWorkflowError(`Claim ${input.claim.number} is not approved for payment.`, 409);
  }
  if (paidBeforeCents + input.amountCents > payable) {
    throw new AgencyWorkflowError(`The allocation for ${input.claim.number} exceeds its remaining approved amount.`, 409);
  }
  await ensureAgencyClaimReceivable(tx, input.claim, { recalculate: false });
  const remittance = await tx.subsidyRemittance.create({ data: {
    claimId: input.claim.id,
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    paymentMethod: input.paymentMethod,
    externalReference: input.reference,
    notes: input.notes || null,
    enteredById: input.reviewerId,
  } });
  const ledger = await appendAgencyLedgerEntry(tx, {
    centerId: input.claim.centerId,
    agencyProgramId: input.claim.agencyProgramId,
    claimId: input.claim.id,
    remittanceId: remittance.id,
    remittanceBatchId: input.batchId,
    type: "remittance_received",
    description: `${input.claim.agencyProgram.name} remittance for ${input.claim.number}`,
    amountCents: -input.amountCents,
    effectiveAt: ledgerEffectiveAt,
    externalReference: input.reference,
    externalId: agencyRemittanceLedgerExternalId(remittance.id),
    metadata: {
      claimNumber: input.claim.number,
      paymentMethod: input.paymentMethod,
      remittanceBatchId: input.batchId,
      originalPaidAt: input.paidAt.toISOString(),
      postingRule: ledgerEffectiveAt.getTime() === input.paidAt.getTime() ? "source_receipt" : "independent_review",
    },
    accountingSnapshot: input.accountingSnapshot,
  }, { recalculate: false });
  await tx.agencyRemittanceAllocation.update({
    where: { id: input.allocationId },
    data: { status: "posted", remittanceId: remittance.id, reviewedById: input.reviewerId, reviewedAt },
  });
  const legacy = await applyLegacyFamilyLedgerSettlement(tx, {
    claim: input.claim,
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    ledgerEffectiveAt,
    reference: input.reference,
    remittanceId: remittance.id,
  });
  const paidCents = paidBeforeCents + input.amountCents;
  const updatedClaim = await tx.subsidyClaim.update({
    where: { id: input.claim.id },
    data: { paidCents, status: nextRemittanceStatus({ claimedCents: input.claim.claimedCents, approvedCents: input.claim.approvedCents, paidCents }) },
  });
  const agencyLedgerAccount = options.recalculateAgencyLedger === false
    ? ledger.account
    : await recalculateAgencyLedgerBalances(tx, ledger.account.id);
  return { remittance, ledger: { ...ledger, account: agencyLedgerAccount }, legacy, updatedClaim };
}

async function agencyPostingClaim(tx: Prisma.TransactionClient, claimId: string) {
  return tx.subsidyClaim.findUnique({
    where: { id: claimId },
    include: {
      agencyProgram: true,
      authorization: { include: { family: { include: { billingAccount: true } } } },
      remittances: true,
    },
  });
}

async function reverseAgencyRemittanceRecord(tx: Prisma.TransactionClient, input: {
  remittanceId: string;
  reviewerId: string;
  reviewerRole?: string;
  requireIndependentReviewer?: boolean;
  expectedClaimId?: string;
  expectedCenterId?: string;
  expectedBatchId?: string;
  requireUnbatched?: boolean;
  reason: string;
  reversedAt: Date;
}, options: { recalculateAgencyLedger?: boolean } = {}) {
  const remittance = await tx.subsidyRemittance.findUnique({
    where: { id: input.remittanceId },
    include: {
      claim: { include: { agencyProgram: true, authorization: { include: { family: { include: { billingAccount: true } } } } } },
      allocation: { include: { batch: { select: {
        centerId: true,
        agencyProgramId: true,
        paidAt: true,
        externalReference: true,
        reviewedAt: true,
        cashGlCodeSnapshot: true,
        costCenterCodeSnapshot: true,
      } } } },
    },
  });
  if (!remittance) throw new AgencyWorkflowError("Remittance not found.", 404);
  if (input.expectedClaimId && remittance.claimId !== input.expectedClaimId) throw new AgencyWorkflowError("Remittance not found.", 404);
  if (input.expectedCenterId && remittance.claim.centerId !== input.expectedCenterId) throw new AgencyWorkflowError("Remittance not found.", 404);
  if (remittance.claim.agencyProgram.centerId !== remittance.claim.centerId) throw new AgencyWorkflowError("The remittance claim and agency school relationship is inconsistent. No reversal was posted.", 409);
  if (remittance.allocation && remittance.allocation.claimId !== remittance.claimId) throw new AgencyWorkflowError("The remittance allocation and claim relationship is inconsistent. No reversal was posted.", 409);
  if (remittance.allocation && (
    remittance.allocation.batch.centerId !== remittance.claim.centerId
    || remittance.allocation.batch.agencyProgramId !== remittance.claim.agencyProgramId
    || remittance.allocation.batch.paidAt.getTime() !== remittance.paidAt.getTime()
    || remittance.allocation.batch.externalReference !== remittance.externalReference
  )) throw new AgencyWorkflowError("The remittance allocation and deposit evidence are inconsistent. No reversal was posted.", 409);
  if (input.expectedBatchId && remittance.allocation?.batchId !== input.expectedBatchId) throw new AgencyWorkflowError("The remittance allocation does not belong to this deposit batch. No reversal was posted.", 409);
  if (input.requireIndependentReviewer && (!input.reviewerRole || !canReviewAgencyPosting({ role: input.reviewerRole, reviewerId: input.reviewerId, requestedById: remittance.enteredById }))) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reverse this remittance after reconciliation activation.", 403);
  if (input.requireUnbatched && remittance.allocation) throw new AgencyWorkflowError("This payment belongs to a controlled deposit batch. Reverse the batch from the reconciliation queue so every allocation remains balanced.", 409);
  if (remittance.reversedAt) throw new AgencyWorkflowError("This remittance was already reversed.", 409);
  await ensureAgencyClaimReceivable(tx, remittance.claim, { recalculate: false });
  const agencyPaymentExternalId = agencyRemittanceLedgerExternalId(remittance.id);
  const agencyPaymentEntry = await tx.agencyLedgerEntry.findUnique({
    where: { sourceSystem_externalId: { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM, externalId: agencyPaymentExternalId } },
    include: { agencyLedgerAccount: { select: { centerId: true, agencyProgramId: true } } },
  });
  if (!agencyPaymentEntry) throw new AgencyWorkflowError("The remittance is missing its immutable receipt ledger entry. Restore and verify the source evidence before reversing it.", 409);
  const allocation = remittance.allocation;
  // Controlled allocations become effective when an independent reviewer posts
  // them. Adopted legacy allocations intentionally have no review timestamp and
  // retain the source remittance date instead.
  const expectedReceiptEffectiveAt = allocation?.reviewedAt ?? remittance.paidAt;
  if (!expectedReceiptEffectiveAt
    || agencyPaymentEntry.agencyLedgerAccount.centerId !== remittance.claim.centerId
    || agencyPaymentEntry.agencyLedgerAccount.agencyProgramId !== remittance.claim.agencyProgramId
    || agencyPaymentEntry.claimId !== remittance.claimId
    || agencyPaymentEntry.remittanceId !== remittance.id
    || agencyPaymentEntry.remittanceBatchId !== (allocation?.batchId ?? null)
    || agencyPaymentEntry.adjustmentId !== null
    || agencyPaymentEntry.type !== "remittance_received"
    || agencyPaymentEntry.amountCents !== -remittance.amountCents
    || agencyPaymentEntry.effectiveAt.getTime() !== expectedReceiptEffectiveAt.getTime()
    || isBeforeUtcAccountingDay(agencyPaymentEntry.effectiveAt, remittance.paidAt)
    || agencyPaymentEntry.externalReference !== remittance.externalReference
    || agencyPaymentEntry.sourceSystem !== AGENCY_LEDGER_SOURCE_SYSTEM
    || agencyPaymentEntry.externalId !== agencyPaymentExternalId
    || (allocation && (
      agencyPaymentEntry.glCodeSnapshot !== allocation.batch.cashGlCodeSnapshot
      || agencyPaymentEntry.costCenterCodeSnapshot !== allocation.batch.costCenterCodeSnapshot
    ))) {
    throw new AgencyWorkflowError("The immutable remittance receipt conflicts with its exact claim, batch, amount, date, or accounting evidence. No reversal was posted.", 409);
  }
  // Preserve the source event exactly, but never let its accounting entry post
  // before the immutable receipt. Date-only legacy remittances use a noon UTC
  // sentinel, so a real reversal earlier on that same UTC day remains valid
  // source evidence while its compensating ledger entry is clamped to noon.
  const sourceReversedAt = input.reversedAt;
  if (isBeforeUtcAccountingDay(sourceReversedAt, remittance.paidAt)) throw new AgencyWorkflowError("A remittance reversal cannot be effective before the original receipt event.", 409);
  const postingEffectiveAt = agencyReversalEffectiveAt(agencyPaymentEntry.effectiveAt, sourceReversedAt);
  if (postingEffectiveAt < agencyPaymentEntry.effectiveAt) throw new AgencyWorkflowError("A remittance reversal cannot be effective before the original receipt event.", 409);
  await assertAgencyPeriodOpen(tx, remittance.claim.centerId, postingEffectiveAt);
  const transition = await tx.subsidyRemittance.updateMany({
    where: { id: remittance.id, reversedAt: null },
    data: { reversedAt: sourceReversedAt, reversedById: input.reviewerId, reversalReason: input.reason },
  });
  if (transition.count !== 1) throw new AgencyWorkflowError("The remittance changed before it could be reversed.", 409);
  const agencyReversal = await appendAgencyLedgerEntry(tx, {
    centerId: remittance.claim.centerId,
    agencyProgramId: remittance.claim.agencyProgramId,
    claimId: remittance.claimId,
    remittanceId: remittance.id,
    remittanceBatchId: remittance.allocation?.batchId,
    type: "remittance_reversal",
    description: `Reversed agency remittance for ${remittance.claim.number}`,
    amountCents: remittance.amountCents,
    effectiveAt: postingEffectiveAt,
    externalReference: remittance.externalReference,
    externalId: agencyRemittanceReversalLedgerExternalId(remittance.id),
    metadata: {
      claimNumber: remittance.claim.number,
      originalAgencyLedgerEntryId: agencyPaymentEntry.id,
      reason: input.reason,
      sourceReversedAt: sourceReversedAt.toISOString(),
      postingRule: "later of source reversal and receipt effective time",
    },
    accountingSnapshot: { glCode: agencyPaymentEntry.glCodeSnapshot, costCenterCode: agencyPaymentEntry.costCenterCodeSnapshot },
  }, { recalculate: false });
  const legacyPaymentEntry = await tx.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: "subsidy_agency", externalId: `agency-remittance:${remittance.id}` } } });
  let legacyFamilyReversalLedgerEntryId: string | null = null;
  if (legacyPaymentEntry) {
    const authorization = remittance.claim.authorization;
    const billingAccount = authorization?.family.billingAccount;
    const metadata = recordValue(legacyPaymentEntry.metadata);
    const baselineAgencyName = clean(metadata.agencyName);
    const currentCompatibilityEvidence = metadata.legacyCompatibilityMirror === true
      && numberValue(metadata.appliedCents) === Math.abs(legacyPaymentEntry.amountCents);
    // The production workflow before this PR wrote this smaller immutable
    // metadata shape. Accept it only when every old-format source link and
    // description is exact; absence of the newer marker is not by itself proof.
    const baselineCompatibilityEvidence = !Object.prototype.hasOwnProperty.call(metadata, "appliedCents")
      && !Object.prototype.hasOwnProperty.call(metadata, "legacyCompatibilityMirror")
      && clean(metadata.claimNumber) === remittance.claim.number
      && Boolean(baselineAgencyName)
      && clean(metadata.authorizationNumber) === (authorization?.authorizationNumber ?? "")
      && legacyPaymentEntry.description === `${baselineAgencyName} remittance for ${remittance.claim.number}`
      && legacyPaymentEntry.effectiveAt.getTime() === remittance.paidAt.getTime();
    if (
      legacyPaymentEntry.amountCents >= 0
      || Math.abs(legacyPaymentEntry.amountCents) > remittance.amountCents
      || legacyPaymentEntry.type !== "agency_payment"
      || legacyPaymentEntry.effectiveAt.getTime() !== agencyPaymentEntry.effectiveAt.getTime()
      || !authorization
      || authorization.centerId !== remittance.claim.centerId
      || authorization.agencyProgramId !== remittance.claim.agencyProgramId
      || authorization.familyId !== authorization.family.id
      || authorization.family.centerId !== remittance.claim.centerId
      || !billingAccount
      || billingAccount.familyId !== authorization.family.id
      || legacyPaymentEntry.billingAccountId !== billingAccount.id
      || clean(metadata.remittanceId) !== remittance.id
      || clean(metadata.claimId) !== remittance.claimId
      || clean(metadata.externalReference) !== remittance.externalReference
      || (!currentCompatibilityEvidence && !baselineCompatibilityEvidence)
    ) throw new AgencyWorkflowError("The legacy family-ledger settlement conflicts with the remittance's exact family, school, or source evidence. No family ledger was changed.", 409);
    const familyAgencyEntries = await tx.ledgerEntry.findMany({
      where: {
        billingAccountId: billingAccount.id,
        OR: [
          { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
          { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
        ],
      },
      select: { amountCents: true },
    });
    const reversalCents = Math.abs(legacyPaymentEntry.amountCents);
    const totalAgencyResponsibilityBeforeCents = familyAgencyEntries.reduce((total, entry) => total + entry.amountCents, 0);
    const parentVisibleBeforeCents = billingAccount.balanceCents - Math.max(0, totalAgencyResponsibilityBeforeCents);
    const parentVisibleAfterCents = billingAccount.balanceCents + reversalCents
      - Math.max(0, totalAgencyResponsibilityBeforeCents + reversalCents);
    if (parentVisibleAfterCents !== parentVisibleBeforeCents) {
      throw new AgencyWorkflowError("This legacy family-ledger reversal would change parent-visible responsibility. Use a separately reviewed historical correction; no remittance or ledger reversal was posted.", 409);
    }
    const updatedAccount = await tx.billingAccount.update({ where: { id: legacyPaymentEntry.billingAccountId }, data: { balanceCents: { increment: reversalCents } } });
    const reversalEntry = await tx.ledgerEntry.create({ data: {
      billingAccountId: legacyPaymentEntry.billingAccountId,
      type: "agency_payment_reversal",
      description: `Reversed legacy family-ledger agency settlement for ${remittance.claim.number}`,
      amountCents: reversalCents,
      balanceAfterCents: 0,
      effectiveAt: postingEffectiveAt,
      sourceSystem: "subsidy_agency",
      externalId: `agency-remittance-reversal:${remittance.id}`,
      metadata: {
        ...recordValue(legacyPaymentEntry.metadata),
        remittanceId: remittance.id,
        claimId: remittance.claimId,
        originalLedgerEntryId: legacyPaymentEntry.id,
        reason: input.reason,
        sourceReversedAt: sourceReversedAt.toISOString(),
        postingRule: "later of source reversal and receipt effective time",
        legacyCompatibilityMirror: true,
      },
    } });
    await recalculateLegacyFamilyLedgerBalances(tx, legacyPaymentEntry.billingAccountId, updatedAccount.balanceCents);
    legacyFamilyReversalLedgerEntryId = reversalEntry.id;
  }
  const activeRemittances = await tx.subsidyRemittance.findMany({ where: { claimId: remittance.claimId, reversedAt: null }, select: { amountCents: true, reversedAt: true } });
  const paidCents = activeRemittanceTotalCents(activeRemittances);
  const claim = await tx.subsidyClaim.update({ where: { id: remittance.claimId }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: remittance.claim.claimedCents, approvedCents: remittance.claim.approvedCents, paidCents }) } });
  if (remittance.allocation) await tx.agencyRemittanceAllocation.update({ where: { id: remittance.allocation.id }, data: { status: "reversed" } });
  const agencyLedgerAccount = options.recalculateAgencyLedger === false
    ? agencyReversal.account
    : await recalculateAgencyLedgerBalances(tx, agencyReversal.account.id);
  return {
    remittance,
    remittanceId: remittance.id,
    claim,
    agencyLedgerAccountId: agencyReversal.account.id,
    agencyLedgerEntryId: agencyReversal.entry.id,
    agencyLedgerBalanceCents: agencyLedgerAccount.balanceCents,
    legacyFamilyReversalLedgerEntryId,
    reversalLedgerEntryId: legacyFamilyReversalLedgerEntryId,
  };
}

async function agencyCsvSnapshotResponse(
  filename: string,
  produce: (tx: Prisma.TransactionClient, append: (text: string, rows?: number) => Promise<void>) => Promise<void>,
) {
  const exportDirectory = await mkdtemp(join(tmpdir(), "bee-agency-export-"));
  const exportPath = join(exportDirectory, filename);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  let totalRows = 0;
  let totalBytes = 0;
  let pendingBytes = 0;
  let pendingBuffers: Buffer[] = [];
  try {
    handle = await open(exportPath, "wx");
    const writeAll = async (bytes: Buffer) => {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesWritten } = await handle!.write(bytes, offset, bytes.byteLength - offset, null);
        if (bytesWritten <= 0) throw new Error("Unable to finish the agency CSV snapshot write.");
        offset += bytesWritten;
      }
    };
    const flush = async () => {
      if (!pendingBytes) return;
      const bytes = pendingBuffers.length === 1 ? pendingBuffers[0] : Buffer.concat(pendingBuffers, pendingBytes);
      pendingBuffers = [];
      pendingBytes = 0;
      await writeAll(bytes);
    };
    await prisma.$transaction(async (tx) => {
      await produce(tx, async (text, rows = 0) => {
        if (!text) return;
        const byteLength = Buffer.byteLength(text, "utf8");
        if (totalRows + rows > AGENCY_CSV_EXPORT_MAX_ROWS || totalBytes + byteLength > AGENCY_CSV_EXPORT_MAX_BYTES) {
          throw new AgencyWorkflowError(
            "This agency export exceeds the safe snapshot limit. Export one authorized school at a time or contact support for a controlled segmented export.",
            413,
          );
        }
        totalRows += rows;
        totalBytes += byteLength;
        pendingBuffers.push(Buffer.from(text, "utf8"));
        pendingBytes += byteLength;
        if (pendingBytes >= 64 * 1024) await flush();
      });
      await flush();
    }, AGENCY_READ_SNAPSHOT_OPTIONS);
    await handle.close();
    handle = null;

    // The file is complete and the database snapshot is already released. A
    // slow or cancelled client can no longer pin a connection or MVCC state.
    const fileStream = createReadStream(exportPath);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      void rm(exportDirectory, { recursive: true, force: true });
    };
    fileStream.once("close", cleanup);
    fileStream.once("error", cleanup);
    return new Response(Readable.toWeb(fileStream) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Content-Length": String(totalBytes),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(exportDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function exportClaimsCsv(centerIds: string[]) {
  return agencyCsvSnapshotResponse("agency-claims.csv", async (tx, enqueue) => {
    let cursorId: string | undefined;
    await enqueue(csvRow(["School ID", "School", "Claim", "Agency", "Family", "Child", "Service start", "Service end", "Status", "Claimed", "Approved", "Paid", "Missing documents"]));
    do {
      const claimRows = await tx.subsidyClaim.findMany({
        where: { centerId: { in: centerIds } },
        orderBy: { id: "asc" },
        take: 250,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: {
          center: { select: { id: true, name: true } },
          agencyProgram: { select: { id: true, centerId: true, name: true, requirements: true } },
          authorization: { include: {
            agencyProgram: { select: { id: true, centerId: true } },
            child: { select: { id: true, familyId: true, fullName: true } },
            family: { select: { id: true, centerId: true, name: true } },
          } },
          lines: { select: { childId: true } },
          documents: { orderBy: { name: "asc" } },
        },
      });
      const claims = claimRows.filter((claim) => claim.center.id === claim.centerId && exactAgencyClaimScope(claim));
      for (const claim of claims) {
        const missingDocuments = claim.documents
          .filter((document) => !["received", "verified", "not_applicable"].includes(document.status))
          .map((document) => document.name);
        if (["draft", "ready", "submitted"].includes(claim.status)) {
          const documentKeys = new Set(claim.documents.map((document) => `${document.name.trim().toLowerCase()}|${document.type.trim().toLowerCase()}`));
          for (const requirement of claimRequirements(claim)) {
            const key = `${requirement.label.trim().toLowerCase()}|${requirement.type.trim().toLowerCase()}`;
            if (!documentKeys.has(key)) missingDocuments.push(requirement.label);
          }
        }
        await enqueue(csvRow([
          claim.centerId,
          claim.center.name,
          claim.number,
          claim.agencyProgram.name,
          claim.authorization?.family.name ?? "",
          claim.authorization?.child.fullName ?? "",
          dateInput(claim.servicePeriodStart),
          dateInput(claim.servicePeriodEnd),
          claim.status,
          claim.claimedCents / 100,
          claim.approvedCents === null ? "" : claim.approvedCents / 100,
          claim.paidCents / 100,
          [...new Set(missingDocuments)].join("; "),
        ]), 1);
      }
      cursorId = claimRows.at(-1)?.id;
      if (claimRows.length < 250) return;
    } while (true);
  });
}

function agencyEntryGlCode(type: string, program: { receivableGlCode: string | null; cashGlCode: string | null; adjustmentGlCode: string | null }) {
  if (type.startsWith("adjustment_")) return program.adjustmentGlCode ?? "";
  if (type.includes("remittance") || type.includes("unapplied_cash")) return program.cashGlCode ?? "";
  return program.receivableGlCode ?? "";
}

function exportAgencyLedgerCsv(centerIds: string[]) {
  return agencyCsvSnapshotResponse("agency-ledger.csv", async (tx, enqueue) => {
    let cursorId: string | undefined;
    await enqueue(csvRow(["School ID", "School", "Date", "Agency", "Program", "Type", "GL code", "Cost center", "Claim", "Family", "Child", "Reference", "Charge", "Payment / credit", "Net", "Balance"]));
    do {
      const entryRows = await tx.agencyLedgerEntry.findMany({
        where: { agencyLedgerAccount: { centerId: { in: centerIds } } },
        orderBy: [
          { agencyLedgerAccountId: "asc" },
          { effectiveAt: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
        take: 250,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: {
          agencyLedgerAccount: { include: {
            center: { select: { id: true, name: true } },
            agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } },
          } },
          claim: { include: {
            agencyProgram: { select: { id: true, centerId: true } },
            authorization: { include: {
              agencyProgram: { select: { id: true, centerId: true } },
              family: { select: { id: true, centerId: true, name: true } },
              child: { select: { id: true, familyId: true, fullName: true } },
            } },
            lines: { select: { childId: true } },
          } },
        },
      });
      const entries = entryRows.filter((entry) => entry.agencyLedgerAccount.center.id === entry.agencyLedgerAccount.centerId
        && exactAgencyProgramScope(entry.agencyLedgerAccount)
        && (!entry.claim || exactAgencyClaimScope(entry.claim)));
      for (const entry of entries) {
        await enqueue(csvRow([
          entry.agencyLedgerAccount.centerId,
          entry.agencyLedgerAccount.center.name,
          dateInput(entry.effectiveAt),
          entry.agencyLedgerAccount.agencyProgram.name,
          entry.agencyLedgerAccount.agencyProgram.programName ?? "",
          entry.type,
          entry.glCodeSnapshot ?? "",
          entry.costCenterCodeSnapshot ?? "",
          entry.claim?.number ?? "",
          entry.claim?.authorization?.family.name ?? "",
          entry.claim?.authorization?.child.fullName ?? "",
          entry.externalReference ?? "",
          entry.amountCents > 0 ? entry.amountCents / 100 : "",
          entry.amountCents < 0 ? Math.abs(entry.amountCents) / 100 : "",
          entry.amountCents / 100,
          entry.balanceAfterCents / 100,
        ]), 1);
      }
      cursorId = entryRows.at(-1)?.id;
      if (entryRows.length < 250) return;
    } while (true);
  });
}

async function exportAgencyReconciliationCsv(centerIds: string[]) {
  return agencyCsvSnapshotResponse("agency-reconciliation.csv", async (tx, enqueue) => {
    await enqueue(csvRow(["School ID", "School", "Agency", "Program", "A/R GL", "Cash GL", "Adjustment GL", "Cost center", "Approved", "Remitted", "Unapplied cash", "Adjustments", "Expected balance", "Ledger balance", "Variance", "Open batch exceptions"]));
    let cursorId: string | undefined;
    do {
      const accountRows = await tx.agencyLedgerAccount.findMany({
        where: { centerId: { in: centerIds } },
        orderBy: [{ centerId: "asc" }, { agencyProgram: { name: "asc" } }, { agencyProgramId: "asc" }, { id: "asc" }],
        take: 250,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: { center: { select: { id: true, name: true } }, agencyProgram: { select: { id: true, centerId: true, name: true, programName: true, receivableGlCode: true, cashGlCode: true, adjustmentGlCode: true, costCenterCode: true } } },
      });
      const accounts = accountRows.filter((account) => account.center.id === account.centerId && exactAgencyProgramScope(account));
      const agencyProgramIds = [...new Set(accounts.map((account) => account.agencyProgramId))];
      if (agencyProgramIds.length) {
        const [claimAggregates, batchAggregates, adjustmentAggregates, openBatchAggregates] = await Promise.all([
          agencyReconciliationClaimAggregates(tx, centerIds, new Date(), agencyProgramIds),
          tx.agencyRemittanceBatch.groupBy({
            by: ["agencyProgramId"],
            where: { centerId: { in: centerIds }, agencyProgramId: { in: agencyProgramIds }, status: { in: ACTIVE_REMITTANCE_BATCH_STATUSES }, reviewedAt: { not: null }, reversedAt: null },
            _sum: { unappliedCents: true },
          }),
          tx.agencyLedgerAdjustment.groupBy({
            by: ["agencyProgramId"],
            where: { centerId: { in: centerIds }, agencyProgramId: { in: agencyProgramIds }, status: "posted" },
            _sum: { amountCents: true },
          }),
          tx.agencyRemittanceBatch.groupBy({
            by: ["agencyProgramId"],
            where: { centerId: { in: centerIds }, agencyProgramId: { in: agencyProgramIds }, status: { in: [...OPEN_REMITTANCE_BATCH_STATUSES] }, reversedAt: null },
            _count: { _all: true },
          }),
        ]);
        const claimsByProgram = new Map(claimAggregates.map((row) => [row.agencyProgramId, row]));
        const unappliedByProgram = new Map(batchAggregates.map((row) => [row.agencyProgramId, row._sum.unappliedCents ?? 0]));
        const adjustmentsByProgram = new Map(adjustmentAggregates.map((row) => [row.agencyProgramId, row._sum.amountCents ?? 0]));
        const openBatchesByProgram = new Map(openBatchAggregates.map((row) => [row.agencyProgramId, row._count._all]));
        for (const account of accounts) {
          const claimTotals = claimsByProgram.get(account.agencyProgramId);
          const approvedCents = Number(claimTotals?.approvedCents ?? 0);
          const remittedCents = Number(claimTotals?.remittedCents ?? 0);
          const unappliedCents = unappliedByProgram.get(account.agencyProgramId) ?? 0;
          const adjustmentCents = adjustmentsByProgram.get(account.agencyProgramId) ?? 0;
          const expectedBalanceCents = approvedCents - remittedCents - unappliedCents + adjustmentCents;
          await enqueue(csvRow([
            account.centerId,
            account.center.name,
            account.agencyProgram.name,
            account.agencyProgram.programName ?? "",
            account.agencyProgram.receivableGlCode ?? "",
            account.agencyProgram.cashGlCode ?? "",
            account.agencyProgram.adjustmentGlCode ?? "",
            account.agencyProgram.costCenterCode ?? "",
            approvedCents / 100,
            remittedCents / 100,
            unappliedCents / 100,
            adjustmentCents / 100,
            expectedBalanceCents / 100,
            account.balanceCents / 100,
            (account.balanceCents - expectedBalanceCents) / 100,
            openBatchesByProgram.get(account.agencyProgramId) ?? 0,
          ]), 1);
        }
      }
      cursorId = accountRows.at(-1)?.id;
      if (accountRows.length < 250) return;
    } while (true);
  });
}

function exportAgencyDepositsCsv(centerIds: string[]) {
  return agencyCsvSnapshotResponse("agency-deposits.csv", async (tx, enqueue) => {
    let cursorId: string | undefined;
    await enqueue(csvRow(["School ID", "School", "Agency", "Program", "Paid date", "Deposit reference", "Method", "Cash GL", "Cost center", "Deposit total", "Allocated", "Unapplied", "Batch status", "Evidence", "Evidence reference", "Follow-up owner", "Follow-up due", "Claim", "Claim allocation", "Allocation status"]));
    do {
      const batchRows = await tx.agencyRemittanceBatch.findMany({
        where: { centerId: { in: centerIds } },
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: 100,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: {
          center: { select: { id: true, name: true } },
          agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } },
        },
      });
      const batches = batchRows.filter((batch) => batch.center.id === batch.centerId && exactAgencyProgramScope(batch));
      for (const batch of batches) {
        let allocationCursorId: string | undefined;
        let wroteAllocation = false;
        do {
          const allocationRows = await tx.agencyRemittanceAllocation.findMany({
            where: { batchId: batch.id },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 250,
            ...(allocationCursorId ? { cursor: { id: allocationCursorId }, skip: 1 } : {}),
            include: { claim: { select: { id: true, centerId: true, agencyProgramId: true, number: true } } },
          });
          const allocations = allocationRows.filter((allocation) => allocation.claim.centerId === batch.centerId && allocation.claim.agencyProgramId === batch.agencyProgramId);
          for (const allocation of allocations) {
            wroteAllocation = true;
            await enqueue(csvRow([
              batch.centerId,
              batch.center.name,
              batch.agencyProgram.name,
              batch.agencyProgram.programName ?? "",
              dateInput(batch.paidAt),
              batch.externalReference,
              batch.paymentMethod,
              batch.cashGlCodeSnapshot ?? "",
              batch.costCenterCodeSnapshot ?? "",
              batch.totalCents / 100,
              batch.allocatedCents / 100,
              batch.unappliedCents / 100,
              batch.status,
              batch.evidenceName ?? "",
              batch.evidenceReference ?? "",
              batch.followUpOwnerId ?? "",
              batch.followUpDueAt ? dateInput(batch.followUpDueAt) : "",
              allocation.claim.number,
              allocation.amountCents / 100,
              allocation.status,
            ]), 1);
          }
          allocationCursorId = allocationRows.at(-1)?.id;
          if (allocationRows.length < 250) break;
        } while (true);
        if (!wroteAllocation) {
          await enqueue(csvRow([
            batch.centerId,
            batch.center.name,
            batch.agencyProgram.name,
            batch.agencyProgram.programName ?? "",
            dateInput(batch.paidAt),
            batch.externalReference,
            batch.paymentMethod,
            batch.cashGlCodeSnapshot ?? "",
            batch.costCenterCodeSnapshot ?? "",
            batch.totalCents / 100,
            batch.allocatedCents / 100,
            batch.unappliedCents / 100,
            batch.status,
            batch.evidenceName ?? "",
            batch.evidenceReference ?? "",
            batch.followUpOwnerId ?? "",
            batch.followUpDueAt ? dateInput(batch.followUpDueAt) : "",
            "",
            "",
            "",
          ]), 1);
        }
      }
      cursorId = batchRows.at(-1)?.id;
      if (batchRows.length < 100) return;
    } while (true);
  });
}

async function currentBillingUser(): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!canManageBilling(user)) return { ok: false, response: NextResponse.json({ ok: false, error: "Billing access required." }, { status: 403 }) };
  return { ok: true, user };
}

async function currentAgencyBillingReader(): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!canManageBilling(user) && user.role !== "READ_ONLY_AUDITOR") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Agency billing access required." }, { status: 403 }) };
  }
  return { ok: true, user };
}

function centerAllowed(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, centerId: string) {
  return Boolean(centerId && canAccessCenter(user, centerId));
}

function agencyMutationWorkspaceSelected(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return user.workspace?.mode === "center" || user.workspace?.mode === "fixed";
}

function agencyMutationCenterAllowed(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, centerId: string) {
  if (!agencyMutationWorkspaceSelected(user) || !centerAllowed(user, centerId)) return false;
  if (user.workspace?.mode === "center") return user.workspace.activeCenterId === centerId;
  // Fixed-workspace operating roles can legitimately hold grants for more than
  // one school even though they do not use the executive workspace switcher.
  return user.workspace?.mode === "fixed";
}

type AgencyAuthorizationScopeRecord = {
  id: string;
  centerId: string;
  agencyProgramId: string;
  familyId: string;
  childId: string;
  agencyProgram: { id: string; centerId: string };
  family: { id: string; centerId: string | null };
  child: { id: string; familyId: string };
};

function exactAgencyAuthorizationScope(authorization: AgencyAuthorizationScopeRecord) {
  return authorization.agencyProgram.id === authorization.agencyProgramId
    && authorization.agencyProgram.centerId === authorization.centerId
    && authorization.family.id === authorization.familyId
    && authorization.family.centerId === authorization.centerId
    && authorization.child.id === authorization.childId
    && authorization.child.familyId === authorization.familyId;
}

type AgencyClaimScopeRecord = {
  centerId: string;
  agencyProgramId: string;
  authorizationId: string | null;
  agencyProgram: { id: string; centerId: string };
  authorization: AgencyAuthorizationScopeRecord | null;
  lines: Array<{ childId: string }>;
};

function exactAgencyClaimScope(claim: AgencyClaimScopeRecord) {
  if (claim.agencyProgram.id !== claim.agencyProgramId || claim.agencyProgram.centerId !== claim.centerId) return false;
  if (!claim.authorization) return claim.authorizationId === null && claim.lines.length === 0;
  return claim.authorizationId === claim.authorization.id
    && claim.authorization.centerId === claim.centerId
    && claim.authorization.agencyProgramId === claim.agencyProgramId
    && exactAgencyAuthorizationScope(claim.authorization)
    && claim.lines.every((line) => line.childId === claim.authorization?.childId);
}

async function requireCurrentAgencyClaimMutationScope(
  tx: Prisma.TransactionClient,
  claimId: string,
  centerId: string,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
) {
  const current = await tx.subsidyClaim.findUnique({
    where: { id: claimId },
    include: {
      agencyProgram: true,
      authorization: { include: {
        agencyProgram: { select: { id: true, centerId: true } },
        family: { select: { id: true, centerId: true } },
        child: { select: { id: true, familyId: true } },
      } },
      lines: { select: { childId: true } },
      documents: true,
    },
  });
  if (!current
    || current.centerId !== centerId
    || !agencyMutationCenterAllowed(user, current.centerId)
    || !exactAgencyClaimScope(current)) {
    throw new AgencyWorkflowError("Claim not found.", 404);
  }
  return current;
}

function exactAgencyProgramScope(record: { centerId: string; agencyProgramId: string; agencyProgram: { id: string; centerId: string } }) {
  return record.agencyProgram.id === record.agencyProgramId && record.agencyProgram.centerId === record.centerId;
}

type AgencyIdempotencyReplay<T> =
  | { kind: "missing" }
  | { kind: "not_found" }
  | { kind: "mismatch" }
  | { kind: "reused"; record: T };

function agencyIdempotencyReplay<T>(input: {
  record: T | null;
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  expectedCenterId?: string | null;
  requestedFingerprint: string;
  centerId(record: T): string;
  ownerId(record: T): string;
  fingerprint(record: T): string;
}): AgencyIdempotencyReplay<T> {
  if (!input.record) return { kind: "missing" };
  const recordCenterId = input.centerId(input.record);
  if (
    (input.expectedCenterId && recordCenterId !== input.expectedCenterId)
    || !centerAllowed(input.user, recordCenterId)
    || input.ownerId(input.record) !== input.user.id
  ) return { kind: "not_found" };
  if (input.fingerprint(input.record) !== input.requestedFingerprint) return { kind: "mismatch" };
  return { kind: "reused", record: input.record };
}

async function getHandler(request: NextRequest) {
  const auth = await currentAgencyBillingReader();
  if (!auth.ok) return auth.response;
  const requestedCenterId = clean(request.nextUrl.searchParams.get("centerId"));
  const exportingClaims = request.nextUrl.searchParams.get("exportClaims") === "true";
  const exportingLedger = request.nextUrl.searchParams.get("exportLedger") === "true";
  const exportingReconciliation = request.nextUrl.searchParams.get("exportReconciliation") === "true";
  const exportingDeposits = request.nextUrl.searchParams.get("exportDeposits") === "true";
  const requestedClaimPage = Number.parseInt(clean(request.nextUrl.searchParams.get("claimPage")) || "1", 10);
  const claimPage = Math.min(Math.max(Number.isFinite(requestedClaimPage) ? requestedClaimPage : 1, 1), 10_000);
  const requestedBatchPage = Number.parseInt(clean(request.nextUrl.searchParams.get("batchPage")) || "1", 10);
  const batchPage = Math.min(Math.max(Number.isFinite(requestedBatchPage) ? requestedBatchPage : 1, 1), 10_000);
  const requestedAdjustmentPage = Number.parseInt(clean(request.nextUrl.searchParams.get("adjustmentPage")) || "1", 10);
  const adjustmentPage = Math.min(Math.max(Number.isFinite(requestedAdjustmentPage) ? requestedAdjustmentPage : 1, 1), 10_000);
  const claimCursor = clean(request.nextUrl.searchParams.get("claimCursor"));
  const batchCursor = clean(request.nextUrl.searchParams.get("batchCursor"));
  const adjustmentCursor = clean(request.nextUrl.searchParams.get("adjustmentCursor"));
  const ledgerCursor = clean(request.nextUrl.searchParams.get("ledgerCursor"));
  const ledgerAccountId = clean(request.nextUrl.searchParams.get("ledgerAccountId"));
  const ledgerType = clean(request.nextUrl.searchParams.get("ledgerType"));
  const ledgerQuery = clean(request.nextUrl.searchParams.get("ledgerQuery"));
  const ledgerFromInput = dateValue(request.nextUrl.searchParams.get("ledgerFrom"));
  const ledgerToInput = dateValue(request.nextUrl.searchParams.get("ledgerTo"));
  const ledgerFrom = ledgerFromInput ? agencyUtcCalendarRange(ledgerFromInput, ledgerFromInput).startInclusive : null;
  const ledgerToExclusive = ledgerToInput ? agencyUtcCalendarRange(ledgerToInput, ledgerToInput).endExclusive : null;
  const centerIds = requestedCenterId
    ? centerAllowed(auth.user, requestedCenterId) ? [requestedCenterId] : []
    : auth.user.centerIds;
  if (!centerIds.length) return NextResponse.json({ ok: false, error: "No accessible school selected." }, { status: 403 });
  if (exportingClaims || exportingLedger || exportingReconciliation || exportingDeposits) {
    try {
      if (exportingClaims) return await exportClaimsCsv(centerIds);
      if (exportingLedger) return await exportAgencyLedgerCsv(centerIds);
      if (exportingReconciliation) return await exportAgencyReconciliationCsv(centerIds);
      return await exportAgencyDepositsCsv(centerIds);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) {
        return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      }
      throw error;
    }
  }
  if (claimPage > 1 && !claimCursor) return NextResponse.json({ ok: false, error: "Refresh the claim queue before opening that page." }, { status: 400 });
  if (batchPage > 1 && !batchCursor) return NextResponse.json({ ok: false, error: "Refresh the deposit history before opening that page." }, { status: 400 });
  if (adjustmentPage > 1 && !adjustmentCursor) return NextResponse.json({ ok: false, error: "Refresh the adjustment history before opening that page." }, { status: 400 });

  const ledgerWhere: Prisma.AgencyLedgerEntryWhereInput = {
    agencyLedgerAccount: { centerId: { in: centerIds }, ...(ledgerAccountId ? { id: ledgerAccountId } : {}) },
    ...(ledgerType ? { type: ledgerType } : {}),
    ...(ledgerFrom || ledgerToExclusive ? { effectiveAt: { ...(ledgerFrom ? { gte: ledgerFrom } : {}), ...(ledgerToExclusive ? { lt: ledgerToExclusive } : {}) } } : {}),
    ...(ledgerQuery ? { OR: [
      { externalReference: { contains: ledgerQuery, mode: "insensitive" } },
      { description: { contains: ledgerQuery, mode: "insensitive" } },
      { claim: { number: { contains: ledgerQuery, mode: "insensitive" } } },
    ] } : {}),
  };

  const snapshotAsOf = new Date();
  const { activationCenters, dashboardRows } = await prisma.$transaction(async (tx) => {
    const activationCenters = await tx.center.findMany({
      where: { id: { in: centerIds } },
      select: {
        id: true,
        agencyReconciliationEnabled: true,
        agencyPrograms: {
          where: { status: "active" },
          select: {
            name: true,
            status: true,
            receivableGlCode: true,
            cashGlCode: true,
            adjustmentGlCode: true,
            costCenterCode: true,
          },
        },
      },
    });
    const dashboardRows = await Promise.all([
    tx.agencyProgram.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ stateCode: "asc" }, { name: "asc" }],
    }),
    tx.subsidyAuthorization.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ coverageEnd: "asc" }, { createdAt: "desc" }],
      include: {
        agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } },
        family: { select: { id: true, centerId: true, name: true } },
        child: { select: { id: true, familyId: true, fullName: true, enrollmentStatus: true, classroomId: true } },
      },
    }),
    tx.subsidyClaim.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ createdAt: "desc" }, { dueDate: "asc" }, { id: "desc" }],
      ...(claimCursor ? { cursor: { id: claimCursor }, skip: 1 } : {}),
      take: CLAIM_PAGE_SIZE + 1,
      include: {
        agencyProgram: { select: { id: true, centerId: true, name: true, programName: true, providerNumber: true, vendorNumber: true, submissionMethod: true, portalUrl: true, paymentInstructions: true, requirements: true } },
        authorization: { include: {
          agencyProgram: { select: { id: true, centerId: true } },
          child: { select: { id: true, familyId: true, fullName: true } },
          family: { select: { id: true, centerId: true, name: true } },
        } },
        lines: true,
        documents: { orderBy: { name: "asc" } },
        remittances: { orderBy: { paidAt: "desc" }, include: { allocation: { select: { batchId: true } } } },
      },
    }),
    tx.$queryRaw<AgencySummaryRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(claim."claimedCents"), 0)::bigint AS "claimedCents",
        COALESCE(SUM(COALESCE(claim."approvedCents", 0)), 0)::bigint AS "approvedCents",
        COALESCE(SUM(claim."paidCents"), 0)::bigint AS "paidCents",
        COALESCE(SUM(CASE
          WHEN claim.status IN ('submitted', 'approved', 'partially_paid')
          THEN GREATEST(COALESCE(claim."approvedCents", claim."claimedCents") - claim."paidCents", 0)
          ELSE 0
        END), 0)::bigint AS "outstandingCents",
        COUNT(*) FILTER (WHERE claim.status IN ('draft', 'ready'))::bigint AS "needsSubmission",
        COUNT(*) FILTER (WHERE claim.status IN ('draft', 'ready', 'submitted') AND (
          EXISTS (
            SELECT 1 FROM "SubsidyClaimDocument" document
            WHERE document."claimId" = claim.id
              AND document.status NOT IN ('received', 'verified', 'not_applicable')
          ) OR EXISTS (
            SELECT 1
            FROM (
              SELECT DISTINCT ON (requirement_key) requirement
              FROM (
                SELECT requirement, 0 AS source_order, ordinal
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(program.requirements) = 'array' THEN program.requirements ELSE '[]'::jsonb END) WITH ORDINALITY AS program_requirement(requirement, ordinal)
                UNION ALL
                SELECT requirement, 1 AS source_order, ordinal
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(subsidy_authorization."requiredDocuments") = 'array' THEN subsidy_authorization."requiredDocuments" ELSE '[]'::jsonb END) WITH ORDINALITY AS authorization_requirement(requirement, ordinal)
              ) raw_requirement
              CROSS JOIN LATERAL (
                SELECT REGEXP_REPLACE(
                  LOWER(COALESCE(NULLIF(raw_requirement.requirement->>'key', ''), COALESCE(NULLIF(raw_requirement.requirement->>'type', ''), 'supporting_document') || ':' || COALESCE(raw_requirement.requirement->>'label', ''))),
                  '[^a-z0-9:_-]+', '-', 'g'
                ) AS requirement_key
              ) normalized_requirement
              ORDER BY requirement_key, source_order, ordinal
            ) current_requirement
            WHERE COALESCE(current_requirement.requirement->>'label', '') <> ''
              AND COALESCE(current_requirement.requirement->>'required', 'true') <> 'false'
              AND NOT EXISTS (
                SELECT 1 FROM "SubsidyClaimDocument" current_document
                WHERE current_document."claimId" = claim.id
                  AND LOWER(TRIM(current_document.name)) = LOWER(TRIM(current_requirement.requirement->>'label'))
                  AND LOWER(TRIM(current_document.type)) = LOWER(TRIM(COALESCE(NULLIF(current_requirement.requirement->>'type', ''), 'supporting_document')))
              )
          )
        ))::bigint AS "missingDocumentClaims"
      FROM "SubsidyClaim" claim
      JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
      LEFT JOIN "SubsidyAuthorization" subsidy_authorization ON subsidy_authorization.id = claim."authorizationId"
      WHERE claim."centerId" IN (${Prisma.join(centerIds)})
        AND claim.status <> 'void'
    `),
    tx.family.findMany({
      where: { centerId: { in: centerIds }, children: { some: { OR: [{ enrollmentStatus: { in: CURRENT_ENROLLMENT_STATUSES }, classroomId: { not: null } }, { subsidyAuthorizations: { some: {} } }] } } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        centerId: true,
        name: true,
        guardians: { select: { fullName: true }, orderBy: { fullName: "asc" } },
        children: { where: { OR: [{ enrollmentStatus: { in: CURRENT_ENROLLMENT_STATUSES }, classroomId: { not: null } }, { subsidyAuthorizations: { some: {} } }] }, select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true }, orderBy: { fullName: "asc" } },
      },
    }),
    tx.agencyLedgerAccount.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ balanceCents: "desc" }, { agencyProgram: { name: "asc" } }],
      include: { agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } } },
    }),
    tx.agencyLedgerEntry.findMany({
      where: ledgerWhere,
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      ...(ledgerCursor ? { cursor: { id: ledgerCursor }, skip: 1 } : {}),
      take: AGENCY_LEDGER_ENTRY_LIMIT + 1,
      include: {
        agencyLedgerAccount: { include: { agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } } } },
        claim: { include: {
          agencyProgram: { select: { id: true, centerId: true } },
          authorization: { include: {
            agencyProgram: { select: { id: true, centerId: true } },
            family: { select: { id: true, centerId: true, name: true } },
            child: { select: { id: true, familyId: true, fullName: true } },
          } },
          lines: { select: { childId: true } },
        } },
        remittance: { select: { paymentMethod: true, reversedAt: true } },
      },
    }),
    tx.agencyRemittanceBatch.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      ...(batchCursor ? { cursor: { id: batchCursor }, skip: 1 } : {}),
      take: AGENCY_BATCH_LIMIT + 1,
      include: {
        agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } },
        allocations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { claim: { include: {
          agencyProgram: { select: { id: true, centerId: true } },
          authorization: { include: {
            agencyProgram: { select: { id: true, centerId: true } },
            family: { select: { id: true, centerId: true, name: true } },
            child: { select: { id: true, familyId: true, fullName: true } },
          } },
          lines: { select: { childId: true } },
        } }, remittance: { select: { enteredById: true } } } },
      },
    }),
    tx.agencyRemittanceBatch.findMany({
      where: { centerId: { in: centerIds }, reversedAt: null, status: { in: ["pending_review", "unmatched", "partially_allocated", "exception"] } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      include: {
        agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } },
        allocations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { claim: { include: {
          agencyProgram: { select: { id: true, centerId: true } },
          authorization: { include: {
            agencyProgram: { select: { id: true, centerId: true } },
            family: { select: { id: true, centerId: true, name: true } },
            child: { select: { id: true, familyId: true, fullName: true } },
          } },
          lines: { select: { childId: true } },
        } }, remittance: { select: { enteredById: true } } } },
      },
    }),
    tx.agencyLedgerAdjustment.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(adjustmentCursor ? { cursor: { id: adjustmentCursor }, skip: 1 } : {}),
      take: AGENCY_ADJUSTMENT_LIMIT + 1,
      include: { agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } }, claim: { select: { id: true, centerId: true, agencyProgramId: true, number: true } } },
    }),
    tx.agencyLedgerAdjustment.findMany({
      where: { centerId: { in: centerIds }, status: "pending_review", reversedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { agencyProgram: { select: { id: true, centerId: true, name: true, programName: true } }, claim: { select: { id: true, centerId: true, agencyProgramId: true, number: true } } },
    }),
    tx.agencyAccountingPeriod.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      include: { events: { orderBy: [{ sequence: "desc" }, { id: "desc" }] } },
    }),
    agencyReconciliationClaimAggregates(tx, centerIds, snapshotAsOf),
    tx.subsidyClaim.findMany({
      where: { centerId: { in: centerIds }, approvedCents: { gt: 0 }, status: { in: ["approved", "partially_paid"] } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        centerId: true,
        agencyProgramId: true,
        authorizationId: true,
        number: true,
        status: true,
        dueDate: true,
        approvedCents: true,
        claimedCents: true,
        paidCents: true,
        agencyProgram: { select: { id: true, centerId: true, name: true } },
        authorization: { select: {
          id: true,
          centerId: true,
          agencyProgramId: true,
          familyId: true,
          childId: true,
          agencyProgram: { select: { id: true, centerId: true } },
          child: { select: { id: true, familyId: true, fullName: true } },
          family: { select: { id: true, centerId: true, name: true } },
        } },
        lines: { select: { childId: true } },
      },
    }),
    tx.agencyRemittanceBatch.groupBy({
      by: ["agencyProgramId"],
      where: { centerId: { in: centerIds }, reviewedAt: { not: null }, reversedAt: null },
      _sum: { unappliedCents: true },
    }),
    tx.agencyLedgerAdjustment.groupBy({
      by: ["agencyProgramId"],
      where: { centerId: { in: centerIds }, status: "posted" },
      _sum: { amountCents: true },
    }),
    tx.ledgerEntry.aggregate({
      where: { sourceSystem: "subsidy_agency", billingAccount: { family: { centerId: { in: centerIds } } } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    tx.agencyRemittanceBatch.count({ where: { centerId: { in: centerIds }, status: "pending_review" } }),
    tx.agencyLedgerAdjustment.count({ where: { centerId: { in: centerIds }, status: "pending_review" } }),
    tx.agencyRemittanceBatch.count({ where: { centerId: { in: centerIds }, reversedAt: null, followUpDueAt: { lt: snapshotAsOf }, status: { in: ["pending_review", "unmatched", "partially_allocated", "exception"] } } }),
    tx.agencyLedgerAdjustment.count({ where: { centerId: { in: centerIds }, followUpDueAt: { lt: snapshotAsOf }, status: "pending_review" } }),
  ]);
    return { activationCenters, dashboardRows };
  }, AGENCY_READ_SNAPSHOT_OPTIONS);
  const [programs, authorizationRows, claimRows, summaryRows, families, ledgerAccountRows, ledgerEntryRows, recentBatchRows, unresolvedBatchRows, recentAdjustmentRows, unresolvedAdjustmentRows, accountingPeriods, reconciliationClaimAggregates, allocationClaimRows, reconciliationBatches, reconciliationAdjustments, legacyFamilyAgencyAggregate, pendingBatchReviews, pendingAdjustmentReviews, overdueBatchFollowUps, overdueAdjustmentFollowUps] = dashboardRows;
  const agencyReconciliationActivated = centerIds.length === 1
    && activationCenters.length === 1
    && activationCenters[0].agencyReconciliationEnabled;
  const agencyReconciliationBlockers = centerIds.length === 1 && activationCenters.length === 1
    ? agencyReconciliationActivationBlockers(activationCenters[0].agencyPrograms)
    : [];
  const agencyReconciliationEnabled = agencyReconciliationActivated && agencyReconciliationBlockers.length === 0;

  // Root center filters are not enough for legacy rows because these models have
  // independent foreign keys. Omit any row whose joined agency/family/child
  // relationships do not resolve back to the same exact school.
  const authorizations = authorizationRows.filter(exactAgencyAuthorizationScope);
  const claims = claimRows.filter(exactAgencyClaimScope);
  const allocationClaims = allocationClaimRows.filter(exactAgencyClaimScope);
  const ledgerAccounts = ledgerAccountRows.filter(exactAgencyProgramScope);
  const scopedLedgerEntryRows = ledgerEntryRows.filter((entry) => exactAgencyProgramScope(entry.agencyLedgerAccount) && (!entry.claim || exactAgencyClaimScope(entry.claim)));
  const scopeBatch = <T extends typeof recentBatchRows[number]>(batch: T) => exactAgencyProgramScope(batch) ? [{
    ...batch,
    allocations: batch.allocations.filter((allocation) => allocation.claim.centerId === batch.centerId && allocation.claim.agencyProgramId === batch.agencyProgramId && exactAgencyClaimScope(allocation.claim)),
  }] : [];
  const recentBatches = recentBatchRows.flatMap(scopeBatch);
  const unresolvedBatches = unresolvedBatchRows.flatMap(scopeBatch);
  const scopeAdjustment = <T extends typeof recentAdjustmentRows[number]>(adjustment: T) => exactAgencyProgramScope(adjustment)
    && (!adjustment.claim || (adjustment.claim.centerId === adjustment.centerId && adjustment.claim.agencyProgramId === adjustment.agencyProgramId));
  const recentAdjustments = recentAdjustmentRows.filter(scopeAdjustment);
  const unresolvedAdjustments = unresolvedAdjustmentRows.filter(scopeAdjustment);

  const hasNextBatchPage = recentBatchRows.length > AGENCY_BATCH_LIMIT;
  const visibleRecentBatches = recentBatches.filter((batch) => recentBatchRows.slice(0, AGENCY_BATCH_LIMIT).some((row) => row.id === batch.id));
  const nextBatchCursor = hasNextBatchPage ? recentBatchRows.slice(0, AGENCY_BATCH_LIMIT).at(-1)?.id ?? null : null;
  const batches = [...new Map([...unresolvedBatches, ...visibleRecentBatches].map((batch) => [batch.id, batch])).values()]
    .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime() || right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));
  const hasNextAdjustmentPage = recentAdjustmentRows.length > AGENCY_ADJUSTMENT_LIMIT;
  const visibleRecentAdjustments = recentAdjustments.filter((adjustment) => recentAdjustmentRows.slice(0, AGENCY_ADJUSTMENT_LIMIT).some((row) => row.id === adjustment.id));
  const nextAdjustmentCursor = hasNextAdjustmentPage ? recentAdjustmentRows.slice(0, AGENCY_ADJUSTMENT_LIMIT).at(-1)?.id ?? null : null;
  const adjustments = [...new Map([...unresolvedAdjustments, ...visibleRecentAdjustments].map((adjustment) => [adjustment.id, adjustment])).values()]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));

  const hasNextClaimPage = claimRows.length > CLAIM_PAGE_SIZE;
  const nextClaimCursor = hasNextClaimPage ? claimRows.slice(0, CLAIM_PAGE_SIZE).at(-1)?.id ?? null : null;
  const visibleClaims = claims.filter((claim) => claimRows.slice(0, CLAIM_PAGE_SIZE).some((row) => row.id === claim.id)).map((claim) => ({
    ...claim,
    requirementBlockers: ["draft", "ready", "submitted"].includes(claim.status) ? claimSubmissionBlockers({
      ...claim.agencyProgram,
      documents: claim.documents,
      requirements: claimRequirements(claim),
    }).filter((blocker) => blocker.startsWith("Add current required item:")) : [],
  }));
  const summaryRow = summaryRows[0];
  const now = snapshotAsOf;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const aging = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 };
  const claimTotalsByProgram = new Map<string, { approvedCents: number; remittedCents: number }>();
  let overdueClaimCount = 0;
  for (const aggregate of reconciliationClaimAggregates) {
    claimTotalsByProgram.set(aggregate.agencyProgramId, {
      approvedCents: Number(aggregate.approvedCents),
      remittedCents: Number(aggregate.remittedCents),
    });
    aging.current += Number(aggregate.currentCents);
    aging.days_1_30 += Number(aggregate.days1To30Cents);
    aging.days_31_60 += Number(aggregate.days31To60Cents);
    aging.days_61_90 += Number(aggregate.days61To90Cents);
    aging.days_91_plus += Number(aggregate.days91PlusCents);
    overdueClaimCount += Number(aggregate.overdueClaimCount);
  }
  const unappliedByProgram = new Map<string, number>();
  for (const batch of reconciliationBatches) {
    unappliedByProgram.set(batch.agencyProgramId, batch._sum.unappliedCents ?? 0);
  }
  const adjustmentByProgram = new Map<string, number>();
  for (const adjustment of reconciliationAdjustments) {
    adjustmentByProgram.set(adjustment.agencyProgramId, adjustment._sum.amountCents ?? 0);
  }
  const reconciliation = ledgerAccounts.map((account) => {
    const claimTotals = claimTotalsByProgram.get(account.agencyProgramId) ?? { approvedCents: 0, remittedCents: 0 };
    const unappliedCents = unappliedByProgram.get(account.agencyProgramId) ?? 0;
    const adjustmentCents = adjustmentByProgram.get(account.agencyProgramId) ?? 0;
    const expectedBalanceCents = claimTotals.approvedCents - claimTotals.remittedCents - unappliedCents + adjustmentCents;
    return {
      agencyLedgerAccountId: account.id,
      agencyProgramId: account.agencyProgramId,
      agency: account.agencyProgram,
      approvedCents: claimTotals.approvedCents,
      remittedCents: claimTotals.remittedCents,
      unappliedCents,
      adjustmentCents,
      expectedBalanceCents,
      ledgerBalanceCents: account.balanceCents,
      varianceCents: account.balanceCents - expectedBalanceCents,
    };
  });
  const legacyFamilyAgencyBalanceCents = legacyFamilyAgencyAggregate._sum.amountCents ?? 0;
  const hasNextLedgerPage = ledgerEntryRows.length > AGENCY_LEDGER_ENTRY_LIMIT;
  const nextLedgerCursor = hasNextLedgerPage ? ledgerEntryRows.slice(0, AGENCY_LEDGER_ENTRY_LIMIT).at(-1)?.id ?? null : null;
  const visibleLedgerEntries = scopedLedgerEntryRows.filter((entry) => ledgerEntryRows.slice(0, AGENCY_LEDGER_ENTRY_LIMIT).some((row) => row.id === entry.id));
  const summary = {
    claimedCents: Number(summaryRow?.claimedCents ?? 0),
    approvedCents: Number(summaryRow?.approvedCents ?? 0),
    paidCents: Number(summaryRow?.paidCents ?? 0),
    outstandingCents: Number(summaryRow?.outstandingCents ?? 0),
    needsSubmission: Number(summaryRow?.needsSubmission ?? 0),
    missingDocumentClaims: Number(summaryRow?.missingDocumentClaims ?? 0),
    agencyLedgerBalanceCents: ledgerAccounts.reduce((total, account) => total + account.balanceCents, 0),
    reconciliationVarianceCents: reconciliation.reduce((total, row) => total + row.varianceCents, 0),
    unappliedCashCents: reconciliationBatches.reduce((total, batch) => total + (batch._sum.unappliedCents ?? 0), 0),
    pendingBatchReviews,
    pendingAdjustmentReviews,
    overdueClaimCount,
    overdueFollowUpCount: overdueBatchFollowUps + overdueAdjustmentFollowUps,
    legacyFamilyAgencyBalanceCents,
    legacyFamilyAgencyEntryCount: legacyFamilyAgencyAggregate._count._all,
  };
  const programReadiness = programs.map((program) => {
    const setupBlockers = agencyProgramSetupBlockers(program);
    const controlledLedgerBlockers = agencyControlledLedgerSetupBlockers(program);
    return { ...program, status: setupBlockers.length ? "setup_required" : "active", setupBlockers, controlledLedgerBlockers };
  });
  const expirationCutoff = new Date(today);
  expirationCutoff.setUTCDate(expirationCutoff.getUTCDate() + 31);
  const readiness = {
    readyPrograms: programReadiness.filter((program) => program.status === "active").length,
    setupRequiredPrograms: programReadiness.filter((program) => program.status !== "active").length,
    expiredAuthorizations: authorizations.filter((authorization) => authorization.status === "active" && authorization.coverageEnd < today).length,
    expiringAuthorizations: authorizations.filter((authorization) => authorization.status === "active" && authorization.coverageEnd >= today && authorization.coverageEnd < expirationCutoff).length,
  };
  const mutationCenterSelected = centerIds.length === 1 && agencyMutationCenterAllowed(auth.user, centerIds[0]);

  return NextResponse.json({
    ok: true,
    programs: programReadiness,
    authorizations,
    claims: visibleClaims,
    allocationClaims,
    claimPagination: { page: claimPage, pageSize: CLAIM_PAGE_SIZE, hasNext: hasNextClaimPage, nextCursor: nextClaimCursor },
    families,
    summary: { ...summary, ...readiness },
    capabilities: {
      currentUserId: auth.user.id,
      canManageAgencyBilling: mutationCenterSelected && canManageBilling(auth.user),
      canReviewAgencyPosting: mutationCenterSelected && canCloseAgencyAccountingPeriod(auth.user.role),
      canCloseAccountingPeriod: mutationCenterSelected && canCloseAgencyAccountingPeriod(auth.user.role),
      requiresExactWorkspaceSelection: !mutationCenterSelected,
      agencyReconciliationActivated,
      agencyReconciliationEnabled,
      agencyReconciliationBlockers,
    },
    aging,
    reconciliation,
    remittanceBatches: batches,
    batchPagination: { page: batchPage, pageSize: AGENCY_BATCH_LIMIT, hasNext: hasNextBatchPage, nextCursor: nextBatchCursor },
    adjustments,
    adjustmentPagination: { page: adjustmentPage, pageSize: AGENCY_ADJUSTMENT_LIMIT, hasNext: hasNextAdjustmentPage, nextCursor: nextAdjustmentCursor },
    accountingPeriods,
    ledger: {
      accounts: ledgerAccounts,
      entries: visibleLedgerEntries,
      entryLimit: AGENCY_LEDGER_ENTRY_LIMIT,
      truncated: hasNextLedgerPage,
      hasNext: hasNextLedgerPage,
      nextCursor: nextLedgerCursor,
    },
  });
}

async function postHandler(request: NextRequest) {
  const auth = await currentBillingUser();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action);
  const centerId = clean(body.centerId);
  if (!agencyMutationWorkspaceSelected(auth.user)) {
    return NextResponse.json({ ok: false, error: "Switch the global workspace to one authorized school before creating or changing agency records." }, { status: 409 });
  }
  if (!centerId || centerId === "all" || !agencyMutationCenterAllowed(auth.user, centerId)) {
    return NextResponse.json({ ok: false, error: "Choose one authorized school before creating or changing agency records." }, { status: 403 });
  }

  if (action === "createProgram") {
    const name = clean(body.name);
    const stateCode = normalizeStateCode(body.stateCode);
    if (!name || !stateCode) return NextResponse.json({ ok: false, error: "Agency name and two-letter state are required." }, { status: 400 });
    const requirements = normalizeAgencyRequirements(body.requirements);
    const setup = {
      providerNumber: clean(body.providerNumber) || null,
      vendorNumber: clean(body.vendorNumber) || null,
      submissionMethod: clean(body.submissionMethod) || "agency_portal",
      portalUrl: clean(body.portalUrl) || null,
      paymentInstructions: clean(body.paymentInstructions) || null,
      receivableGlCode: clean(body.receivableGlCode) || null,
      cashGlCode: clean(body.cashGlCode) || null,
      adjustmentGlCode: clean(body.adjustmentGlCode) || null,
      costCenterCode: clean(body.costCenterCode) || null,
    };
    if (!SUBMISSION_METHODS.has(setup.submissionMethod)) return NextResponse.json({ ok: false, error: "Choose a supported agency submission method." }, { status: 400 });
    const nextStatus = agencyProgramStatus(setup);
    let program;
    try {
      program = await prisma.$transaction(async (tx) => {
        const center = await tx.center.findUnique({
          where: { id: centerId },
          select: {
            agencyReconciliationEnabled: true,
            agencyPrograms: { select: { name: true, status: true, receivableGlCode: true, cashGlCode: true, adjustmentGlCode: true, costCenterCode: true } },
          },
        });
        if (!center) throw new AgencyWorkflowError("School not found.", 404);
        const activationBlockers = agencyReconciliationActivationBlockers([
          ...center.agencyPrograms,
          { name, status: nextStatus, ...setup },
        ]);
        if (center.agencyReconciliationEnabled && activationBlockers.length) {
          throw new AgencyWorkflowError(`This school already uses reviewed reconciliation. Complete its active-program accounting mappings before saving. ${activationBlockers.join(" ")}`, 409);
        }
        const created = await tx.agencyProgram.create({ data: {
          centerId, name, stateCode, programName: clean(body.programName) || null,
          ...setup, remittanceEmail: clean(body.remittanceEmail) || null,
          requirements, status: nextStatus,
        } });
        await writeAuditLog(auth.user, { centerId, action: "billing.agency_program.created", resource: "AgencyProgram", resourceId: created.id, metadata: { stateCode, name, requirementCount: requirements.length, accountingMapping: { previous: null, next: { receivableGlCode: created.receivableGlCode, cashGlCode: created.cashGlCode, adjustmentGlCode: created.adjustmentGlCode, costCenterCode: created.costCenterCode } } } }, tx);
        return created;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The school or its agency programs changed at the same time. Refresh before saving this program again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, program });
  }

  if (action === "updateProgram") {
    const program = await prisma.agencyProgram.findUnique({ where: { id: clean(body.agencyProgramId) } });
    if (!program || program.centerId !== centerId) {
      return NextResponse.json({ ok: false, error: "Agency program not found." }, { status: 404 });
    }
    const name = clean(body.name);
    const stateCode = normalizeStateCode(body.stateCode);
    if (!name || !stateCode) return NextResponse.json({ ok: false, error: "Agency name and two-letter state are required." }, { status: 400 });
    const setup = {
      providerNumber: clean(body.providerNumber) || null,
      vendorNumber: clean(body.vendorNumber) || null,
      submissionMethod: clean(body.submissionMethod) || "agency_portal",
      portalUrl: clean(body.portalUrl) || null,
      paymentInstructions: clean(body.paymentInstructions) || null,
      receivableGlCode: clean(body.receivableGlCode) || null,
      cashGlCode: clean(body.cashGlCode) || null,
      adjustmentGlCode: clean(body.adjustmentGlCode) || null,
      costCenterCode: clean(body.costCenterCode) || null,
    };
    if (!SUBMISSION_METHODS.has(setup.submissionMethod)) return NextResponse.json({ ok: false, error: "Choose a supported agency submission method." }, { status: 400 });
    const nextStatus = agencyProgramStatus(setup);
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
      const current = await tx.agencyProgram.findUnique({ where: { id: program.id } });
      if (!current || current.centerId !== centerId) throw new AgencyWorkflowError("Agency program not found.", 404);
      const center = await tx.center.findUnique({
        where: { id: current.centerId },
        select: {
          agencyReconciliationEnabled: true,
          agencyPrograms: { select: { id: true, name: true, status: true, receivableGlCode: true, cashGlCode: true, adjustmentGlCode: true, costCenterCode: true } },
        },
      });
      if (!center) throw new AgencyWorkflowError("School not found.", 404);
      const activationBlockers = agencyReconciliationActivationBlockers(center.agencyPrograms.map((candidate) => (
        candidate.id === current.id ? { name, status: nextStatus, ...setup } : candidate
      )));
      if (center.agencyReconciliationEnabled && activationBlockers.length) {
        throw new AgencyWorkflowError(`This school already uses reviewed reconciliation. Keep at least one active program and complete every active-program accounting mapping. ${activationBlockers.join(" ")}`, 409);
      }
      const requirements = body.requirements === undefined ? current.requirements : normalizeAgencyRequirements(body.requirements);
      const changed = await tx.agencyProgram.update({ where: { id: current.id }, data: {
        name, stateCode, programName: clean(body.programName) || null,
        ...setup, remittanceEmail: clean(body.remittanceEmail) || null,
        requirements: requirements ?? undefined, status: nextStatus,
      } });
      await writeAuditLog(auth.user, {
        centerId: current.centerId,
        action: "billing.agency_program.updated",
        resource: "AgencyProgram",
        resourceId: current.id,
        metadata: {
          status: changed.status,
          hasProviderOrVendorNumber: Boolean(changed.providerNumber || changed.vendorNumber),
          submissionMethod: changed.submissionMethod,
          hasPortalUrl: Boolean(changed.portalUrl),
          hasPaymentInstructions: Boolean(changed.paymentInstructions),
          accountingMapping: {
            previous: { receivableGlCode: current.receivableGlCode, cashGlCode: current.cashGlCode, adjustmentGlCode: current.adjustmentGlCode, costCenterCode: current.costCenterCode },
            next: { receivableGlCode: changed.receivableGlCode, cashGlCode: changed.cashGlCode, adjustmentGlCode: changed.adjustmentGlCode, costCenterCode: changed.costCenterCode },
          },
        },
      }, tx);
      return changed;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The agency program or school changed at the same time. Refresh before saving the update again." }, { status: 409 });
      throw error;
    }
    const blockers = agencyProgramSetupBlockers(updated);
    const controlledLedgerBlockers = agencyControlledLedgerSetupBlockers(updated);
    return NextResponse.json({ ok: true, program: updated, blockers, controlledLedgerBlockers });
  }

  if (action === "createAuthorization") {
    const agencyProgramId = clean(body.agencyProgramId);
    const familyId = clean(body.familyId);
    const childId = clean(body.childId);
    const coverageStart = dateValue(body.coverageStart);
    const coverageEnd = dateValue(body.coverageEnd);
    const authorizationNumber = clean(body.authorizationNumber);
    const authorizedRateCents = cents(body.authorizedRateDollars);
    const familyCopayCents = cents(body.familyCopayDollars);
    const unitType = clean(body.unitType) || "weekly";
    const authorizedUnits = hasNumericInput(body.authorizedUnits) ? numberValue(body.authorizedUnits) : null;
    if (!coverageStart || !coverageEnd || coverageEnd < coverageStart || !authorizationNumber || authorizedRateCents <= 0) {
      return NextResponse.json({ ok: false, error: "Authorization number, valid coverage dates, and a positive agency rate are required." }, { status: 400 });
    }
    if (!validCurrencyInput(body.familyCopayDollars, true)) return NextResponse.json({ ok: false, error: "Enter the family copay as a valid dollar amount with no more than two decimal places." }, { status: 400 });
    if (familyCopayCents < 0) return NextResponse.json({ ok: false, error: "Family copay cannot be negative." }, { status: 400 });
    if (!AUTHORIZATION_UNIT_TYPES.has(unitType)) return NextResponse.json({ ok: false, error: "Choose a supported authorization rate unit." }, { status: 400 });
    if (authorizedUnits !== null && authorizedUnits <= 0) return NextResponse.json({ ok: false, error: "Authorized units must be greater than zero when provided." }, { status: 400 });
    let authorization;
    try {
      authorization = await prisma.$transaction(async (tx) => {
        const [program, family] = await Promise.all([
          tx.agencyProgram.findUnique({ where: { id: agencyProgramId } }),
          tx.family.findUnique({ where: { id: familyId }, include: { children: { select: { id: true, enrollmentStatus: true, classroomId: true } } } }),
        ]);
        const child = family?.children.find((item) => item.id === childId);
        if (!program || !family || program.centerId !== centerId || family.centerId !== centerId || !child) {
          throw new AgencyWorkflowError("Agency, family, and child must belong to the same accessible school.", 403);
        }
        if (!isCurrentlyEnrolledChildRecord(child)) throw new AgencyWorkflowError("Only a currently enrolled child with an assigned classroom can receive a new agency authorization.", 409);
        const programBlockers = agencyProgramSetupBlockers(program);
        if (programBlockers.length) throw new AgencyWorkflowError(`Complete agency setup before adding child authorizations. ${programBlockers.join(" ")}`, 409);
        const created = await tx.subsidyAuthorization.create({ data: {
          centerId: program.centerId, agencyProgramId, familyId, childId, authorizationNumber,
          coverageStart, coverageEnd, authorizedRateCents, familyCopayCents,
          unitType, authorizedUnits,
          requiredDocuments: normalizeAgencyRequirements(body.requiredDocuments),
        } });
        await writeAuditLog(auth.user, { centerId: created.centerId, action: "billing.subsidy_authorization.created", resource: "SubsidyAuthorization", resourceId: created.id, metadata: { agencyProgramId, familyId, childId, coverageStart, coverageEnd } }, tx);
        return created;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) {
        return NextResponse.json({ ok: false, error: "This authorization already exists for the selected child. Use Edit authorization to correct its rate or dates." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, authorization });
  }

  if (action === "updateAuthorization") {
    const coverageStart = dateValue(body.coverageStart);
    const coverageEnd = dateValue(body.coverageEnd);
    const authorizationNumber = clean(body.authorizationNumber);
    const authorizedRateCents = cents(body.authorizedRateDollars);
    const familyCopayCents = cents(body.familyCopayDollars);
    const authorizedUnits = hasNumericInput(body.authorizedUnits) ? numberValue(body.authorizedUnits) : null;
    if (!coverageStart || !coverageEnd || coverageEnd < coverageStart || !authorizationNumber || authorizedRateCents <= 0) return NextResponse.json({ ok: false, error: "Authorization number, valid coverage dates, and a positive agency rate are required." }, { status: 400 });
    if (!validCurrencyInput(body.familyCopayDollars, true)) return NextResponse.json({ ok: false, error: "Enter the family copay as a valid dollar amount with no more than two decimal places." }, { status: 400 });
    if (familyCopayCents < 0) return NextResponse.json({ ok: false, error: "Family copay cannot be negative." }, { status: 400 });
    if (authorizedUnits !== null && authorizedUnits <= 0) return NextResponse.json({ ok: false, error: "Authorized units must be greater than zero when provided." }, { status: 400 });
    let correction;
    try {
      correction = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({
          where: { id: clean(body.authorizationId) },
          include: {
            agencyProgram: { select: { id: true, centerId: true } },
            family: { select: { id: true, centerId: true } },
            child: { select: { id: true, familyId: true } },
            claims: { where: { status: { not: "void" } }, select: { id: true }, take: 1 },
          },
        });
        if (!authorization || authorization.centerId !== centerId || !exactAgencyAuthorizationScope(authorization)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (authorization.claims.length) throw new AgencyWorkflowError("Void every draft claim tied to this authorization before correcting its rate or dates. Submitted and paid claim history cannot be rewritten.", 409);
        const unitType = clean(body.unitType) || authorization.unitType;
        if (!AUTHORIZATION_UNIT_TYPES.has(unitType)) throw new AgencyWorkflowError("Choose a supported authorization rate unit.");
        const updated = await tx.subsidyAuthorization.update({ where: { id: authorization.id }, data: { authorizationNumber, coverageStart, coverageEnd, authorizedRateCents, familyCopayCents, unitType, authorizedUnits } });
        await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.updated", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { previousRateCents: authorization.authorizedRateCents, authorizedRateCents, previousCoverageStart: dateInput(authorization.coverageStart), previousCoverageEnd: dateInput(authorization.coverageEnd), coverageStart: dateInput(coverageStart), coverageEnd: dateInput(coverageEnd), unitType, authorizedUnits } }, tx);
        return { authorization, updated, unitType };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ ok: false, error: "Another authorization already uses that number for this child and agency." }, { status: 409 });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "This authorization or its claims changed at the same time. Refresh before trying the correction again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, authorization: correction.updated });
  }

  if (action === "archiveAuthorization") {
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({
          where: { id: clean(body.authorizationId) },
          include: {
            agencyProgram: { select: { id: true, centerId: true } },
            family: { select: { id: true, centerId: true } },
            child: { select: { id: true, familyId: true } },
          },
        });
        if (!authorization || authorization.centerId !== centerId || !exactAgencyAuthorizationScope(authorization)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (authorization.status === "inactive") return tx.subsidyAuthorization.findUniqueOrThrow({ where: { id: authorization.id } });
        const transition = await tx.subsidyAuthorization.updateMany({ where: { id: authorization.id, status: authorization.status }, data: { status: "inactive" } });
        if (transition.count !== 1) throw new AgencyWorkflowError("The authorization changed while it was being archived. Refresh and try again.", 409);
        const archived = await tx.subsidyAuthorization.findUniqueOrThrow({ where: { id: authorization.id } });
        await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.archived", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { previousStatus: authorization.status } }, tx);
        return archived;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The authorization changed while it was being archived. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, authorization: updated });
  }

  if (action === "restoreAuthorization") {
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) }, include: { agencyProgram: true, family: { select: { id: true, centerId: true } }, child: { select: { id: true, familyId: true, enrollmentStatus: true, classroomId: true } } } });
        if (!authorization || authorization.centerId !== centerId || !exactAgencyAuthorizationScope(authorization)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (!isCurrentlyEnrolledChildRecord(authorization.child)) throw new AgencyWorkflowError("Only an authorization for a currently enrolled child with an assigned classroom can be restored.", 409);
        const programBlockers = agencyProgramSetupBlockers(authorization.agencyProgram);
        if (programBlockers.length) throw new AgencyWorkflowError(`Complete agency setup before restoring this authorization. ${programBlockers.join(" ")}`, 409);
        const transition = await tx.subsidyAuthorization.updateMany({ where: { id: authorization.id, status: { not: "active" } }, data: { status: "active" } });
        const updated = await tx.subsidyAuthorization.findUniqueOrThrow({ where: { id: authorization.id } });
        if (transition.count) await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.restored", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { previousStatus: authorization.status } }, tx);
        return { authorization, updated };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The authorization changed while it was being restored. Refresh and try again." }, { status: 409 });
      throw error;
    }
    const { updated } = result;
    return NextResponse.json({ ok: true, authorization: updated });
  }

  if (action === "prepareRemittanceBatch") {
    const reference = clean(body.externalReference);
    const paidAt = dateValue(body.paidAt);
    const paymentMethod = clean(body.paymentMethod) || "ach";
    const totalCents = cents(body.totalDollars ?? body.amountDollars);
    const evidenceName = clean(body.evidenceName);
    const evidenceReference = clean(body.evidenceReference);
    const followUpDueAt = dateValue(body.followUpDueAt);
    const requestedAllocationRows = agencyAllocationRows(body.allocations);
    if (requestedAllocationRows.hasInvalidRows) return NextResponse.json({ ok: false, error: "Every allocation needs an approved claim and a positive dollar amount." }, { status: 400 });
    if (requestedAllocationRows.hasDuplicateClaims) return NextResponse.json({ ok: false, error: "Choose each claim only once in a deposit batch." }, { status: 400 });
    const allocations = requestedAllocationRows.allocations.length
      ? requestedAllocationRows.allocations
      : clean(body.claimId) && cents(body.amountDollars) > 0
        ? [{ claimId: clean(body.claimId), amountCents: cents(body.amountDollars), notes: clean(body.notes) || null }]
        : [];
    const allocatedCents = allocations.reduce((total, allocation) => total + allocation.amountCents, 0);
    if (!reference || !paidAt || totalCents <= 0 || totalCents > POSTGRES_INT_MAX_CENTS) return NextResponse.json({ ok: false, error: "A payment reference, paid date, and positive deposit total within the supported accounting range are required." }, { status: 400 });
    if (isFutureAgencyAccountingDate(paidAt)) return NextResponse.json({ ok: false, error: "A remittance payment date cannot be after the current UTC accounting day." }, { status: 400 });
    if (!REMITTANCE_METHODS.has(paymentMethod)) return NextResponse.json({ ok: false, error: "Choose ACH, check, agency portal, or other as the remittance method." }, { status: 400 });
    if (allocatedCents > totalCents) return NextResponse.json({ ok: false, error: "Claim allocations cannot exceed the deposit total." }, { status: 400 });
    if (!evidenceName || !evidenceReference || !followUpDueAt) return NextResponse.json({ ok: false, error: "Name the remittance evidence, enter its secure internal reference, and assign a follow-up due date." }, { status: 400 });
    const agencyProgramId = clean(body.agencyProgramId);
    const idempotencyKey = clean(body.idempotencyKey);
    if (!idempotencyKey) return NextResponse.json({ ok: false, error: "A retry-safe request key is required before preparing a remittance batch." }, { status: 400 });
    let requestedFingerprint: string | null = null;
    let prepared;
    try {
      prepared = await prisma.$transaction(async (tx) => {
        const program = agencyProgramId
          ? await tx.agencyProgram.findFirst({ where: { id: agencyProgramId, centerId } })
          : allocations.length
            ? await tx.agencyProgram.findFirst({ where: { claims: { some: { id: allocations[0].claimId, centerId } } } })
            : null;
        if (!program || program.centerId !== centerId) throw new AgencyWorkflowError("Choose an agency program from this school.", 404);
        const referenceKey = agencyRemittanceReferenceKey({ paymentMethod, externalReference: reference });
        const normalizedReference = normalizeAgencyPaymentReference(reference);
        const fingerprint = agencyBatchFingerprint({
          centerId,
          agencyProgramId: program.id,
          externalReference: normalizedReference,
          paidAt,
          paymentMethod,
          totalCents,
          notes: clean(body.notes) || null,
          evidenceName,
          evidenceReference,
          followUpDueAt,
          allocations,
        });
        requestedFingerprint = fingerprint;
        const existingByIdempotency = await tx.agencyRemittanceBatch.findUnique({ where: { idempotencyKey } });
        const replay = agencyIdempotencyReplay({
          record: existingByIdempotency,
          user: auth.user,
          expectedCenterId: centerId,
          requestedFingerprint: fingerprint,
          centerId: (batch) => batch.centerId,
          ownerId: (batch) => batch.enteredById,
          fingerprint: (batch) => batch.reconciliationFingerprint,
        });
        if (replay.kind === "not_found") throw new AgencyWorkflowError("Remittance batch not found.", 404);
        if (replay.kind === "mismatch") throw new AgencyWorkflowError("This retry key was already used for a different remittance batch.", 409);
        if (replay.kind === "reused") {
          await writeAuditLog(auth.user, { centerId, action: "billing.agency_remittance_batch.prepared", resource: "AgencyRemittanceBatch", resourceId: replay.record.id, metadata: { agencyProgramId: replay.record.agencyProgramId, totalCents: replay.record.totalCents, allocatedForReviewCents: allocatedCents, reused: true, evidenceRecorded: true } }, tx);
          return { batch: replay.record, reused: true };
        }
        await requireAgencyReconciliationEnabled(tx, centerId);
        if (program.status !== "active" || agencyProgramSetupBlockers(program).length || agencyControlledLedgerSetupBlockers(program).length) throw new AgencyWorkflowError("Complete this school's agency program and accounting mapping setup before preparing a remittance batch.", 409);
        const existingActiveReference = await tx.agencyRemittanceBatch.findFirst({
          where: {
            centerId,
            agencyProgramId: program.id,
            referenceKey,
            status: { notIn: ["rejected", "reversed"] },
            reversedAt: null,
          },
          select: { id: true },
        });
        if (existingActiveReference) throw new AgencyWorkflowError("That school and agency already have an active remittance batch with this payment reference. Review or reverse it before entering a corrected batch.", 409);
        for (const allocation of allocations) {
          const current = await agencyPostingClaim(tx, allocation.claimId);
          if (!current || current.centerId !== centerId || current.agencyProgramId !== program.id) throw new AgencyWorkflowError("Every allocation must use an approved claim from the selected school and agency.", 409);
          if (!new Set(["approved", "partially_paid"]).has(current.status)) throw new AgencyWorkflowError(`Claim ${current.number} is not approved for payment.`, 409);
          const paidBeforeCents = activeRemittanceTotalCents(current.remittances);
          if (paidBeforeCents + allocation.amountCents > (current.approvedCents ?? current.claimedCents)) throw new AgencyWorkflowError(`The allocation for ${current.number} exceeds its remaining approved amount.`, 409);
        }
        const batch = await tx.agencyRemittanceBatch.create({ data: {
          centerId,
          agencyProgramId: program.id,
          externalReference: normalizedReference,
          referenceKey,
          paidAt,
          paymentMethod,
          cashGlCodeSnapshot: program.cashGlCode,
          costCenterCodeSnapshot: program.costCenterCode,
          totalCents,
          allocatedCents: 0,
          unappliedCents: 0,
          status: "pending_review",
          notes: clean(body.notes) || null,
          evidenceName,
          evidenceReference,
          idempotencyKey,
          reconciliationFingerprint: fingerprint,
          enteredById: auth.user.id,
          followUpOwnerId: auth.user.id,
          followUpDueAt,
        } });
        if (allocations.length) {
          await tx.agencyRemittanceAllocation.createMany({ data: allocations.map((allocation) => ({
            batchId: batch.id,
            claimId: allocation.claimId,
            amountCents: allocation.amountCents,
            notes: allocation.notes,
            fingerprint: agencyAllocationFingerprint({ batchId: batch.id, claimId: allocation.claimId, amountCents: allocation.amountCents, notes: allocation.notes }),
            idempotencyKey: `batch-allocation:${batch.id}:${allocation.claimId}`,
            requestedById: auth.user.id,
          })) });
        }
        await writeAuditLog(auth.user, { centerId, action: "billing.agency_remittance_batch.prepared", resource: "AgencyRemittanceBatch", resourceId: batch.id, metadata: { agencyProgramId: batch.agencyProgramId, totalCents: batch.totalCents, allocatedForReviewCents: allocatedCents, reused: false, evidenceRecorded: true } }, tx);
        return { batch, reused: false };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) {
        const existingByIdempotency = requestedFingerprint
          ? await prisma.agencyRemittanceBatch.findUnique({ where: { idempotencyKey } })
          : null;
        const replay = requestedFingerprint
          ? agencyIdempotencyReplay({
              record: existingByIdempotency,
              user: auth.user,
              expectedCenterId: centerId,
              requestedFingerprint,
              centerId: (batch) => batch.centerId,
              ownerId: (batch) => batch.enteredById,
              fingerprint: (batch) => batch.reconciliationFingerprint,
            })
          : { kind: "missing" as const };
        if (replay.kind === "not_found") return NextResponse.json({ ok: false, error: "Remittance batch not found." }, { status: 404 });
        if (replay.kind === "mismatch") return NextResponse.json({ ok: false, error: "This retry key was already used for a different remittance batch." }, { status: 409 });
        if (replay.kind === "reused") {
          await writeAuditLog(auth.user, { centerId, action: "billing.agency_remittance_batch.prepared", resource: "AgencyRemittanceBatch", resourceId: replay.record.id, metadata: { agencyProgramId: replay.record.agencyProgramId, totalCents: replay.record.totalCents, allocatedForReviewCents: allocatedCents, reused: true, evidenceRecorded: true } });
          prepared = { batch: replay.record, reused: true };
        } else {
          return NextResponse.json({ ok: false, error: "That school and agency already have a remittance batch with this payment reference. Review the existing batch instead of posting it again." }, { status: 409 });
        }
      } else {
        throw error;
      }
    }
    return NextResponse.json({ ok: true, ...prepared, requiresReview: true });
  }

  if (action === "approveRemittanceBatch") {
    const batchId = clean(body.batchId);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const batch = await tx.agencyRemittanceBatch.findUnique({ where: { id: batchId }, include: { allocations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, agencyProgram: true } });
        if (!batch || batch.centerId !== centerId) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        await requireAgencyReconciliationEnabled(tx, batch.centerId);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: batch.enteredById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must approve this batch.", 403);
        if (batch.status !== "pending_review" || batch.reviewedAt) throw new AgencyWorkflowError("This remittance batch is no longer awaiting initial review.", 409);
        if (batch.agencyProgram.status !== "active" || agencyProgramSetupBlockers(batch.agencyProgram).length || agencyControlledLedgerSetupBlockers(batch.agencyProgram).length) throw new AgencyWorkflowError("Complete this school's agency program and accounting mapping setup before approving a remittance batch.", 409);
        if (isFutureAgencyAccountingDate(batch.paidAt)) throw new AgencyWorkflowError("A future-dated remittance batch cannot be approved.", 409);
        const pendingAllocations = batch.allocations.filter((allocation) => allocation.status === "pending_review");
        const fingerprint = agencyBatchFingerprint({ centerId: batch.centerId, agencyProgramId: batch.agencyProgramId, externalReference: batch.externalReference, paidAt: batch.paidAt, paymentMethod: batch.paymentMethod, totalCents: batch.totalCents, notes: batch.notes, evidenceName: batch.evidenceName, evidenceReference: batch.evidenceReference, followUpDueAt: batch.followUpDueAt, allocations: pendingAllocations });
        if (fingerprint !== batch.reconciliationFingerprint) throw new AgencyWorkflowError("The batch no longer matches its reviewed fingerprint. Recreate the batch from current evidence.", 409);
        // The agency's paid date is immutable source evidence. Controlled cash is
        // recognized when the independent reviewer posts it, which lets a
        // corrected historical deposit retain its true paid date without
        // silently backdating activity into a closed period.
        const postingEffectiveAt = new Date();
        await assertAgencyPeriodOpen(tx, batch.centerId, postingEffectiveAt);
        let allocatedCents = 0;
        const posted = [];
        let agencyLedgerAccountId: string | null = null;
        for (const allocation of pendingAllocations) {
          const current = await agencyPostingClaim(tx, allocation.claimId);
          if (!current || current.centerId !== batch.centerId || current.agencyProgramId !== batch.agencyProgramId) throw new AgencyWorkflowError("A claim allocation no longer belongs to this school and agency.", 409);
          const allocationResult = await postAgencyClaimAllocation(tx, { claim: current, batchId: batch.id, allocationId: allocation.id, amountCents: allocation.amountCents, paidAt: batch.paidAt, ledgerEffectiveAt: postingEffectiveAt, paymentMethod: batch.paymentMethod, reference: batch.externalReference, notes: allocation.notes, reviewerId: auth.user.id, accountingSnapshot: { glCode: batch.cashGlCodeSnapshot, costCenterCode: batch.costCenterCodeSnapshot } }, { recalculateAgencyLedger: false });
          agencyLedgerAccountId = allocationResult.ledger.account.id;
          allocatedCents += allocation.amountCents;
          posted.push(allocationResult);
        }
        const unappliedCents = batch.totalCents - allocatedCents;
        let unappliedEntryId: string | null = null;
        if (unappliedCents > 0) {
          const unapplied = await appendAgencyLedgerEntry(tx, {
            centerId: batch.centerId,
            agencyProgramId: batch.agencyProgramId,
            remittanceBatchId: batch.id,
            type: "unapplied_cash",
            description: `${batch.agencyProgram.name} cash awaiting claim allocation`,
            amountCents: -unappliedCents,
            effectiveAt: postingEffectiveAt,
            externalReference: batch.externalReference,
            externalId: `batch-unapplied:${batch.id}`,
            metadata: { paymentMethod: batch.paymentMethod, evidenceReference: batch.evidenceReference, originalPaidAt: batch.paidAt.toISOString(), postingRule: "independent_review" },
            accountingSnapshot: { glCode: batch.cashGlCodeSnapshot, costCenterCode: batch.costCenterCodeSnapshot },
          }, { recalculate: false });
          agencyLedgerAccountId = unapplied.account.id;
          unappliedEntryId = unapplied.entry.id;
        }
        if (agencyLedgerAccountId) await recalculateAgencyLedgerBalances(tx, agencyLedgerAccountId);
        const updated = await tx.agencyRemittanceBatch.update({ where: { id: batch.id }, data: {
          allocatedCents,
          unappliedCents,
          status: agencyBatchStatus({ totalCents: batch.totalCents, allocatedCents }),
          reviewedById: auth.user.id,
          reviewedAt: postingEffectiveAt,
          reviewNotes: clean(body.reviewNotes) || null,
          ...(unappliedCents === 0 ? { followUpOwnerId: null, followUpDueAt: null } : {}),
        } });
        await writeAuditLog(auth.user, { centerId: updated.centerId, action: "billing.agency_remittance_batch.approved", resource: "AgencyRemittanceBatch", resourceId: updated.id, metadata: { postedCount: posted.length, totalCents: updated.totalCents, allocatedCents: updated.allocatedCents, unappliedCents: updated.unappliedCents, unappliedEntryId, originalPaidAt: batch.paidAt.toISOString(), postingEffectiveAt: postingEffectiveAt.toISOString() } }, tx);
        return { batch: updated, postedCount: posted.length, unappliedEntryId };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The remittance batch or one of its claims changed during review. Refresh before approving it." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "requestBatchAllocation") {
    const batchId = clean(body.batchId);
    const claimId = clean(body.claimId);
    const amountCents = cents(body.amountDollars);
    const notes = clean(body.notes) || null;
    const idempotencyKey = clean(body.idempotencyKey);
    if (!batchId || !claimId || amountCents <= 0 || amountCents > POSTGRES_INT_MAX_CENTS || !idempotencyKey) return NextResponse.json({ ok: false, error: "Choose a batch, approved claim, supported positive allocation amount, and retry-safe request key." }, { status: 400 });
    const fingerprint = agencyAllocationFingerprint({ batchId, claimId, amountCents, notes });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const existingByIdempotency = await tx.agencyRemittanceAllocation.findUnique({ where: { idempotencyKey }, include: { batch: true } });
        const replay = agencyIdempotencyReplay({
          record: existingByIdempotency,
          user: auth.user,
          expectedCenterId: centerId,
          requestedFingerprint: fingerprint,
          centerId: (allocation) => allocation.batch.centerId,
          ownerId: (allocation) => allocation.requestedById,
          fingerprint: (allocation) => allocation.fingerprint,
        });
        if (replay.kind === "not_found") throw new AgencyWorkflowError("Batch allocation not found.", 404);
        if (replay.kind === "mismatch") throw new AgencyWorkflowError("This retry key was already used for a different batch allocation.", 409);
        if (replay.kind === "reused") {
          await writeAuditLog(auth.user, { centerId: replay.record.batch.centerId, action: "billing.agency_remittance_allocation.prepared", resource: "AgencyRemittanceAllocation", resourceId: replay.record.id, metadata: { batchId, claimId, amountCents, reused: true } }, tx);
          return { batch: replay.record.batch, allocation: replay.record, reused: true };
        }
        const batch = await tx.agencyRemittanceBatch.findUnique({ where: { id: batchId }, include: { agencyProgram: true } });
        if (!batch || batch.centerId !== centerId) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        await requireAgencyReconciliationEnabled(tx, batch.centerId);
        if (batch.agencyProgram.status !== "active" || agencyProgramSetupBlockers(batch.agencyProgram).length || agencyControlledLedgerSetupBlockers(batch.agencyProgram).length) throw new AgencyWorkflowError("Complete this school's agency program and accounting mapping setup before requesting another allocation.", 409);
        if (batch.reversedAt || !new Set(["unmatched", "partially_allocated", "exception"]).has(batch.status)) throw new AgencyWorkflowError("Only an unreversed batch with unapplied cash can receive another allocation.", 409);
        if (amountCents > batch.unappliedCents) throw new AgencyWorkflowError("The new allocation exceeds the batch's unapplied amount.", 409);
        const existingActiveClaimAllocation = await tx.agencyRemittanceAllocation.findFirst({
          where: { batchId: batch.id, claimId, status: { in: ["pending_review", "posted"] } },
          select: { id: true },
        });
        if (existingActiveClaimAllocation) throw new AgencyWorkflowError("This batch already has an active allocation for that claim. Review or reverse it before creating another.", 409);
        const current = await agencyPostingClaim(tx, claimId);
        if (!current || current.centerId !== batch.centerId || current.agencyProgramId !== batch.agencyProgramId) throw new AgencyWorkflowError("Choose an approved claim from this batch's school and agency.", 409);
        const paidBeforeCents = activeRemittanceTotalCents(current.remittances);
        if (!new Set(["approved", "partially_paid"]).has(current.status) || paidBeforeCents + amountCents > (current.approvedCents ?? current.claimedCents)) throw new AgencyWorkflowError("The allocation exceeds the claim's remaining approved amount.", 409);
        const requestedAt = new Date();
        await assertAgencyPeriodOpen(tx, batch.centerId, requestedAt);
        const allocation = await tx.agencyRemittanceAllocation.create({ data: {
          batchId: batch.id,
          claimId,
          amountCents,
          notes,
          fingerprint,
          idempotencyKey,
          requestedById: auth.user.id,
          createdAt: requestedAt,
        } });
        const updated = await tx.agencyRemittanceBatch.update({ where: { id: batch.id }, data: { status: "pending_review" } });
        await writeAuditLog(auth.user, { centerId: updated.centerId, action: "billing.agency_remittance_allocation.prepared", resource: "AgencyRemittanceAllocation", resourceId: allocation.id, metadata: { batchId, claimId, amountCents, reused: false } }, tx);
        return { batch: updated, allocation, reused: false };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) {
        const existingByIdempotency = await prisma.agencyRemittanceAllocation.findUnique({ where: { idempotencyKey }, include: { batch: true } });
        const replay = agencyIdempotencyReplay({
          record: existingByIdempotency,
          user: auth.user,
          expectedCenterId: centerId,
          requestedFingerprint: fingerprint,
          centerId: (allocation) => allocation.batch.centerId,
          ownerId: (allocation) => allocation.requestedById,
          fingerprint: (allocation) => allocation.fingerprint,
        });
        if (replay.kind === "not_found") return NextResponse.json({ ok: false, error: "Batch allocation not found." }, { status: 404 });
        if (replay.kind === "mismatch") return NextResponse.json({ ok: false, error: "This retry key was already used for a different batch allocation." }, { status: 409 });
        if (replay.kind === "reused") {
          await writeAuditLog(auth.user, { centerId: replay.record.batch.centerId, action: "billing.agency_remittance_allocation.prepared", resource: "AgencyRemittanceAllocation", resourceId: replay.record.id, metadata: { batchId, claimId, amountCents, reused: true } });
          result = { batch: replay.record.batch, allocation: replay.record, reused: true };
        } else {
          return NextResponse.json({ ok: false, error: "The batch or claim changed while the allocation was prepared. Refresh and try again." }, { status: 409 });
        }
      } else {
        throw error;
      }
    }
    return NextResponse.json({ ok: true, ...result, requiresReview: true });
  }

  if (action === "approveBatchAllocation") {
    const allocationId = clean(body.allocationId);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const allocation = await tx.agencyRemittanceAllocation.findUnique({ where: { id: allocationId }, include: { batch: { include: { agencyProgram: true } } } });
        if (!allocation || allocation.batch.centerId !== centerId) throw new AgencyWorkflowError("Batch allocation not found.", 404);
        await requireAgencyReconciliationEnabled(tx, allocation.batch.centerId);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: allocation.requestedById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must approve this allocation.", 403);
        if (allocation.status !== "pending_review" || allocation.batch.reversedAt) throw new AgencyWorkflowError("This allocation is no longer awaiting review.", 409);
        if (allocation.batch.agencyProgram.status !== "active" || agencyProgramSetupBlockers(allocation.batch.agencyProgram).length || agencyControlledLedgerSetupBlockers(allocation.batch.agencyProgram).length) throw new AgencyWorkflowError("Complete this school's agency program and accounting mapping setup before approving another allocation.", 409);
        if (allocation.fingerprint !== agencyAllocationFingerprint({ batchId: allocation.batchId, claimId: allocation.claimId, amountCents: allocation.amountCents, notes: allocation.notes })) throw new AgencyWorkflowError("The allocation fingerprint no longer matches. Recreate it from current evidence.", 409);
        if (allocation.amountCents > allocation.batch.unappliedCents) throw new AgencyWorkflowError("The batch's unapplied amount changed before this allocation could be approved.", 409);
        const current = await agencyPostingClaim(tx, allocation.claimId);
        if (!current || current.centerId !== allocation.batch.centerId || current.agencyProgramId !== allocation.batch.agencyProgramId) throw new AgencyWorkflowError("The claim no longer belongs to this batch's school and agency.", 409);
        const effectiveAt = new Date();
        await assertAgencyPeriodOpen(tx, allocation.batch.centerId, effectiveAt);
        const release = await appendAgencyLedgerEntry(tx, {
          centerId: allocation.batch.centerId,
          agencyProgramId: allocation.batch.agencyProgramId,
          remittanceBatchId: allocation.batch.id,
          type: "unapplied_cash_allocation",
          description: `Applied previously unmatched agency cash to ${current.number}`,
          amountCents: allocation.amountCents,
          effectiveAt,
          externalReference: allocation.batch.externalReference,
          externalId: `batch-unapplied-allocation:${allocation.id}`,
          metadata: { claimId: current.id, originalPaidAt: allocation.batch.paidAt.toISOString() },
          accountingSnapshot: { glCode: allocation.batch.cashGlCodeSnapshot, costCenterCode: allocation.batch.costCenterCodeSnapshot },
        }, { recalculate: false });
        const posted = await postAgencyClaimAllocation(tx, { claim: current, batchId: allocation.batch.id, allocationId: allocation.id, amountCents: allocation.amountCents, paidAt: allocation.batch.paidAt, ledgerEffectiveAt: effectiveAt, paymentMethod: allocation.batch.paymentMethod, reference: allocation.batch.externalReference, notes: allocation.notes, reviewerId: auth.user.id, accountingSnapshot: { glCode: allocation.batch.cashGlCodeSnapshot, costCenterCode: allocation.batch.costCenterCodeSnapshot } }, { recalculateAgencyLedger: false });
        await recalculateAgencyLedgerBalances(tx, release.account.id);
        const allocatedCents = allocation.batch.allocatedCents + allocation.amountCents;
        const unappliedCents = allocation.batch.unappliedCents - allocation.amountCents;
        const batch = await tx.agencyRemittanceBatch.update({ where: { id: allocation.batch.id }, data: { allocatedCents, unappliedCents, status: agencyBatchStatus({ totalCents: allocation.batch.totalCents, allocatedCents }), ...(unappliedCents === 0 ? { followUpOwnerId: null, followUpDueAt: null } : {}) } });
        await writeAuditLog(auth.user, { centerId: batch.centerId, action: "billing.agency_remittance_allocation.approved", resource: "AgencyRemittanceAllocation", resourceId: allocation.id, metadata: { batchId: batch.id, remittanceId: posted.remittance.id, releaseEntryId: release.entry.id } }, tx);
        return { batch, allocationId: allocation.id, releaseEntryId: release.entry.id, remittanceId: posted.remittance.id };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The allocation, batch, or claim changed during review. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "rejectBatchAllocation") {
    const allocationId = clean(body.allocationId);
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a specific allocation rejection reason." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const allocation = await tx.agencyRemittanceAllocation.findUnique({ where: { id: allocationId }, include: { batch: true } });
        if (!allocation || allocation.batch.centerId !== centerId) throw new AgencyWorkflowError("Batch allocation not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: allocation.requestedById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reject this allocation.", 403);
        if (allocation.status !== "pending_review" || allocation.batch.reversedAt) throw new AgencyWorkflowError("This allocation is no longer awaiting review.", 409);
        if (!allocation.batch.reviewedAt) throw new AgencyWorkflowError("Reject the unposted deposit batch instead of rejecting one of its initial allocations.", 409);
        if (allocation.fingerprint !== agencyAllocationFingerprint({ batchId: allocation.batchId, claimId: allocation.claimId, amountCents: allocation.amountCents, notes: allocation.notes })) throw new AgencyWorkflowError("The allocation fingerprint no longer matches. Refresh before rejecting it.", 409);
        const reviewedAt = new Date();
        const transition = await tx.agencyRemittanceAllocation.updateMany({
          where: { id: allocation.id, status: "pending_review" },
          data: { status: "rejected", reviewedById: auth.user.id, reviewedAt, reviewNotes: reason },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("The allocation changed during review. Refresh and try again.", 409);
        const remainingPending = await tx.agencyRemittanceAllocation.count({ where: { batchId: allocation.batchId, status: "pending_review" } });
        const restoredStatus = remainingPending
          ? "pending_review"
          : agencyBatchStatus({ totalCents: allocation.batch.totalCents, allocatedCents: allocation.batch.allocatedCents });
        const batch = await tx.agencyRemittanceBatch.update({ where: { id: allocation.batchId }, data: { status: restoredStatus } });
        await writeAuditLog(auth.user, { centerId: batch.centerId, action: "billing.agency_remittance_allocation.rejected", resource: "AgencyRemittanceAllocation", resourceId: allocation.id, metadata: { batchId: batch.id, reasonRecorded: true } }, tx);
        return { batch, allocationId: allocation.id };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The allocation or batch changed during rejection. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "requestLedgerAdjustment") {
    const ledgerAccountId = clean(body.ledgerAccountId);
    const type = clean(body.adjustmentType);
    const positiveCents = cents(body.amountDollars);
    const amountCents = signedAgencyAdjustmentCents(type, positiveCents);
    const effectiveAt = dateValue(body.effectiveAt);
    const reason = clean(body.reason);
    const evidenceName = clean(body.evidenceName);
    const evidenceReference = clean(body.evidenceReference);
    const followUpDueAt = dateValue(body.followUpDueAt);
    const idempotencyKey = clean(body.idempotencyKey);
    const claimId = clean(body.claimId) || null;
    const batchId = clean(body.batchId) || null;
    if (!ledgerAccountId || !AGENCY_ADJUSTMENT_TYPES.includes(type as (typeof AGENCY_ADJUSTMENT_TYPES)[number]) || !amountCents || Math.abs(amountCents) > POSTGRES_INT_MAX_CENTS || !effectiveAt || !reason || !idempotencyKey) return NextResponse.json({ ok: false, error: "Choose an agency account and adjustment type, then enter a supported positive amount, effective date, specific reason, and retry-safe request key." }, { status: 400 });
    if (isFutureAgencyAccountingDate(effectiveAt)) return NextResponse.json({ ok: false, error: "An agency adjustment cannot be effective after the current UTC accounting day." }, { status: 400 });
    if (!evidenceName || !evidenceReference || !followUpDueAt) return NextResponse.json({ ok: false, error: "Name the adjustment evidence, enter its secure internal reference, and assign a follow-up due date." }, { status: 400 });
    let requestedCenterId: string | null = null;
    let requestedFingerprint: string | null = null;
    let prepared;
    try {
      prepared = await prisma.$transaction(async (tx) => {
        const account = await tx.agencyLedgerAccount.findUnique({ where: { id: ledgerAccountId }, include: { agencyProgram: true } });
        if (!account || account.centerId !== centerId) throw new AgencyWorkflowError("Agency ledger account not found.", 404);
        requestedCenterId = account.centerId;
        if (claimId) {
          const linkedClaim = await tx.subsidyClaim.findFirst({
            where: {
              id: claimId,
              centerId: account.centerId,
              agencyProgramId: account.agencyProgramId,
              status: { in: ["approved", "partially_paid", "paid"] },
            },
            select: { id: true },
          });
          if (!linkedClaim) throw new AgencyWorkflowError("A claim-linked adjustment requires an approved, partially paid, or paid claim from this exact school and agency. Use an account-level adjustment when no financial claim applies.", 409);
        }
        if (batchId) {
          const linkedBatch = await tx.agencyRemittanceBatch.findFirst({ where: { id: batchId, centerId: account.centerId, agencyProgramId: account.agencyProgramId }, select: { id: true } });
          if (!linkedBatch) throw new AgencyWorkflowError("The linked remittance batch must belong to this school and agency account.", 409);
        }
        const fingerprint = agencyAdjustmentFingerprint({ ledgerAccountId: account.id, claimId, batchId, type, amountCents, effectiveAt, reason, evidenceName, evidenceReference, followUpDueAt });
        requestedFingerprint = fingerprint;
        const existingByIdempotency = await tx.agencyLedgerAdjustment.findUnique({ where: { idempotencyKey } });
        const replay = agencyIdempotencyReplay({
          record: existingByIdempotency,
          user: auth.user,
          expectedCenterId: account.centerId,
          requestedFingerprint: fingerprint,
          centerId: (adjustment) => adjustment.centerId,
          ownerId: (adjustment) => adjustment.requestedById,
          fingerprint: (adjustment) => adjustment.fingerprint,
        });
        if (replay.kind === "not_found") throw new AgencyWorkflowError("Agency adjustment not found.", 404);
        if (replay.kind === "mismatch") throw new AgencyWorkflowError("This retry key was already used for a different agency adjustment.", 409);
        if (replay.kind === "reused") {
          await writeAuditLog(auth.user, { centerId: replay.record.centerId, action: "billing.agency_ledger_adjustment.requested", resource: "AgencyLedgerAdjustment", resourceId: replay.record.id, metadata: { type, amountCents, claimId: replay.record.claimId, batchId: replay.record.batchId, evidenceRecorded: true, reused: true } }, tx);
          return { adjustment: replay.record, reused: true };
        }
        await requireAgencyReconciliationEnabled(tx, account.centerId);
        if (account.agencyProgram.status !== "active" || agencyProgramSetupBlockers(account.agencyProgram).length || agencyControlledLedgerSetupBlockers(account.agencyProgram).length) throw new AgencyWorkflowError("Complete this school's agency program and accounting mapping setup before requesting an adjustment.", 409);
        await assertAgencyPeriodOpen(tx, account.centerId, effectiveAt);
        const adjustment = await tx.agencyLedgerAdjustment.create({ data: {
          centerId: account.centerId,
          agencyProgramId: account.agencyProgramId,
          ledgerAccountId: account.id,
          claimId,
          batchId,
          type,
          amountCents,
          effectiveAt,
          reason,
          evidenceName,
          evidenceReference,
          glCodeSnapshot: account.agencyProgram.adjustmentGlCode,
          costCenterCodeSnapshot: account.agencyProgram.costCenterCode,
          fingerprint,
          idempotencyKey,
          requestedById: auth.user.id,
          followUpOwnerId: auth.user.id,
          followUpDueAt,
        } });
        await writeAuditLog(auth.user, { centerId: adjustment.centerId, action: "billing.agency_ledger_adjustment.requested", resource: "AgencyLedgerAdjustment", resourceId: adjustment.id, metadata: { type, amountCents, claimId: adjustment.claimId, batchId: adjustment.batchId, evidenceRecorded: true, reused: false } }, tx);
        return { adjustment, reused: false };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) {
        const existingByIdempotency = requestedFingerprint
          ? await prisma.agencyLedgerAdjustment.findUnique({ where: { idempotencyKey } })
          : null;
        const replay = requestedFingerprint
          ? agencyIdempotencyReplay({
              record: existingByIdempotency,
              user: auth.user,
              expectedCenterId: requestedCenterId,
              requestedFingerprint,
              centerId: (adjustment) => adjustment.centerId,
              ownerId: (adjustment) => adjustment.requestedById,
              fingerprint: (adjustment) => adjustment.fingerprint,
            })
          : { kind: "missing" as const };
        if (replay.kind === "not_found") return NextResponse.json({ ok: false, error: "Agency adjustment not found." }, { status: 404 });
        if (replay.kind === "mismatch") return NextResponse.json({ ok: false, error: "This retry key was already used for a different agency adjustment." }, { status: 409 });
        if (replay.kind === "reused") {
          await writeAuditLog(auth.user, { centerId: replay.record.centerId, action: "billing.agency_ledger_adjustment.requested", resource: "AgencyLedgerAdjustment", resourceId: replay.record.id, metadata: { type, amountCents, claimId: replay.record.claimId, batchId: replay.record.batchId, evidenceRecorded: true, reused: true } });
          prepared = { adjustment: replay.record, reused: true };
        } else {
          return NextResponse.json({ ok: false, error: "The agency account changed while the adjustment was prepared. Refresh and try again." }, { status: 409 });
        }
      } else {
        throw error;
      }
    }
    return NextResponse.json({ ok: true, ...prepared, requiresReview: true });
  }

  if (action === "approveLedgerAdjustment" || action === "rejectLedgerAdjustment") {
    const adjustmentId = clean(body.adjustmentId);
    const reviewNotes = clean(body.reviewNotes);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const adjustment = await tx.agencyLedgerAdjustment.findUnique({ where: { id: adjustmentId }, include: { agencyProgram: true } });
        if (!adjustment || adjustment.centerId !== centerId) throw new AgencyWorkflowError("Agency adjustment not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: adjustment.requestedById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must review this adjustment.", 403);
        if (adjustment.status !== "pending_review") throw new AgencyWorkflowError("This adjustment is no longer awaiting review.", 409);
        const fingerprint = agencyAdjustmentFingerprint({ ledgerAccountId: adjustment.ledgerAccountId, claimId: adjustment.claimId, batchId: adjustment.batchId, type: adjustment.type, amountCents: adjustment.amountCents, effectiveAt: adjustment.effectiveAt, reason: adjustment.reason, evidenceName: adjustment.evidenceName, evidenceReference: adjustment.evidenceReference, followUpDueAt: adjustment.followUpDueAt });
        if (fingerprint !== adjustment.fingerprint) throw new AgencyWorkflowError("The adjustment no longer matches its reviewed fingerprint. Recreate it from current evidence.", 409);
        if (action === "rejectLedgerAdjustment") {
          const rejected = await tx.agencyLedgerAdjustment.update({ where: { id: adjustment.id }, data: { status: "rejected", reviewedById: auth.user.id, reviewedAt: new Date(), reviewNotes: reviewNotes || "Rejected by accounting reviewer." } });
          await writeAuditLog(auth.user, { centerId: rejected.centerId, action: "billing.agency_ledger_adjustment.rejected", resource: "AgencyLedgerAdjustment", resourceId: rejected.id, metadata: { type: rejected.type, amountCents: rejected.amountCents, ledgerEntryId: null } }, tx);
          return { adjustment: rejected, ledgerEntryId: null as string | null };
        }
        await requireAgencyReconciliationEnabled(tx, adjustment.centerId);
        if (adjustment.agencyProgram.status !== "active" || agencyProgramSetupBlockers(adjustment.agencyProgram).length || agencyControlledLedgerSetupBlockers(adjustment.agencyProgram).length) throw new AgencyWorkflowError("Complete this school's agency program and accounting mapping setup before approving an adjustment.", 409);
        if (adjustment.claimId) {
          const linkedClaim = await tx.subsidyClaim.findFirst({
            where: {
              id: adjustment.claimId,
              centerId: adjustment.centerId,
              agencyProgramId: adjustment.agencyProgramId,
              status: { in: ["approved", "partially_paid", "paid"] },
            },
            select: { id: true },
          });
          if (!linkedClaim) throw new AgencyWorkflowError("The adjustment's linked claim is no longer an exact approved, partially paid, or paid claim for this school and agency. Reject it and use an account-level correction if appropriate.", 409);
        }
        if (adjustment.batchId) {
          const linkedBatch = await tx.agencyRemittanceBatch.findFirst({
            where: { id: adjustment.batchId, centerId: adjustment.centerId, agencyProgramId: adjustment.agencyProgramId },
            select: { id: true },
          });
          if (!linkedBatch) throw new AgencyWorkflowError("The adjustment's linked remittance batch no longer belongs to this exact school and agency. Reject the adjustment and investigate its source evidence.", 409);
        }
        if (isFutureAgencyAccountingDate(adjustment.effectiveAt)) throw new AgencyWorkflowError("A future-dated agency adjustment cannot be approved.", 409);
        await assertAgencyPeriodOpen(tx, adjustment.centerId, adjustment.effectiveAt);
        const ledger = await appendAgencyLedgerEntry(tx, {
          centerId: adjustment.centerId,
          agencyProgramId: adjustment.agencyProgramId,
          claimId: adjustment.claimId,
          remittanceBatchId: adjustment.batchId,
          adjustmentId: adjustment.id,
          type: `adjustment_${adjustment.type}`,
          description: `${adjustment.agencyProgram.name} ${adjustment.type.replaceAll("_", " ")}: ${adjustment.reason}`,
          amountCents: adjustment.amountCents,
          effectiveAt: adjustment.effectiveAt,
          externalReference: adjustment.evidenceReference,
          externalId: `adjustment:${adjustment.id}`,
          metadata: { evidenceName: adjustment.evidenceName, reviewNotes },
          accountingSnapshot: { glCode: adjustment.glCodeSnapshot, costCenterCode: adjustment.costCenterCodeSnapshot },
        });
        const posted = await tx.agencyLedgerAdjustment.update({ where: { id: adjustment.id }, data: { status: "posted", reviewedById: auth.user.id, reviewedAt: new Date(), reviewNotes: reviewNotes || null } });
        await writeAuditLog(auth.user, { centerId: posted.centerId, action: "billing.agency_ledger_adjustment.approved", resource: "AgencyLedgerAdjustment", resourceId: posted.id, metadata: { type: posted.type, amountCents: posted.amountCents, ledgerEntryId: ledger.entry.id } }, tx);
        return { adjustment: posted, ledgerEntryId: ledger.entry.id };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The adjustment or agency account changed during review. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "reverseLedgerAdjustment") {
    const adjustmentId = clean(body.adjustmentId);
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a specific reversal reason." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const adjustment = await tx.agencyLedgerAdjustment.findUnique({ where: { id: adjustmentId }, include: { agencyProgram: true } });
        if (!adjustment || adjustment.centerId !== centerId) throw new AgencyWorkflowError("Agency adjustment not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: adjustment.requestedById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reverse this adjustment.", 403);
        if (adjustment.status !== "posted" || adjustment.reversedAt) throw new AgencyWorkflowError("Only an unreversed posted adjustment can be reversed.", 409);
        const originalExternalId = `adjustment:${adjustment.id}`;
        const originalEntry = await tx.agencyLedgerEntry.findUnique({
          where: { sourceSystem_externalId: { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM, externalId: originalExternalId } },
          include: { agencyLedgerAccount: { select: { centerId: true, agencyProgramId: true } } },
        });
        if (!originalEntry) throw new AgencyWorkflowError("The posted adjustment is missing its immutable ledger entry. Restore the source evidence before reversing it.", 409);
        if (originalEntry.agencyLedgerAccountId !== adjustment.ledgerAccountId
          || originalEntry.agencyLedgerAccount.centerId !== adjustment.centerId
          || originalEntry.agencyLedgerAccount.agencyProgramId !== adjustment.agencyProgramId
          || originalEntry.adjustmentId !== adjustment.id
          || originalEntry.claimId !== adjustment.claimId
          || originalEntry.remittanceBatchId !== adjustment.batchId
          || originalEntry.remittanceId !== null
          || originalEntry.type !== `adjustment_${adjustment.type}`
          || originalEntry.amountCents !== adjustment.amountCents
          || originalEntry.effectiveAt.getTime() !== adjustment.effectiveAt.getTime()
          || originalEntry.externalReference !== adjustment.evidenceReference
          || originalEntry.sourceSystem !== AGENCY_LEDGER_SOURCE_SYSTEM
          || originalEntry.externalId !== originalExternalId
          || originalEntry.glCodeSnapshot !== adjustment.glCodeSnapshot
          || originalEntry.costCenterCodeSnapshot !== adjustment.costCenterCodeSnapshot) {
          throw new AgencyWorkflowError("The immutable adjustment ledger entry conflicts with its exact account, source, amount, date, or accounting evidence. No reversal was posted.", 409);
        }
        const effectiveAt = agencyReversalEffectiveAt(adjustment.effectiveAt);
        if (effectiveAt < adjustment.effectiveAt) throw new AgencyWorkflowError("An adjustment reversal cannot be effective before the original adjustment.", 409);
        await assertAgencyPeriodOpen(tx, adjustment.centerId, effectiveAt);
        const ledger = await appendAgencyLedgerEntry(tx, {
          centerId: adjustment.centerId,
          agencyProgramId: adjustment.agencyProgramId,
          claimId: adjustment.claimId,
          remittanceBatchId: adjustment.batchId,
          adjustmentId: adjustment.id,
          type: "adjustment_reversal",
          description: `Reversed ${adjustment.agencyProgram.name} ${adjustment.type.replaceAll("_", " ")}`,
          amountCents: -adjustment.amountCents,
          effectiveAt,
          externalReference: adjustment.evidenceReference,
          externalId: `adjustment-reversal:${adjustment.id}`,
          metadata: { reason, originalEffectiveAt: adjustment.effectiveAt.toISOString() },
          accountingSnapshot: { glCode: originalEntry.glCodeSnapshot, costCenterCode: originalEntry.costCenterCodeSnapshot },
        });
        const reversed = await tx.agencyLedgerAdjustment.update({ where: { id: adjustment.id }, data: { status: "reversed", reversedAt: effectiveAt, reversedById: auth.user.id, reversalReason: reason } });
        await writeAuditLog(auth.user, { centerId: reversed.centerId, action: "billing.agency_ledger_adjustment.reversed", resource: "AgencyLedgerAdjustment", resourceId: reversed.id, metadata: { ledgerEntryId: ledger.entry.id, reasonRecorded: true } }, tx);
        return { adjustment: reversed, ledgerEntryId: ledger.entry.id };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The adjustment changed while it was being reversed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "closeAccountingPeriod") {
    if (!canCloseAgencyAccountingPeriod(auth.user.role)) return NextResponse.json({ ok: false, error: "Only a billing administrator or higher accounting role can close an agency accounting period." }, { status: 403 });
    const startDate = dateValue(body.startDate);
    const endDate = dateValue(body.endDate);
    const name = clean(body.name);
    const reason = clean(body.reason);
    if (!startDate || !endDate || endDate < startDate || !name || !reason) return NextResponse.json({ ok: false, error: "Period name, valid start/end dates, and a close reason are required." }, { status: 400 });
    const currentAccountingDate = dateValue(dateInput(new Date())) ?? new Date();
    if (endDate > currentAccountingDate) return NextResponse.json({ ok: false, error: "An accounting period cannot be closed beyond the current UTC accounting day." }, { status: 400 });
    const { endExclusive } = agencyUtcCalendarRange(startDate, endDate);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        await requireAgencyReconciliationEnabled(tx, centerId);
        const overlap = await tx.agencyAccountingPeriod.findFirst({ where: { centerId, OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }] } });
        if (overlap && (overlap.startDate.getTime() !== startDate.getTime() || overlap.endDate.getTime() !== endDate.getTime())) throw new AgencyWorkflowError(`This range overlaps ${overlap.name}.`, 409);
        if (overlap?.status === "closed") {
          const recoveredCounts: RecoveredAgencyLedgerEventCounts = {
            recoveredClaimReceivableCount: 0,
            recoveredRemittanceReceivedCount: 0,
            recoveredRemittanceReversalCount: 0,
          };
          await writeAuditLog(auth.user, { centerId, action: "billing.agency_accounting_period.close_replayed", resource: "AgencyAccountingPeriod", resourceId: overlap.id, metadata: { name, startDate, endDate, reasonRecorded: true, reused: true, ...recoveredCounts } }, tx);
          return { period: overlap, reused: true, ...recoveredCounts };
        }
        const recoveredCounts = await recoverMissingAgencyLedgerCutoverEvents(tx, centerId, endExclusive, auth.user.id);
        const [unresolvedBatches, pendingAllocations, pendingAdjustments, reconciliationVariances, claimSourceConflicts] = await Promise.all([
          tx.agencyRemittanceBatch.count({
            where: {
              centerId,
              OR: [
                { status: { in: ["unmatched", "partially_allocated", "exception"] } },
                { status: "pending_review", reviewedAt: null },
              ],
              paidAt: { lt: endExclusive },
            },
          }),
          tx.agencyRemittanceAllocation.count({
            where: {
              status: "pending_review",
              createdAt: { lt: endExclusive },
              batch: { centerId, reviewedAt: { not: null } },
            },
          }),
          tx.agencyLedgerAdjustment.count({
            where: {
              centerId,
              status: "pending_review",
              effectiveAt: { lt: endExclusive },
            },
          }),
          agencyReconciliationVarianceCount(tx, centerId, endExclusive),
          agencyClaimSourceConflictCount(tx, centerId, endExclusive),
        ]);
        if (unresolvedBatches || pendingAllocations || pendingAdjustments || reconciliationVariances || claimSourceConflicts) throw new AgencyWorkflowError(`Resolve ${unresolvedBatches} remittance batch exception(s), ${pendingAllocations} pending additional allocation(s), ${pendingAdjustments} pending adjustment(s), ${reconciliationVariances} reconciliation variance(s), and ${claimSourceConflicts} claim/remittance source conflict(s) before closing this period.`, 409);
        const period = overlap
          ? await tx.agencyAccountingPeriod.update({ where: { id: overlap.id }, data: { name, status: "closed", closedAt: new Date(), closedById: auth.user.id, closeReason: reason } })
          : await tx.agencyAccountingPeriod.create({ data: { centerId, name, startDate, endDate, status: "closed", closedAt: new Date(), closedById: auth.user.id, closeReason: reason } });
        await writeAuditLog(auth.user, { centerId, action: "billing.agency_accounting_period.closed", resource: "AgencyAccountingPeriod", resourceId: period.id, metadata: { name, startDate, endDate, reasonRecorded: true, reused: false, ...recoveredCounts } }, tx);
        return { period, reused: false, ...recoveredCounts };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The accounting period changed while it was being closed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    const recoveredEventCount = result.recoveredClaimReceivableCount + result.recoveredRemittanceReceivedCount + result.recoveredRemittanceReversalCount;
    const recoveryMessage = recoveredEventCount
      ? ` Recovered ${recoveredEventCount} missing controlled-batch receipt event${recoveredEventCount === 1 ? "" : "s"} from exact immutable batch evidence before reconciliation.`
      : "";
    return NextResponse.json({ ok: true, ...result, message: result.reused ? "This accounting period was already closed." : `Accounting period closed.${recoveryMessage}` });
  }

  if (action === "reopenAccountingPeriod") {
    const periodId = clean(body.periodId);
    const reason = clean(body.reason);
    if (!canCloseAgencyAccountingPeriod(auth.user.role)) return NextResponse.json({ ok: false, error: "Only a billing administrator or higher accounting role can reopen an agency accounting period." }, { status: 403 });
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a specific reason for reopening the period." }, { status: 400 });
    let period;
    try {
      period = await prisma.$transaction(async (tx) => {
        const existing = await tx.agencyAccountingPeriod.findUnique({ where: { id: periodId } });
        if (!existing || existing.centerId !== centerId) throw new AgencyWorkflowError("Accounting period not found.", 404);
        if (existing.status !== "closed") throw new AgencyWorkflowError("This accounting period is not closed.", 409);
        const laterClosedPeriod = await tx.agencyAccountingPeriod.findFirst({
          where: { centerId: existing.centerId, status: "closed", startDate: { gt: existing.startDate } },
          orderBy: [{ startDate: "desc" }, { id: "desc" }],
          select: { name: true },
        });
        if (laterClosedPeriod) throw new AgencyWorkflowError(`Reopen the later closed period ${laterClosedPeriod.name} first.`, 409);
        const transition = await tx.agencyAccountingPeriod.updateMany({
          where: { id: existing.id, status: "closed" },
          data: { status: "open", reopenedAt: new Date(), reopenedById: auth.user.id, reopenReason: reason },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("The accounting period changed while it was being reopened. Refresh and try again.", 409);
        const reopened = await tx.agencyAccountingPeriod.findUniqueOrThrow({ where: { id: existing.id } });
        await writeAuditLog(auth.user, { centerId: reopened.centerId, action: "billing.agency_accounting_period.reopened", resource: "AgencyAccountingPeriod", resourceId: reopened.id, metadata: { reasonRecorded: true } }, tx);
        return reopened;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The accounting period changed while it was being reopened. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, period });
  }

  if (action === "rejectRemittanceBatch") {
    const batchId = clean(body.batchId);
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a specific rejection reason." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const batch = await tx.agencyRemittanceBatch.findUnique({ where: { id: batchId } });
        if (!batch || batch.centerId !== centerId) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: batch.enteredById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reject this batch.", 403);
        if (batch.status !== "pending_review" || batch.reviewedAt) throw new AgencyWorkflowError("Only an unposted batch awaiting initial review can be rejected.", 409);
        await tx.agencyRemittanceAllocation.updateMany({
          where: { batchId: batch.id, status: "pending_review" },
          data: {
            status: "rejected",
            reviewedById: auth.user.id,
            reviewedAt: new Date(),
            reviewNotes: `Rejected because parent batch was rejected: ${reason}`,
          },
        });
        const updated = await tx.agencyRemittanceBatch.update({ where: { id: batch.id }, data: { status: "rejected", reviewedById: auth.user.id, reviewedAt: new Date(), reviewNotes: reason } });
        await writeAuditLog(auth.user, { centerId: updated.centerId, action: "billing.agency_remittance_batch.rejected", resource: "AgencyRemittanceBatch", resourceId: updated.id, metadata: { reasonRecorded: true } }, tx);
        return updated;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The batch changed while it was being rejected. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, batch: result });
  }

  if (action === "reverseRemittanceBatch") {
    const batchId = clean(body.batchId);
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a specific reason for reversing this deposit batch." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const batch = await tx.agencyRemittanceBatch.findUnique({ where: { id: batchId }, include: { allocations: { include: { remittance: { select: { enteredById: true } } } }, agencyProgram: true } });
        if (!batch || batch.centerId !== centerId) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: batch.enteredById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reverse this batch.", 403);
        if (batch.allocations.some((allocation) => allocation.status === "pending_review" && allocation.requestedById === auth.user.id)) {
          throw new AgencyWorkflowError("A different accounting reviewer must reverse this batch because you requested a still-pending allocation on it.", 403);
        }
        if (batch.reversedAt || batch.status === "reversed") throw new AgencyWorkflowError("This remittance batch was already reversed.", 409);
        if (batch.status === "rejected") throw new AgencyWorkflowError("A rejected, unposted batch cannot be reversed.", 409);
        const isLegacyReconciledBatch = batch.status === "reconciled" && !batch.reviewedAt;
        if ((!batch.reviewedAt && !isLegacyReconciledBatch) || !REVERSIBLE_REMITTANCE_BATCH_STATUSES.has(batch.status)) throw new AgencyWorkflowError("Reject an unposted batch instead of creating financial reversal entries.", 409);
        const postedAllocations = batch.allocations.filter((allocation) => allocation.status === "posted" && allocation.remittanceId);
        const initialPostedAllocations = postedAllocations.filter((allocation) => !batch.reviewedAt || allocation.createdAt <= batch.reviewedAt);
        const latePostedAllocations = postedAllocations.filter((allocation) => batch.reviewedAt && allocation.createdAt > batch.reviewedAt);
        const postedAllocationCents = postedAllocations.reduce((total, allocation) => total + allocation.amountCents, 0);
        const initialAllocatedCents = initialPostedAllocations.reduce((total, allocation) => total + allocation.amountCents, 0);
        const initialUnappliedCents = batch.totalCents - initialAllocatedCents;
        const expectedCurrentUnappliedCents = initialUnappliedCents - latePostedAllocations.reduce((total, allocation) => total + allocation.amountCents, 0);
        if (initialUnappliedCents < 0
          || postedAllocationCents !== batch.allocatedCents
          || expectedCurrentUnappliedCents !== batch.unappliedCents) {
          throw new AgencyWorkflowError("The deposit totals conflict with its immutable allocation history. No reversal was posted.", 409);
        }
        const unappliedEntries = await tx.agencyLedgerEntry.findMany({
          where: {
            remittanceBatchId: batch.id,
            sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
            type: { in: ["unapplied_cash", "unapplied_cash_allocation"] },
          },
          include: { agencyLedgerAccount: { select: { centerId: true, agencyProgramId: true } } },
        });
        const originalUnappliedEntries = unappliedEntries.filter((entry) => entry.type === "unapplied_cash");
        const releaseEntries = unappliedEntries.filter((entry) => entry.type === "unapplied_cash_allocation");
        if (initialUnappliedCents === 0 && unappliedEntries.length > 0) {
          throw new AgencyWorkflowError("The deposit has unexpected unapplied-cash ledger evidence. No reversal was posted.", 409);
        }
        if (initialUnappliedCents > 0) {
          const originalUnapplied = originalUnappliedEntries.length === 1 ? originalUnappliedEntries[0] : null;
          if (!originalUnapplied
            || originalUnapplied.agencyLedgerAccount.centerId !== batch.centerId
            || originalUnapplied.agencyLedgerAccount.agencyProgramId !== batch.agencyProgramId
            || originalUnapplied.claimId !== null
            || originalUnapplied.remittanceId !== null
            || originalUnapplied.adjustmentId !== null
            || originalUnapplied.amountCents !== -initialUnappliedCents
            || originalUnapplied.effectiveAt.getTime() !== (batch.reviewedAt ?? batch.paidAt).getTime()
            || originalUnapplied.externalReference !== batch.externalReference
            || originalUnapplied.externalId !== `batch-unapplied:${batch.id}`
            || originalUnapplied.glCodeSnapshot !== batch.cashGlCodeSnapshot
            || originalUnapplied.costCenterCodeSnapshot !== batch.costCenterCodeSnapshot) {
            throw new AgencyWorkflowError("The deposit's original unapplied-cash ledger evidence is missing or conflicting. No reversal was posted.", 409);
          }
          const expectedReleaseByExternalId = new Map(latePostedAllocations.map((allocation) => [`batch-unapplied-allocation:${allocation.id}`, allocation]));
          if (releaseEntries.length !== expectedReleaseByExternalId.size) throw new AgencyWorkflowError("The deposit's unapplied-cash releases do not match its approved allocations. No reversal was posted.", 409);
          for (const release of releaseEntries) {
            const allocation = release.externalId ? expectedReleaseByExternalId.get(release.externalId) : null;
            if (!allocation?.reviewedAt
              || release.agencyLedgerAccount.centerId !== batch.centerId
              || release.agencyLedgerAccount.agencyProgramId !== batch.agencyProgramId
              || release.claimId !== null
              || release.remittanceId !== null
              || release.adjustmentId !== null
              || release.amountCents !== allocation.amountCents
              || release.effectiveAt.getTime() !== allocation.reviewedAt.getTime()
              || release.externalReference !== batch.externalReference
              || release.glCodeSnapshot !== batch.cashGlCodeSnapshot
              || release.costCenterCodeSnapshot !== batch.costCenterCodeSnapshot) {
              throw new AgencyWorkflowError("The deposit's unapplied-cash release evidence conflicts with its exact allocation or accounting snapshot. No reversal was posted.", 409);
            }
          }
          const unappliedNetCents = unappliedEntries.reduce((total, entry) => total + entry.amountCents, 0);
          if (unappliedNetCents !== -batch.unappliedCents) throw new AgencyWorkflowError("The deposit's unapplied-cash ledger total is out of balance. No reversal was posted.", 409);
        }
        const originalPostingEffectiveAt = batch.reviewedAt ?? batch.paidAt;
        const reversedAt = agencyReversalEffectiveAt(originalPostingEffectiveAt);
        if (isBeforeUtcAccountingDay(reversedAt, batch.paidAt) || reversedAt < originalPostingEffectiveAt) throw new AgencyWorkflowError("A deposit reversal cannot be effective before the original receipt or posting event.", 409);
        await assertAgencyPeriodOpen(tx, batch.centerId, reversedAt);
        const reversedRemittances = [];
        let agencyLedgerAccountId: string | null = null;
        for (const allocation of postedAllocations) {
          const reversed = await reverseAgencyRemittanceRecord(tx, {
            remittanceId: allocation.remittanceId as string,
            reviewerId: auth.user.id,
            expectedCenterId: batch.centerId,
            expectedBatchId: batch.id,
            reason,
            reversedAt,
          }, { recalculateAgencyLedger: false });
          agencyLedgerAccountId = reversed.agencyLedgerAccountId;
          reversedRemittances.push(reversed);
        }
        let unappliedReversalEntryId: string | null = null;
        if (batch.unappliedCents > 0) {
          const reversal = await appendAgencyLedgerEntry(tx, {
            centerId: batch.centerId,
            agencyProgramId: batch.agencyProgramId,
            remittanceBatchId: batch.id,
            type: "unapplied_cash_reversal",
            description: `Reversed unapplied ${batch.agencyProgram.name} cash batch`,
            amountCents: batch.unappliedCents,
            effectiveAt: reversedAt,
            externalReference: batch.externalReference,
            externalId: `batch-unapplied-reversal:${batch.id}`,
            metadata: { reason, originalPaidAt: batch.paidAt.toISOString() },
            accountingSnapshot: { glCode: batch.cashGlCodeSnapshot, costCenterCode: batch.costCenterCodeSnapshot },
          }, { recalculate: false });
          agencyLedgerAccountId = reversal.account.id;
          unappliedReversalEntryId = reversal.entry.id;
        }
        if (agencyLedgerAccountId) await recalculateAgencyLedgerBalances(tx, agencyLedgerAccountId);
        await tx.agencyRemittanceAllocation.updateMany({
          where: { batchId: batch.id, status: "pending_review" },
          data: {
            status: "rejected",
            reviewedById: auth.user.id,
            reviewedAt: reversedAt,
            reviewNotes: `Rejected because parent batch was reversed: ${reason}`,
          },
        });
        const updated = await tx.agencyRemittanceBatch.update({ where: { id: batch.id }, data: { status: "reversed", reversedAt, reversedById: auth.user.id, reversalReason: reason } });
        await writeAuditLog(auth.user, { centerId: updated.centerId, action: "billing.agency_remittance_batch.reversed", resource: "AgencyRemittanceBatch", resourceId: updated.id, metadata: { reversedRemittanceCount: reversedRemittances.length, unappliedReversalEntryId, reasonRecorded: true } }, tx);
        return { batch: updated, reversedRemittanceCount: reversedRemittances.length, unappliedReversalEntryId };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The batch changed while it was being reversed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "createClaim") {
    const start = dateValue(body.servicePeriodStart);
    const end = dateValue(body.servicePeriodEnd);
    const units = numberValue(body.serviceUnits);
    if (!start || !end || end < start || units <= 0) return NextResponse.json({ ok: false, error: "Valid service dates and positive service units are required." }, { status: 400 });
    let claim;
    try {
      claim = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({
          where: { id: clean(body.authorizationId) },
          include: {
            agencyProgram: true,
            family: { select: { id: true, centerId: true } },
            child: { select: { id: true, familyId: true, fullName: true, enrollmentStatus: true, classroomId: true } },
          },
        });
        if (!authorization || authorization.centerId !== centerId || !exactAgencyAuthorizationScope(authorization)) {
          throw new AgencyWorkflowError("Authorization not found.", 404);
        }
        if (authorization.status !== "active") throw new AgencyWorkflowError("Only an active authorization can be used for a new claim.", 409);
        if (!isCurrentlyEnrolledChildRecord(authorization.child)) throw new AgencyWorkflowError("Only an authorization for a currently enrolled child with an assigned classroom can be used for a new claim.", 409);
        const requestedRateCents = hasNumericInput(body.rateDollars) ? cents(body.rateDollars) : authorization.authorizedRateCents;
        if (requestedRateCents <= 0 || requestedRateCents > authorization.authorizedRateCents) throw new AgencyWorkflowError("The claim rate must be positive and cannot exceed the authorization rate.");
        const claimedCents = claimAmountCents({ serviceUnits: units, rateCents: requestedRateCents });
        if (start < authorization.coverageStart || end > authorization.coverageEnd || claimedCents <= 0) throw new AgencyWorkflowError("Service dates must fall within the authorization and units/rate must produce a positive claim.");
        const overlap = await tx.subsidyClaim.findFirst({ where: { authorizationId: authorization.id, status: { notIn: ["void", "denied"] }, servicePeriodStart: { lte: end }, servicePeriodEnd: { gte: start } }, select: { number: true } });
        if (overlap) throw new AgencyWorkflowError(`Claim ${overlap.number} already covers some or all of this service period. Void or correct that claim before creating another.`, 409);
        if (authorization.authorizedUnits !== null) {
          const used = await tx.subsidyClaimLine.aggregate({ where: { claim: { authorizationId: authorization.id, status: { notIn: ["void", "denied"] } } }, _sum: { serviceUnits: true } });
          if (unitsAtPrecision((used._sum.serviceUnits ?? 0) + units) > unitsAtPrecision(authorization.authorizedUnits)) throw new AgencyWorkflowError("This claim would exceed the authorization's total approved units.", 409);
        }
        const requirements = [...normalizeAgencyRequirements(authorization.agencyProgram.requirements), ...normalizeAgencyRequirements(authorization.requiredDocuments)]
          .filter((item, index, all) => item.required && all.findIndex((candidate) => candidate.key === item.key) === index);
        const created = await tx.subsidyClaim.create({ data: {
          centerId: authorization.centerId, agencyProgramId: authorization.agencyProgramId, authorizationId: authorization.id,
          number: subsidyClaimNumber({ stateCode: authorization.agencyProgram.stateCode, centerId: authorization.centerId, suffix: randomUUID() }),
          servicePeriodStart: start, servicePeriodEnd: end, dueDate: dateValue(body.dueDate), claimedCents, createdById: auth.user.id,
          lines: { create: [{ childId: authorization.childId, description: clean(body.description) || `${authorization.child.fullName} subsidy care`, serviceUnits: units, unitType: authorization.unitType, rateCents: requestedRateCents, amountCents: claimedCents, attendanceDays: numberValue(body.attendanceDays) || null }] },
          documents: { create: requirements.map((requirement) => ({ name: requirement.label, type: requirement.type })) },
        }, include: {
          agencyProgram: { select: { id: true, name: true } },
          authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
          lines: true,
          documents: { orderBy: { name: "asc" } },
          remittances: { orderBy: { paidAt: "desc" }, include: { allocation: { select: { batchId: true } } } },
        } });
        await writeAuditLog(auth.user, { centerId: created.centerId, action: "billing.subsidy_claim.created", resource: "SubsidyClaim", resourceId: created.id, metadata: { authorizationId: created.authorizationId, claimedCents: created.claimedCents, servicePeriodStart: start, servicePeriodEnd: end } }, tx);
        return created;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "Another claim was created for this authorization at the same time. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, claim });
  }

  const claim = await prisma.subsidyClaim.findUnique({
    where: { id: clean(body.claimId) },
    include: {
      agencyProgram: true,
      authorization: { include: {
        agencyProgram: { select: { id: true, centerId: true } },
        family: { select: { id: true, centerId: true } },
        child: { select: { id: true, familyId: true } },
      } },
      lines: { select: { childId: true } },
      documents: true,
    },
  });
  if (!claim || claim.centerId !== centerId || !exactAgencyClaimScope(claim)) return NextResponse.json({ ok: false, error: "Claim not found." }, { status: 404 });

  if (action === "syncRequirements") {
    let missing: ReturnType<typeof claimRequirements> = [];
    try {
      missing = await prisma.$transaction(async (tx) => {
        const scoped = await requireCurrentAgencyClaimMutationScope(tx, claim.id, centerId, auth.user);
        const transition = await tx.subsidyClaim.updateMany({
          where: { id: scoped.id, centerId, status: { in: ["draft", "ready", "submitted"] }, updatedAt: scoped.updatedAt },
          data: { updatedAt: new Date() },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("Requirements cannot be changed after the agency decision is recorded.", 409);
        const requirements = claimRequirements(scoped);
        const existing = new Set(scoped.documents.map((document) => `${document.name.trim().toLowerCase()}|${document.type.trim().toLowerCase()}`));
        const missingRequirements = requirements.filter((requirement) => !existing.has(`${requirement.label.trim().toLowerCase()}|${requirement.type.trim().toLowerCase()}`));
        if (missingRequirements.length) await tx.subsidyClaimDocument.createMany({ data: missingRequirements.map((requirement) => ({ claimId: scoped.id, name: requirement.label, type: requirement.type })) });
        await writeAuditLog(auth.user, { centerId: scoped.centerId, action: "billing.subsidy_claim.requirements_synced", resource: "SubsidyClaim", resourceId: scoped.id, metadata: { addedCount: missingRequirements.length, requirementLabels: missingRequirements.map((item) => item.label) } }, tx);
        return missingRequirements;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim changed while requirements were synchronized. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, addedCount: missing.length });
  }

  if (action === "updateDocument") {
    const status = clean(body.status);
    if (!new Set(["required", "requested", "received", "verified", "not_applicable"]).has(status)) return NextResponse.json({ ok: false, error: "Invalid document status." }, { status: 400 });
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const scoped = await requireCurrentAgencyClaimMutationScope(tx, claim.id, centerId, auth.user);
        const transition = await tx.subsidyClaim.updateMany({
          where: { id: scoped.id, centerId, status: { in: ["draft", "ready", "submitted"] }, updatedAt: scoped.updatedAt },
          data: { updatedAt: new Date() },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("Documents cannot be changed after the agency decision is recorded.", 409);
        const document = await tx.subsidyClaimDocument.findFirst({ where: { id: clean(body.documentId), claimId: scoped.id } });
        if (!document) throw new AgencyWorkflowError("Claim document not found.", 404);
        const linkedDocumentId = clean(body.linkedDocumentId) || document.documentId;
        const notes = clean(body.notes) || document.notes;
        if (status === "verified" && !linkedDocumentId && !notes) throw new AgencyWorkflowError("Add an evidence note or linked document before marking this item verified.");
        const changed = await tx.subsidyClaimDocument.update({ where: { id: document.id }, data: { status, documentId: linkedDocumentId, notes } });
        await writeAuditLog(auth.user, { centerId: scoped.centerId, action: "billing.subsidy_claim_document.updated", resource: "SubsidyClaimDocument", resourceId: changed.id, metadata: { claimId: scoped.id, status } }, tx);
        return changed;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim or document changed at the same time. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, document: updated });
  }

  if (action === "submitClaim") {
    const externalReference = clean(body.externalReference);
    if (!externalReference) return NextResponse.json({ ok: false, error: "Enter the confirmation reference returned by the external agency channel." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const current = await requireCurrentAgencyClaimMutationScope(tx, claim.id, centerId, auth.user);
        const transition = await tx.subsidyClaim.updateMany({ where: { id: current.id, centerId, status: { in: ["draft", "ready"] }, updatedAt: current.updatedAt }, data: { updatedAt: new Date() } });
        if (transition.count !== 1) throw new AgencyWorkflowError("Only a current draft or ready claim can be submitted.", 409);
        const blockers = claimSubmissionBlockers({ ...current.agencyProgram, documents: current.documents, requirements: claimRequirements(current) });
        if (blockers.length) throw new AgencyWorkflowError(`Claim is not ready for submission. ${blockers.join(" ")}`, 409);
        const submitted = await tx.subsidyClaim.update({ where: { id: current.id }, data: { status: "submitted", submittedAt: new Date(), externalReference } });
        await writeAuditLog(auth.user, { centerId: current.centerId, action: "billing.subsidy_claim.marked_submitted", resource: "SubsidyClaim", resourceId: current.id, metadata: { submissionMethod: current.agencyProgram.submissionMethod, externalReference: submitted.externalReference } }, tx);
        return { submitted, submissionMethod: current.agencyProgram.submissionMethod };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim or its requirements changed before submission was recorded. Refresh and try again." }, { status: 409 });
      throw error;
    }
    const { submitted } = result;
    return NextResponse.json({ ok: true, claim: submitted, externalSubmissionPerformed: false });
  }

  if (action === "recordDecision") {
    if (claim.status !== "submitted") return NextResponse.json({ ok: false, error: "Only a submitted claim can receive an agency decision." }, { status: 409 });
    const decision = clean(body.decision);
    if (decision !== "approved" && decision !== "denied") return NextResponse.json({ ok: false, error: "Decision must be approved or denied." }, { status: 400 });
    const approvedCents = decision === "approved" ? cents(body.approvedDollars) : 0;
    if (decision === "approved" && approvedCents <= 0) return NextResponse.json({ ok: false, error: "Approved amount must be greater than zero." }, { status: 400 });
    if (approvedCents > claim.claimedCents) return NextResponse.json({ ok: false, error: "Approved amount cannot exceed the claim." }, { status: 400 });
    const externalReference = clean(body.externalReference) || claim.externalReference;
    if (!externalReference) return NextResponse.json({ ok: false, error: "Enter the agency decision or claim reference." }, { status: 400 });
    const denialReason = clean(body.denialReason);
    if (decision === "denied" && !denialReason) return NextResponse.json({ ok: false, error: "Enter the agency denial reason or code." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const current = await requireCurrentAgencyClaimMutationScope(tx, claim.id, centerId, auth.user);
        if (current.status !== "submitted") throw new AgencyWorkflowError("The claim changed before the agency decision was recorded. Refresh before trying again.", 409);
        if (approvedCents > current.claimedCents) throw new AgencyWorkflowError("Approved amount cannot exceed the claim.", 400);
        const currentExternalReference = clean(body.externalReference) || current.externalReference;
        if (!currentExternalReference) throw new AgencyWorkflowError("Enter the agency decision or claim reference.", 400);
        const transition = await tx.subsidyClaim.updateMany({ where: { id: current.id, centerId, status: "submitted", updatedAt: current.updatedAt }, data: { updatedAt: new Date() } });
        if (transition.count !== 1) throw new AgencyWorkflowError("The claim changed before the agency decision was recorded. Refresh before trying again.", 409);
        if (decision === "approved") {
          const blockers = claimSubmissionBlockers({ ...current.agencyProgram, documents: current.documents, requirements: claimRequirements(current) });
          if (blockers.length) throw new AgencyWorkflowError("Complete every required claim document before recording agency approval.", 409);
        }
        const approvedAt = decision === "approved" ? new Date() : null;
        if (approvedAt) await assertAgencyPeriodOpen(tx, current.centerId, approvedAt);
        const updated = await tx.subsidyClaim.update({ where: { id: current.id }, data: { status: decision, approvedCents, approvedAt, denialReason: decision === "denied" ? denialReason : null, externalReference: currentExternalReference } });
        const ledger = decision === "approved" ? await ensureAgencyClaimReceivable(tx, { ...updated, agencyProgram: current.agencyProgram }) : null;
        await writeAuditLog(auth.user, { centerId: current.centerId, action: `billing.subsidy_claim.${decision}`, resource: "SubsidyClaim", resourceId: current.id, metadata: { approvedCents, externalReference: updated.externalReference, agencyLedgerEntryId: ledger?.entry.id ?? null } }, tx);
        return { updated, ledgerEntryId: ledger?.entry.id ?? null };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim or agency ledger changed before the decision was recorded. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, claim: result.updated, agencyLedgerEntryId: result.ledgerEntryId });
  }

  if (action === "voidClaim") {
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a reason for voiding the draft claim." }, { status: 400 });
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const current = await tx.subsidyClaim.findUnique({ where: { id: claim.id } });
        if (!current || current.centerId !== centerId) throw new AgencyWorkflowError("Claim not found.", 404);
        if (current.status === "void") return current;
        if (!["draft", "ready"].includes(current.status)) throw new AgencyWorkflowError("Only an unsubmitted draft claim can be voided here. Submitted decisions and payments must retain their history.", 409);
        const transition = await tx.subsidyClaim.updateMany({ where: { id: current.id, centerId, status: current.status, updatedAt: current.updatedAt }, data: { status: "void", customFields: { ...recordValue(current.customFields), voidReason: reason, voidedAt: new Date().toISOString(), voidedById: auth.user.id } } });
        if (transition.count !== 1) throw new AgencyWorkflowError("The claim changed before it could be voided. Refresh before trying again.", 409);
        const voided = await tx.subsidyClaim.findUniqueOrThrow({ where: { id: current.id } });
        await writeAuditLog(auth.user, { centerId: current.centerId, action: "billing.subsidy_claim.voided", resource: "SubsidyClaim", resourceId: current.id, metadata: { reasonRecorded: true } }, tx);
        return voided;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim changed before it could be voided. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, claim: updated });
  }

  if (action === "recordRemittance") {
    const amountCents = cents(body.amountDollars);
    const reference = clean(body.externalReference);
    const paidAt = dateValue(body.paidAt);
    const paymentMethod = clean(body.paymentMethod) || "ach";
    if (!reference || !paidAt || amountCents <= 0 || amountCents > POSTGRES_INT_MAX_CENTS) return NextResponse.json({ ok: false, error: "A unique reference, paid date, and positive remittance amount within the supported accounting range are required." }, { status: 400 });
    if (isFutureAgencyAccountingDate(paidAt)) return NextResponse.json({ ok: false, error: "A remittance payment date cannot be after the current UTC accounting day." }, { status: 400 });
    if (!REMITTANCE_METHODS.has(paymentMethod)) return NextResponse.json({ ok: false, error: "Choose ACH, check, agency portal, or other as the remittance method." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const current = await tx.subsidyClaim.findUnique({
          where: { id: claim.id },
          include: { agencyProgram: true, authorization: { include: { family: { include: { billingAccount: true } } } }, remittances: true },
        });
        if (!current || current.centerId !== centerId) throw new AgencyWorkflowError("Claim not found.", 404);
        const center = await tx.center.findUnique({ where: { id: current.centerId }, select: { agencyReconciliationEnabled: true } });
        if (!center) throw new AgencyWorkflowError("School not found.", 404);
        if (center.agencyReconciliationEnabled) throw new AgencyWorkflowError("This school uses reviewed deposit batches. Prepare the remittance for independent review instead of posting it directly.", 409);
        if (!new Set(["approved", "partially_paid"]).has(current.status)) throw new AgencyWorkflowError("Record an agency approval before posting a remittance.", 409);
        const payable = current.approvedCents ?? current.claimedCents;
        const paidBeforeCents = activeRemittanceTotalCents(current.remittances);
        if (paidBeforeCents + amountCents > payable) throw new AgencyWorkflowError("The remittance amount cannot exceed the remaining approved claim.");
        await assertAgencyPeriodOpen(tx, current.centerId, paidAt);
        await ensureAgencyClaimReceivable(tx, current);
        const remittance = await tx.subsidyRemittance.create({ data: { claimId: current.id, amountCents, paidAt, paymentMethod, externalReference: reference, notes: clean(body.notes) || null, enteredById: auth.user.id } });
        const agencyLedger = await appendAgencyLedgerEntry(tx, {
          centerId: current.centerId,
          agencyProgramId: current.agencyProgramId,
          claimId: current.id,
          remittanceId: remittance.id,
          type: "remittance_received",
          description: `${current.agencyProgram.name} remittance for ${current.number}`,
          amountCents: -amountCents,
          effectiveAt: paidAt,
          externalReference: reference,
          externalId: agencyRemittanceLedgerExternalId(remittance.id),
          metadata: { claimNumber: current.number, paymentMethod },
        });
        const legacy = await applyLegacyFamilyLedgerSettlement(tx, {
          claim: current,
          amountCents,
          paidAt,
          reference,
          remittanceId: remittance.id,
        });
        const paidCents = paidBeforeCents + amountCents;
        const updated = await tx.subsidyClaim.update({ where: { id: current.id }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: current.claimedCents, approvedCents: current.approvedCents, paidCents }) } });
        await writeAuditLog(auth.user, { centerId: current.centerId, action: "billing.subsidy_remittance.recorded", resource: "SubsidyRemittance", resourceId: remittance.id, metadata: { claimId: current.id, amountCents, externalReference: reference, agencyLedgerEntryId: agencyLedger.entry.id, agencyLedgerBalanceCents: agencyLedger.account.balanceCents, legacyFamilyLedgerAppliedCents: legacy.appliedCents, legacyFamilyLedgerEntryId: legacy.entryId } }, tx);
        return {
          remittance,
          claim: updated,
          agencyLedgerEntryId: agencyLedger.entry.id,
          agencyLedgerBalanceCents: agencyLedger.account.balanceCents,
          legacyFamilyLedgerAppliedCents: legacy.appliedCents,
          legacyFamilyLedgerEntryId: legacy.entryId,
          ledgerAppliedCents: legacy.appliedCents,
          ledgerEntryId: legacy.entryId,
        };
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "That remittance reference is already recorded or the claim changed. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "reverseRemittance") {
    const remittanceId = clean(body.remittanceId);
    const reason = clean(body.reason);
    if (!remittanceId || !reason) return NextResponse.json({ ok: false, error: "Choose a remittance and enter a correction reason." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const center = await tx.center.findUnique({ where: { id: claim.centerId }, select: { agencyReconciliationEnabled: true } });
        if (!center) throw new AgencyWorkflowError("School not found.", 404);
        const reversed = await reverseAgencyRemittanceRecord(tx, {
          remittanceId,
          reviewerId: auth.user.id,
          reviewerRole: auth.user.role,
          requireIndependentReviewer: center.agencyReconciliationEnabled,
          expectedClaimId: claim.id,
          expectedCenterId: claim.centerId,
          requireUnbatched: true,
          reason,
          reversedAt: new Date(),
        });
        await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_remittance.reversed", resource: "SubsidyRemittance", resourceId: reversed.remittanceId, metadata: { claimId: claim.id, reason, agencyLedgerEntryId: reversed.agencyLedgerEntryId, agencyLedgerBalanceCents: reversed.agencyLedgerBalanceCents, legacyFamilyReversalLedgerEntryId: reversed.legacyFamilyReversalLedgerEntryId } }, tx);
        return reversed;
      }, AGENCY_WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The remittance changed while it was being reversed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ ok: false, error: "Unsupported agency billing action." }, { status: 400 });
}

export const GET = withApiLogging("api.billing.agency-claims.get", getHandler);
export const POST = withApiLogging("api.billing.agency-claims.post", postHandler);
