import { randomUUID } from "node:crypto";
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
  agencyProgramSetupBlockers,
  agencyProgramStatus,
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
  agencyAgingBucket,
  agencyAllocationFingerprint,
  agencyBatchFingerprint,
  agencyBatchStatus,
  agencyLedgerRunningBalances,
  agencyRemittanceReferenceKey,
  agencyUnappliedCashBalance,
  agencyUtcCalendarRange,
  canCloseAgencyAccountingPeriod,
  canReviewAgencyPosting,
  isAgencyClaimOverdue,
  normalizeAgencyPaymentReference,
  signedAgencyAdjustmentCents,
} from "@/lib/agency-reconciliation";
import { currentlyEnrolledStatusValues, isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

const CURRENT_ENROLLMENT_STATUSES = currentlyEnrolledStatusValues();
const AUTHORIZATION_UNIT_TYPES = new Set(["weekly", "daily", "hourly", "monthly"]);
const REMITTANCE_METHODS = new Set(["ach", "check", "agency_portal", "other"]);
const SUBMISSION_METHODS = new Set<string>(AGENCY_SUBMISSION_METHODS);
const UNIT_PRECISION = 1_000_000;
const CLAIM_PAGE_SIZE = 100;
const AGENCY_LEDGER_ENTRY_LIMIT = 250;
const AGENCY_BATCH_LIMIT = 100;
const AGENCY_ADJUSTMENT_LIMIT = 100;

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

function prismaConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
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
  if (!Array.isArray(value)) return { allocations: [], hasDuplicateClaims: false };
  const seen = new Set<string>();
  const allocations: Array<{ claimId: string; amountCents: number; notes: string | null }> = [];
  let hasDuplicateClaims = false;
  for (const item of value) {
    const row = recordValue(item);
    const claimId = clean(row.claimId);
    const amountCents = cents(row.amountDollars);
    if (!claimId || amountCents <= 0) continue;
    if (seen.has(claimId)) {
      hasDuplicateClaims = true;
      continue;
    }
    seen.add(claimId);
    allocations.push({ claimId, amountCents, notes: clean(row.notes) || null });
  }
  return { allocations, hasDuplicateClaims };
}

async function assertAgencyPeriodOpen(tx: Prisma.TransactionClient, centerId: string, effectiveAt: Date) {
  const accountingDate = dateValue(dateInput(effectiveAt)) ?? effectiveAt;
  const closed = await tx.agencyAccountingPeriod.findFirst({
    where: { centerId, status: "closed", startDate: { lte: accountingDate }, endDate: { gte: accountingDate } },
    select: { name: true },
  });
  if (closed) throw new AgencyWorkflowError(`${closed.name} is closed. Post a current-period correcting entry instead of backdating this transaction.`, 409);
}

async function agencyReconciliationVarianceCount(tx: Prisma.TransactionClient, centerId: string, endExclusive: Date) {
  const [accounts, claims, remittances, adjustments] = await Promise.all([
    tx.agencyLedgerAccount.findMany({
      where: { centerId },
      select: {
        agencyProgramId: true,
        entries: { where: { effectiveAt: { lt: endExclusive } }, select: { type: true, amountCents: true } },
      },
    }),
    tx.subsidyClaim.findMany({
      where: {
        centerId,
        approvedCents: { gt: 0 },
        approvedAt: { lt: endExclusive },
        status: { notIn: ["void", "denied"] },
      },
      select: {
        id: true,
        agencyProgramId: true,
        approvedCents: true,
        claimedCents: true,
        ledgerEntries: {
          where: {
            sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
            type: "claim_approved",
            effectiveAt: { lt: endExclusive },
          },
          select: { id: true },
        },
      },
    }),
    tx.subsidyRemittance.findMany({
      where: {
        claim: { centerId },
        OR: [
          {
            ledgerEntries: {
              some: {
                sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
                type: "remittance_received",
                effectiveAt: { lt: endExclusive },
              },
            },
          },
          {
            paidAt: { lt: endExclusive },
            ledgerEntries: {
              none: {
                sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
                type: "remittance_received",
              },
            },
          },
          {
            ledgerEntries: {
              some: {
                sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
                type: "remittance_reversal",
                effectiveAt: { lt: endExclusive },
              },
            },
          },
          {
            reversedAt: { lt: endExclusive },
            ledgerEntries: {
              none: {
                sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
                type: "remittance_reversal",
              },
            },
          },
        ],
      },
      select: {
        id: true,
        amountCents: true,
        reversedAt: true,
        claim: { select: { agencyProgramId: true } },
        ledgerEntries: {
          where: {
            sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
            type: { in: ["remittance_received", "remittance_reversal"] },
            effectiveAt: { lt: endExclusive },
          },
          select: { id: true, type: true },
        },
      },
    }),
    tx.agencyLedgerAdjustment.findMany({
      where: {
        centerId,
        reviewedAt: { not: null },
        effectiveAt: { lt: endExclusive },
        status: { not: "rejected" },
        OR: [{ reversedAt: null }, { reversedAt: { gte: endExclusive } }],
      },
      select: { agencyProgramId: true, amountCents: true },
    }),
  ]);
  const totals = new Map<string, { expected: number; ledger: number }>();
  const row = (agencyProgramId: string) => {
    const current = totals.get(agencyProgramId) ?? { expected: 0, ledger: 0 };
    totals.set(agencyProgramId, current);
    return current;
  };
  for (const account of accounts) {
    const current = row(account.agencyProgramId);
    current.ledger += account.entries.reduce((total, entry) => total + entry.amountCents, 0);
    current.expected -= agencyUnappliedCashBalance(account.entries);
  }
  let missingLedgerEventCount = 0;
  for (const claim of claims) {
    const current = row(claim.agencyProgramId);
    current.expected += claim.approvedCents ?? claim.claimedCents;
    if (!claim.ledgerEntries.length) missingLedgerEventCount += 1;
  }
  for (const remittance of remittances) {
    const current = row(remittance.claim.agencyProgramId);
    const reversedAsOfPeriodEnd = remittance.reversedAt && remittance.reversedAt < endExclusive;
    if (!reversedAsOfPeriodEnd) current.expected -= remittance.amountCents;
    if (!remittance.ledgerEntries.some((entry) => entry.type === "remittance_received")) missingLedgerEventCount += 1;
    if (reversedAsOfPeriodEnd && !remittance.ledgerEntries.some((entry) => entry.type === "remittance_reversal")) missingLedgerEventCount += 1;
  }
  for (const adjustment of adjustments) row(adjustment.agencyProgramId).expected += adjustment.amountCents;
  const netVarianceCount = [...totals.values()].filter((current) => current.ledger !== current.expected).length;
  return netVarianceCount + missingLedgerEventCount;
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
  return `${values.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")}\r\n`;
}

type AgencyLedgerClaimInput = {
  id: string;
  centerId: string;
  agencyProgramId: string;
  number: string;
  approvedCents: number | null;
  approvedAt: Date | null;
  externalReference: string | null;
  agencyProgram: { name: string };
};

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
}) {
  const account = await tx.agencyLedgerAccount.upsert({
    where: { centerId_agencyProgramId: { centerId: input.centerId, agencyProgramId: input.agencyProgramId } },
    create: { centerId: input.centerId, agencyProgramId: input.agencyProgramId, balanceCents: 0 },
    update: { balanceCents: { increment: 0 } },
  });
  let entry = await tx.agencyLedgerEntry.create({ data: {
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
    sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM,
    externalId: input.externalId,
    metadata: input.metadata,
  } });
  const entries = await tx.agencyLedgerEntry.findMany({
    where: { agencyLedgerAccountId: account.id },
    orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, amountCents: true, balanceAfterCents: true },
  });
  const runningBalances = agencyLedgerRunningBalances(entries);
  const existingBalanceById = new Map(entries.map((candidate) => [candidate.id, candidate.balanceAfterCents]));
  for (const running of runningBalances) {
    if (existingBalanceById.get(running.id) === running.balanceAfterCents) continue;
    const updated = await tx.agencyLedgerEntry.update({
      where: { id: running.id },
      data: { balanceAfterCents: running.balanceAfterCents },
    });
    if (updated.id === entry.id) entry = updated;
  }
  const updatedAccount = await tx.agencyLedgerAccount.update({
    where: { id: account.id },
    data: { balanceCents: runningBalances.at(-1)?.balanceAfterCents ?? 0 },
  });
  return { account: updatedAccount, entry };
}

async function ensureAgencyClaimReceivable(tx: Prisma.TransactionClient, claim: AgencyLedgerClaimInput) {
  const externalId = agencyClaimApprovalLedgerExternalId(claim.id);
  const existing = await tx.agencyLedgerEntry.findUnique({
    where: { sourceSystem_externalId: { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM, externalId } },
  });
  if (existing) return { entry: existing, created: false };
  const approvedCents = claim.approvedCents ?? 0;
  if (approvedCents <= 0) throw new AgencyWorkflowError("Record a positive agency approval before creating its receivable.", 409);
  const effectiveAt = claim.approvedAt ?? new Date();
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
  });
  return { entry: result.entry, created: true };
}

type AgencyPostingClaim = AgencyLedgerClaimInput & {
  claimedCents: number;
  paidCents: number;
  status: string;
  authorization: {
    authorizationNumber: string;
    family: { billingAccount: { id: string } | null };
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
  const billingAccount = input.claim.authorization?.family.billingAccount;
  if (!billingAccount) return { appliedCents: 0, entryId: null as string | null };
  const authorizationNumber = input.claim.authorization?.authorizationNumber ?? "";
  const agencyName = input.claim.agencyProgram.name.trim().toLowerCase();
  const agencyEntries = await tx.ledgerEntry.findMany({
    where: { billingAccountId: billingAccount.id, sourceSystem: "subsidy_agency" },
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
  const appliedCents = Math.min(input.amountCents, Math.max(0, matchingOutstandingCents));
  if (appliedCents <= 0) return { appliedCents: 0, entryId: null as string | null };
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
      agencyName: input.claim.agencyProgram.name,
      authorizationNumber,
      externalReference: input.reference,
      legacyCompatibilityMirror: true,
    },
  } });
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
}) {
  const payable = input.claim.approvedCents ?? input.claim.claimedCents;
  const paidBeforeCents = activeRemittanceTotalCents(input.claim.remittances);
  if (!new Set(["approved", "partially_paid"]).has(input.claim.status)) {
    throw new AgencyWorkflowError(`Claim ${input.claim.number} is not approved for payment.`, 409);
  }
  if (paidBeforeCents + input.amountCents > payable) {
    throw new AgencyWorkflowError(`The allocation for ${input.claim.number} exceeds its remaining approved amount.`, 409);
  }
  await ensureAgencyClaimReceivable(tx, input.claim);
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
    effectiveAt: input.ledgerEffectiveAt ?? input.paidAt,
    externalReference: input.reference,
    externalId: agencyRemittanceLedgerExternalId(remittance.id),
    metadata: { claimNumber: input.claim.number, paymentMethod: input.paymentMethod, remittanceBatchId: input.batchId },
  });
  await tx.agencyRemittanceAllocation.update({
    where: { id: input.allocationId },
    data: { status: "posted", remittanceId: remittance.id, reviewedById: input.reviewerId, reviewedAt: new Date() },
  });
  const legacy = await applyLegacyFamilyLedgerSettlement(tx, {
    claim: input.claim,
    amountCents: input.amountCents,
    paidAt: input.paidAt,
    ledgerEffectiveAt: input.ledgerEffectiveAt,
    reference: input.reference,
    remittanceId: remittance.id,
  });
  const paidCents = paidBeforeCents + input.amountCents;
  const updatedClaim = await tx.subsidyClaim.update({
    where: { id: input.claim.id },
    data: { paidCents, status: nextRemittanceStatus({ claimedCents: input.claim.claimedCents, approvedCents: input.claim.approvedCents, paidCents }) },
  });
  return { remittance, ledger, legacy, updatedClaim };
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
  expectedClaimId?: string;
  requireUnbatched?: boolean;
  reason: string;
  reversedAt: Date;
}) {
  const remittance = await tx.subsidyRemittance.findUnique({
    where: { id: input.remittanceId },
    include: { claim: { include: { agencyProgram: true } }, allocation: true },
  });
  if (!remittance) throw new AgencyWorkflowError("Remittance not found.", 404);
  if (input.expectedClaimId && remittance.claimId !== input.expectedClaimId) throw new AgencyWorkflowError("Remittance not found.", 404);
  if (input.reviewerRole && !canReviewAgencyPosting({ role: input.reviewerRole, reviewerId: input.reviewerId, requestedById: remittance.enteredById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reverse this remittance.", 403);
  if (input.requireUnbatched && remittance.allocation) throw new AgencyWorkflowError("This payment belongs to a controlled deposit batch. Reverse the batch from the reconciliation queue so every allocation remains balanced.", 409);
  if (remittance.reversedAt) throw new AgencyWorkflowError("This remittance was already reversed.", 409);
  await assertAgencyPeriodOpen(tx, remittance.claim.centerId, input.reversedAt);
  const transition = await tx.subsidyRemittance.updateMany({
    where: { id: remittance.id, reversedAt: null },
    data: { reversedAt: input.reversedAt, reversedById: input.reviewerId, reversalReason: input.reason },
  });
  if (transition.count !== 1) throw new AgencyWorkflowError("The remittance changed before it could be reversed.", 409);
  await ensureAgencyClaimReceivable(tx, remittance.claim);
  const agencyPaymentExternalId = agencyRemittanceLedgerExternalId(remittance.id);
  let agencyPaymentEntry = await tx.agencyLedgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM, externalId: agencyPaymentExternalId } } });
  if (!agencyPaymentEntry) {
    await assertAgencyPeriodOpen(tx, remittance.claim.centerId, remittance.paidAt);
    const restored = await appendAgencyLedgerEntry(tx, {
      centerId: remittance.claim.centerId,
      agencyProgramId: remittance.claim.agencyProgramId,
      claimId: remittance.claimId,
      remittanceId: remittance.id,
      remittanceBatchId: remittance.allocation?.batchId,
      type: "remittance_received",
      description: `${remittance.claim.agencyProgram.name} remittance for ${remittance.claim.number}`,
      amountCents: -remittance.amountCents,
      effectiveAt: remittance.paidAt,
      externalReference: remittance.externalReference,
      externalId: agencyPaymentExternalId,
      metadata: { claimNumber: remittance.claim.number, paymentMethod: remittance.paymentMethod, restoredBeforeReversal: true },
    });
    agencyPaymentEntry = restored.entry;
  }
  const agencyReversal = await appendAgencyLedgerEntry(tx, {
    centerId: remittance.claim.centerId,
    agencyProgramId: remittance.claim.agencyProgramId,
    claimId: remittance.claimId,
    remittanceId: remittance.id,
    remittanceBatchId: remittance.allocation?.batchId,
    type: "remittance_reversal",
    description: `Reversed agency remittance for ${remittance.claim.number}`,
    amountCents: remittance.amountCents,
    effectiveAt: input.reversedAt,
    externalReference: remittance.externalReference,
    externalId: agencyRemittanceReversalLedgerExternalId(remittance.id),
    metadata: { claimNumber: remittance.claim.number, originalAgencyLedgerEntryId: agencyPaymentEntry.id, reason: input.reason },
  });
  const legacyPaymentEntry = await tx.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: "subsidy_agency", externalId: `agency-remittance:${remittance.id}` } } });
  let legacyFamilyReversalLedgerEntryId: string | null = null;
  if (legacyPaymentEntry && legacyPaymentEntry.amountCents < 0) {
    const updatedAccount = await tx.billingAccount.update({ where: { id: legacyPaymentEntry.billingAccountId }, data: { balanceCents: { increment: Math.abs(legacyPaymentEntry.amountCents) } } });
    const reversalEntry = await tx.ledgerEntry.create({ data: {
      billingAccountId: legacyPaymentEntry.billingAccountId,
      type: "agency_payment_reversal",
      description: `Reversed legacy family-ledger agency settlement for ${remittance.claim.number}`,
      amountCents: Math.abs(legacyPaymentEntry.amountCents),
      balanceAfterCents: 0,
      effectiveAt: input.reversedAt,
      sourceSystem: "subsidy_agency",
      externalId: `agency-remittance-reversal:${remittance.id}`,
      metadata: { ...recordValue(legacyPaymentEntry.metadata), remittanceId: remittance.id, claimId: remittance.claimId, originalLedgerEntryId: legacyPaymentEntry.id, reason: input.reason, legacyCompatibilityMirror: true },
    } });
    await recalculateLegacyFamilyLedgerBalances(tx, legacyPaymentEntry.billingAccountId, updatedAccount.balanceCents);
    legacyFamilyReversalLedgerEntryId = reversalEntry.id;
  }
  const activeRemittances = await tx.subsidyRemittance.findMany({ where: { claimId: remittance.claimId, reversedAt: null }, select: { amountCents: true, reversedAt: true } });
  const paidCents = activeRemittanceTotalCents(activeRemittances);
  const claim = await tx.subsidyClaim.update({ where: { id: remittance.claimId }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: remittance.claim.claimedCents, approvedCents: remittance.claim.approvedCents, paidCents }) } });
  if (remittance.allocation) await tx.agencyRemittanceAllocation.update({ where: { id: remittance.allocation.id }, data: { status: "reversed" } });
  return {
    remittance,
    remittanceId: remittance.id,
    claim,
    agencyLedgerEntryId: agencyReversal.entry.id,
    agencyLedgerBalanceCents: agencyReversal.account.balanceCents,
    legacyFamilyReversalLedgerEntryId,
    reversalLedgerEntryId: legacyFamilyReversalLedgerEntryId,
  };
}

function exportClaimsCsv(centerIds: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvRow(["Claim", "Agency", "Family", "Child", "Service start", "Service end", "Status", "Claimed", "Approved", "Paid", "Missing documents"])));
        let cursorId: string | undefined;
        while (true) {
          const claims = await prisma.subsidyClaim.findMany({
            where: { centerId: { in: centerIds } },
            orderBy: { id: "asc" },
            take: 250,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            include: {
              agencyProgram: { select: { name: true, requirements: true } },
              authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
              documents: { orderBy: { name: "asc" } },
            },
          });
          if (!claims.length) break;
          const chunk = claims.map((claim) => {
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
            return csvRow([
              claim.number,
              claim.agencyProgram.name,
              claim.authorization?.family.name ?? "",
              claim.authorization?.child.fullName ?? "",
              dateInput(claim.servicePeriodStart),
              dateInput(claim.servicePeriodEnd),
              claim.status,
              (claim.claimedCents / 100).toFixed(2),
              claim.approvedCents === null ? "" : (claim.approvedCents / 100).toFixed(2),
              (claim.paidCents / 100).toFixed(2),
              [...new Set(missingDocuments)].join("; "),
            ]);
          }).join("");
          controller.enqueue(encoder.encode(chunk));
          cursorId = claims.at(-1)?.id;
          if (claims.length < 250) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=agency-claims.csv",
      "Cache-Control": "private, no-store",
    },
  });
}

function agencyEntryGlCode(type: string, program: { receivableGlCode: string | null; cashGlCode: string | null; adjustmentGlCode: string | null }) {
  if (type.startsWith("adjustment_")) return program.adjustmentGlCode ?? "";
  if (type.includes("remittance") || type.includes("unapplied_cash")) return program.cashGlCode ?? "";
  return program.receivableGlCode ?? "";
}

function exportAgencyLedgerCsv(centerIds: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvRow(["Date", "Agency", "Program", "Type", "GL code", "Cost center", "Claim", "Family", "Child", "Reference", "Charge", "Payment / credit", "Net", "Balance"])));
        let cursorId: string | undefined;
        while (true) {
          const entries = await prisma.agencyLedgerEntry.findMany({
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
              agencyLedgerAccount: { include: { agencyProgram: { select: { name: true, programName: true, receivableGlCode: true, cashGlCode: true, adjustmentGlCode: true, costCenterCode: true } } } },
              claim: { include: { authorization: { include: { family: { select: { name: true } }, child: { select: { fullName: true } } } } } },
            },
          });
          if (!entries.length) break;
          controller.enqueue(encoder.encode(entries.map((entry) => csvRow([
            dateInput(entry.effectiveAt),
            entry.agencyLedgerAccount.agencyProgram.name,
            entry.agencyLedgerAccount.agencyProgram.programName ?? "",
            entry.type,
            agencyEntryGlCode(entry.type, entry.agencyLedgerAccount.agencyProgram),
            entry.agencyLedgerAccount.agencyProgram.costCenterCode ?? "",
            entry.claim?.number ?? "",
            entry.claim?.authorization?.family.name ?? "",
            entry.claim?.authorization?.child.fullName ?? "",
            entry.externalReference ?? "",
            entry.amountCents > 0 ? (entry.amountCents / 100).toFixed(2) : "",
            entry.amountCents < 0 ? (Math.abs(entry.amountCents) / 100).toFixed(2) : "",
            (entry.amountCents / 100).toFixed(2),
            (entry.balanceAfterCents / 100).toFixed(2),
          ])).join("")));
          cursorId = entries.at(-1)?.id;
          if (entries.length < 250) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=agency-ledger.csv",
      "Cache-Control": "private, no-store",
    },
  });
}

async function exportAgencyReconciliationCsv(centerIds: string[]) {
  const [accounts, claims, batches, adjustments] = await Promise.all([
    prisma.agencyLedgerAccount.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ centerId: "asc" }, { agencyProgram: { name: "asc" } }],
      include: { center: { select: { name: true } }, agencyProgram: { select: { name: true, programName: true, receivableGlCode: true, cashGlCode: true, adjustmentGlCode: true, costCenterCode: true } } },
    }),
    prisma.subsidyClaim.findMany({
      where: { centerId: { in: centerIds }, approvedCents: { gt: 0 }, status: { notIn: ["void", "denied"] } },
      select: { agencyProgramId: true, approvedCents: true, claimedCents: true, remittances: { where: { reversedAt: null }, select: { amountCents: true } } },
    }),
    prisma.agencyRemittanceBatch.findMany({
      where: { centerId: { in: centerIds }, reviewedAt: { not: null }, reversedAt: null },
      select: { agencyProgramId: true, unappliedCents: true, status: true, externalReference: true },
    }),
    prisma.agencyLedgerAdjustment.findMany({
      where: { centerId: { in: centerIds }, status: "posted" },
      select: { agencyProgramId: true, amountCents: true },
    }),
  ]);
  const rows = accounts.map((account) => {
    const approvedCents = claims.filter((claim) => claim.agencyProgramId === account.agencyProgramId).reduce((total, claim) => total + (claim.approvedCents ?? claim.claimedCents), 0);
    const remittedCents = claims.filter((claim) => claim.agencyProgramId === account.agencyProgramId).reduce((total, claim) => total + claim.remittances.reduce((claimTotal, remittance) => claimTotal + remittance.amountCents, 0), 0);
    const unappliedCents = batches.filter((batch) => batch.agencyProgramId === account.agencyProgramId).reduce((total, batch) => total + batch.unappliedCents, 0);
    const adjustmentCents = adjustments.filter((adjustment) => adjustment.agencyProgramId === account.agencyProgramId).reduce((total, adjustment) => total + adjustment.amountCents, 0);
    const expectedBalanceCents = approvedCents - remittedCents - unappliedCents + adjustmentCents;
    return csvRow([
      account.center.name,
      account.agencyProgram.name,
      account.agencyProgram.programName ?? "",
      account.agencyProgram.receivableGlCode ?? "",
      account.agencyProgram.cashGlCode ?? "",
      account.agencyProgram.adjustmentGlCode ?? "",
      account.agencyProgram.costCenterCode ?? "",
      (approvedCents / 100).toFixed(2),
      (remittedCents / 100).toFixed(2),
      (unappliedCents / 100).toFixed(2),
      (adjustmentCents / 100).toFixed(2),
      (expectedBalanceCents / 100).toFixed(2),
      (account.balanceCents / 100).toFixed(2),
      ((account.balanceCents - expectedBalanceCents) / 100).toFixed(2),
      batches.filter((batch) => batch.agencyProgramId === account.agencyProgramId && batch.status !== "reconciled").length,
    ]);
  });
  return new Response([
    csvRow(["School", "Agency", "Program", "A/R GL", "Cash GL", "Adjustment GL", "Cost center", "Approved", "Remitted", "Unapplied cash", "Adjustments", "Expected balance", "Ledger balance", "Variance", "Open batch exceptions"]),
    ...rows,
  ].join(""), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=agency-reconciliation.csv",
      "Cache-Control": "private, no-store",
    },
  });
}

async function exportAgencyDepositsCsv(centerIds: string[]) {
  const batches = await prisma.agencyRemittanceBatch.findMany({
    where: { centerId: { in: centerIds } },
    orderBy: [{ paidAt: "asc" }, { id: "asc" }],
    include: {
      center: { select: { name: true } },
      agencyProgram: { select: { name: true, programName: true, cashGlCode: true, costCenterCode: true } },
      allocations: { orderBy: { createdAt: "asc" }, include: { claim: { select: { number: true } } } },
    },
  });
  const rows = batches.flatMap((batch) => {
    const allocations = batch.allocations.length ? batch.allocations : [null];
    return allocations.map((allocation) => csvRow([
      batch.center.name,
      batch.agencyProgram.name,
      batch.agencyProgram.programName ?? "",
      dateInput(batch.paidAt),
      batch.externalReference,
      batch.paymentMethod,
      batch.agencyProgram.cashGlCode ?? "",
      batch.agencyProgram.costCenterCode ?? "",
      (batch.totalCents / 100).toFixed(2),
      (batch.allocatedCents / 100).toFixed(2),
      (batch.unappliedCents / 100).toFixed(2),
      batch.status,
      batch.evidenceName ?? "",
      batch.evidenceReference ?? "",
      batch.followUpOwnerId ?? "",
      batch.followUpDueAt ? dateInput(batch.followUpDueAt) : "",
      allocation?.claim.number ?? "",
      allocation ? (allocation.amountCents / 100).toFixed(2) : "",
      allocation?.status ?? "",
    ]));
  });
  return new Response([
    csvRow(["School", "Agency", "Program", "Paid date", "Deposit reference", "Method", "Cash GL", "Cost center", "Deposit total", "Allocated", "Unapplied", "Batch status", "Evidence", "Evidence reference", "Follow-up owner", "Follow-up due", "Claim", "Claim allocation", "Allocation status"]),
    ...rows,
  ].join(""), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=agency-deposits.csv",
      "Cache-Control": "private, no-store",
    },
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

function centerAllowed(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, centerId: string) {
  return Boolean(centerId && canAccessCenter(user, centerId));
}

async function getHandler(request: NextRequest) {
  const auth = await currentBillingUser();
  if (!auth.ok) return auth.response;
  const requestedCenterId = clean(request.nextUrl.searchParams.get("centerId"));
  const exportingClaims = request.nextUrl.searchParams.get("exportClaims") === "true";
  const exportingLedger = request.nextUrl.searchParams.get("exportLedger") === "true";
  const exportingReconciliation = request.nextUrl.searchParams.get("exportReconciliation") === "true";
  const exportingDeposits = request.nextUrl.searchParams.get("exportDeposits") === "true";
  const requestedClaimPage = Number.parseInt(clean(request.nextUrl.searchParams.get("claimPage")) || "1", 10);
  const claimPage = Math.min(Math.max(Number.isFinite(requestedClaimPage) ? requestedClaimPage : 1, 1), 10_000);
  const claimCursor = clean(request.nextUrl.searchParams.get("claimCursor"));
  const ledgerCursor = clean(request.nextUrl.searchParams.get("ledgerCursor"));
  const ledgerAccountId = clean(request.nextUrl.searchParams.get("ledgerAccountId"));
  const ledgerType = clean(request.nextUrl.searchParams.get("ledgerType"));
  const ledgerQuery = clean(request.nextUrl.searchParams.get("ledgerQuery"));
  const ledgerFrom = dateValue(request.nextUrl.searchParams.get("ledgerFrom"));
  const ledgerToInput = dateValue(request.nextUrl.searchParams.get("ledgerTo"));
  const ledgerTo = ledgerToInput ? new Date(ledgerToInput.getTime() + 86_400_000 - 1) : null;
  const centerIds = requestedCenterId
    ? centerAllowed(auth.user, requestedCenterId) ? [requestedCenterId] : []
    : auth.user.centerIds;
  if (!centerIds.length) return NextResponse.json({ ok: false, error: "No accessible school selected." }, { status: 403 });
  if (exportingClaims) return exportClaimsCsv(centerIds);
  if (exportingLedger) return exportAgencyLedgerCsv(centerIds);
  if (exportingReconciliation) return exportAgencyReconciliationCsv(centerIds);
  if (exportingDeposits) return exportAgencyDepositsCsv(centerIds);
  if (claimPage > 1 && !claimCursor) return NextResponse.json({ ok: false, error: "Refresh the claim queue before opening that page." }, { status: 400 });

  const ledgerWhere: Prisma.AgencyLedgerEntryWhereInput = {
    agencyLedgerAccount: { centerId: { in: centerIds }, ...(ledgerAccountId ? { id: ledgerAccountId } : {}) },
    ...(ledgerType ? { type: ledgerType } : {}),
    ...(ledgerFrom || ledgerTo ? { effectiveAt: { ...(ledgerFrom ? { gte: ledgerFrom } : {}), ...(ledgerTo ? { lte: ledgerTo } : {}) } } : {}),
    ...(ledgerQuery ? { OR: [
      { externalReference: { contains: ledgerQuery, mode: "insensitive" } },
      { description: { contains: ledgerQuery, mode: "insensitive" } },
      { claim: { number: { contains: ledgerQuery, mode: "insensitive" } } },
    ] } : {}),
  };

  const [programs, authorizations, claims, summaryRows, families, ledgerAccounts, ledgerEntryRows, recentBatches, unresolvedBatches, recentAdjustments, unresolvedAdjustments, accountingPeriods, reconciliationClaims, reconciliationBatches, reconciliationAdjustments, legacyFamilyAgencyEntries, pendingBatchReviews, pendingAdjustmentReviews, overdueBatchFollowUps, overdueAdjustmentFollowUps] = await Promise.all([
    prisma.agencyProgram.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ stateCode: "asc" }, { name: "asc" }],
    }),
    prisma.subsidyAuthorization.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ coverageEnd: "asc" }, { createdAt: "desc" }],
      include: {
        agencyProgram: { select: { name: true, programName: true } },
        family: { select: { name: true } },
        child: { select: { fullName: true, enrollmentStatus: true, classroomId: true } },
      },
    }),
    prisma.subsidyClaim.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ createdAt: "desc" }, { dueDate: "asc" }, { id: "desc" }],
      ...(claimCursor ? { cursor: { id: claimCursor }, skip: 1 } : {}),
      take: CLAIM_PAGE_SIZE + 1,
      include: {
        agencyProgram: { select: { id: true, name: true, programName: true, providerNumber: true, vendorNumber: true, submissionMethod: true, portalUrl: true, paymentInstructions: true, requirements: true } },
        authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
        lines: true,
        documents: { orderBy: { name: "asc" } },
        remittances: { orderBy: { paidAt: "desc" }, include: { allocation: { select: { batchId: true } } } },
      },
    }),
    prisma.$queryRaw<AgencySummaryRow[]>(Prisma.sql`
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
    prisma.family.findMany({
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
    prisma.agencyLedgerAccount.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ balanceCents: "desc" }, { agencyProgram: { name: "asc" } }],
      include: { agencyProgram: { select: { name: true, programName: true } } },
    }),
    prisma.agencyLedgerEntry.findMany({
      where: ledgerWhere,
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      ...(ledgerCursor ? { cursor: { id: ledgerCursor }, skip: 1 } : {}),
      take: AGENCY_LEDGER_ENTRY_LIMIT + 1,
      include: {
        agencyLedgerAccount: { include: { agencyProgram: { select: { name: true, programName: true } } } },
        claim: { include: { authorization: { include: { family: { select: { name: true } }, child: { select: { fullName: true } } } } } },
        remittance: { select: { paymentMethod: true, reversedAt: true } },
      },
    }),
    prisma.agencyRemittanceBatch.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: AGENCY_BATCH_LIMIT,
      include: {
        agencyProgram: { select: { name: true, programName: true } },
        allocations: { orderBy: { createdAt: "asc" }, include: { claim: { include: { authorization: { include: { family: { select: { name: true } }, child: { select: { fullName: true } } } } } } } },
      },
    }),
    prisma.agencyRemittanceBatch.findMany({
      where: { centerId: { in: centerIds }, reversedAt: null, status: { notIn: ["rejected", "reversed"] } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      include: {
        agencyProgram: { select: { name: true, programName: true } },
        allocations: { orderBy: { createdAt: "asc" }, include: { claim: { include: { authorization: { include: { family: { select: { name: true } }, child: { select: { fullName: true } } } } } } } },
      },
    }),
    prisma.agencyLedgerAdjustment.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AGENCY_ADJUSTMENT_LIMIT,
      include: { agencyProgram: { select: { name: true, programName: true } }, claim: { select: { number: true } } },
    }),
    prisma.agencyLedgerAdjustment.findMany({
      where: { centerId: { in: centerIds }, status: { in: ["pending_review", "posted"] }, reversedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { agencyProgram: { select: { name: true, programName: true } }, claim: { select: { number: true } } },
    }),
    prisma.agencyAccountingPeriod.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: 36,
    }),
    prisma.subsidyClaim.findMany({
      where: { centerId: { in: centerIds }, approvedCents: { gt: 0 }, status: { notIn: ["void", "denied"] } },
      select: {
        id: true,
        agencyProgramId: true,
        number: true,
        status: true,
        dueDate: true,
        approvedCents: true,
        claimedCents: true,
        paidCents: true,
        agencyProgram: { select: { id: true, name: true } },
        authorization: { select: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
        remittances: { where: { reversedAt: null }, select: { amountCents: true } },
      },
    }),
    prisma.agencyRemittanceBatch.findMany({
      where: { centerId: { in: centerIds }, reviewedAt: { not: null }, reversedAt: null },
      select: { agencyProgramId: true, unappliedCents: true },
    }),
    prisma.agencyLedgerAdjustment.findMany({
      where: { centerId: { in: centerIds }, status: "posted" },
      select: { agencyProgramId: true, amountCents: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { sourceSystem: "subsidy_agency", billingAccount: { family: { centerId: { in: centerIds } } } },
      select: { billingAccountId: true, amountCents: true, type: true },
    }),
    prisma.agencyRemittanceBatch.count({ where: { centerId: { in: centerIds }, status: "pending_review" } }),
    prisma.agencyLedgerAdjustment.count({ where: { centerId: { in: centerIds }, status: "pending_review" } }),
    prisma.agencyRemittanceBatch.count({ where: { centerId: { in: centerIds }, reversedAt: null, followUpDueAt: { lt: new Date() }, status: { in: ["pending_review", "unmatched", "partially_allocated", "exception"] } } }),
    prisma.agencyLedgerAdjustment.count({ where: { centerId: { in: centerIds }, followUpDueAt: { lt: new Date() }, status: "pending_review" } }),
  ]);

  const batches = [...new Map([...unresolvedBatches, ...recentBatches].map((batch) => [batch.id, batch])).values()]
    .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime() || right.createdAt.getTime() - left.createdAt.getTime());
  const adjustments = [...new Map([...unresolvedAdjustments, ...recentAdjustments].map((adjustment) => [adjustment.id, adjustment])).values()]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));

  const hasNextClaimPage = claims.length > CLAIM_PAGE_SIZE;
  const visibleClaims = claims.slice(0, CLAIM_PAGE_SIZE).map((claim) => ({
    ...claim,
    requirementBlockers: ["draft", "ready", "submitted"].includes(claim.status) ? claimSubmissionBlockers({
      ...claim.agencyProgram,
      documents: claim.documents,
      requirements: claimRequirements(claim),
    }).filter((blocker) => blocker.startsWith("Add current required item:")) : [],
  }));
  const summaryRow = summaryRows[0];
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const aging = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 };
  const claimTotalsByProgram = new Map<string, { approvedCents: number; remittedCents: number }>();
  for (const claim of reconciliationClaims) {
    const approvedCents = claim.approvedCents ?? claim.claimedCents;
    const remittedCents = claim.remittances.reduce((total, remittance) => total + remittance.amountCents, 0);
    const outstandingCents = Math.max(0, approvedCents - remittedCents);
    aging[agencyAgingBucket(claim.dueDate, now)] += outstandingCents;
    const current = claimTotalsByProgram.get(claim.agencyProgramId) ?? { approvedCents: 0, remittedCents: 0 };
    current.approvedCents += approvedCents;
    current.remittedCents += remittedCents;
    claimTotalsByProgram.set(claim.agencyProgramId, current);
  }
  const unappliedByProgram = new Map<string, number>();
  for (const batch of reconciliationBatches) {
    unappliedByProgram.set(batch.agencyProgramId, (unappliedByProgram.get(batch.agencyProgramId) ?? 0) + batch.unappliedCents);
  }
  const adjustmentByProgram = new Map<string, number>();
  for (const adjustment of reconciliationAdjustments) {
    adjustmentByProgram.set(adjustment.agencyProgramId, (adjustmentByProgram.get(adjustment.agencyProgramId) ?? 0) + adjustment.amountCents);
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
  const legacyFamilyAgencyBalanceCents = legacyFamilyAgencyEntries.reduce((total, entry) => total + entry.amountCents, 0);
  const hasNextLedgerPage = ledgerEntryRows.length > AGENCY_LEDGER_ENTRY_LIMIT;
  const visibleLedgerEntries = ledgerEntryRows.slice(0, AGENCY_LEDGER_ENTRY_LIMIT);
  const summary = {
    claimedCents: Number(summaryRow?.claimedCents ?? 0),
    approvedCents: Number(summaryRow?.approvedCents ?? 0),
    paidCents: Number(summaryRow?.paidCents ?? 0),
    outstandingCents: Number(summaryRow?.outstandingCents ?? 0),
    needsSubmission: Number(summaryRow?.needsSubmission ?? 0),
    missingDocumentClaims: Number(summaryRow?.missingDocumentClaims ?? 0),
    agencyLedgerBalanceCents: ledgerAccounts.reduce((total, account) => total + account.balanceCents, 0),
    reconciliationVarianceCents: reconciliation.reduce((total, row) => total + row.varianceCents, 0),
    unappliedCashCents: reconciliationBatches.reduce((total, batch) => total + batch.unappliedCents, 0),
    pendingBatchReviews,
    pendingAdjustmentReviews,
    overdueClaimCount: reconciliationClaims.filter((claim) => (claim.approvedCents ?? claim.claimedCents) > claim.paidCents && isAgencyClaimOverdue(claim.dueDate, now)).length,
    overdueFollowUpCount: overdueBatchFollowUps + overdueAdjustmentFollowUps,
    legacyFamilyAgencyBalanceCents,
    legacyFamilyAgencyEntryCount: legacyFamilyAgencyEntries.length,
  };
  const programReadiness = programs.map((program) => {
    const setupBlockers = agencyProgramSetupBlockers(program);
    return { ...program, status: setupBlockers.length ? "setup_required" : "active", setupBlockers };
  });
  const expirationCutoff = new Date(today);
  expirationCutoff.setUTCDate(expirationCutoff.getUTCDate() + 31);
  const readiness = {
    readyPrograms: programReadiness.filter((program) => program.status === "active").length,
    setupRequiredPrograms: programReadiness.filter((program) => program.status !== "active").length,
    expiredAuthorizations: authorizations.filter((authorization) => authorization.status === "active" && authorization.coverageEnd < today).length,
    expiringAuthorizations: authorizations.filter((authorization) => authorization.status === "active" && authorization.coverageEnd >= today && authorization.coverageEnd < expirationCutoff).length,
  };

  return NextResponse.json({
    ok: true,
    programs: programReadiness,
    authorizations,
    claims: visibleClaims,
    allocationClaims: reconciliationClaims.filter((claim) => ["approved", "partially_paid"].includes(claim.status)),
    claimPagination: { page: claimPage, pageSize: CLAIM_PAGE_SIZE, hasNext: hasNextClaimPage, nextCursor: hasNextClaimPage ? visibleClaims.at(-1)?.id ?? null : null },
    families,
    summary: { ...summary, ...readiness },
    capabilities: {
      currentUserId: auth.user.id,
      canReviewAgencyPosting: canCloseAgencyAccountingPeriod(auth.user.role),
      canCloseAccountingPeriod: canCloseAgencyAccountingPeriod(auth.user.role),
    },
    aging,
    reconciliation,
    remittanceBatches: batches,
    adjustments,
    accountingPeriods,
    ledger: {
      accounts: ledgerAccounts,
      entries: visibleLedgerEntries,
      entryLimit: AGENCY_LEDGER_ENTRY_LIMIT,
      truncated: hasNextLedgerPage,
      hasNext: hasNextLedgerPage,
      nextCursor: hasNextLedgerPage ? visibleLedgerEntries.at(-1)?.id ?? null : null,
    },
  });
}

async function postHandler(request: NextRequest) {
  const auth = await currentBillingUser();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action);
  const centerId = clean(body.centerId);

  if (action === "createProgram") {
    if (!centerAllowed(auth.user, centerId)) return NextResponse.json({ ok: false, error: "School access denied." }, { status: 403 });
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
    const program = await prisma.agencyProgram.create({ data: {
      centerId, name, stateCode, programName: clean(body.programName) || null,
      ...setup, remittanceEmail: clean(body.remittanceEmail) || null,
      requirements, status: agencyProgramStatus(setup),
    } });
    await writeAuditLog(auth.user, { centerId, action: "billing.agency_program.created", resource: "AgencyProgram", resourceId: program.id, metadata: { stateCode, name, requirementCount: requirements.length } });
    return NextResponse.json({ ok: true, program });
  }

  if (action === "updateProgram") {
    const program = await prisma.agencyProgram.findUnique({ where: { id: clean(body.agencyProgramId) } });
    if (!program || !centerAllowed(auth.user, program.centerId)) {
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
    const requirements = body.requirements === undefined ? program.requirements : normalizeAgencyRequirements(body.requirements);
    const updated = await prisma.agencyProgram.update({ where: { id: program.id }, data: {
      name, stateCode, programName: clean(body.programName) || null,
      ...setup, remittanceEmail: clean(body.remittanceEmail) || null,
      requirements: requirements ?? undefined, status: agencyProgramStatus(setup),
    } });
    const blockers = agencyProgramSetupBlockers(updated);
    await writeAuditLog(auth.user, {
      centerId: program.centerId,
      action: "billing.agency_program.updated",
      resource: "AgencyProgram",
      resourceId: program.id,
      metadata: {
        status: updated.status,
        hasProviderOrVendorNumber: Boolean(updated.providerNumber || updated.vendorNumber),
        submissionMethod: updated.submissionMethod,
        hasPortalUrl: Boolean(updated.portalUrl),
        hasPaymentInstructions: Boolean(updated.paymentInstructions),
      },
    });
    return NextResponse.json({ ok: true, program: updated, blockers });
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
        if (!program || !family || program.centerId !== family.centerId || !centerAllowed(auth.user, program.centerId) || !child) {
          throw new AgencyWorkflowError("Agency, family, and child must belong to the same accessible school.", 403);
        }
        if (!isCurrentlyEnrolledChildRecord(child)) throw new AgencyWorkflowError("Only a currently enrolled child with an assigned classroom can receive a new agency authorization.", 409);
        const programBlockers = agencyProgramSetupBlockers(program);
        if (programBlockers.length) throw new AgencyWorkflowError(`Complete agency setup before adding child authorizations. ${programBlockers.join(" ")}`, 409);
        return tx.subsidyAuthorization.create({ data: {
          centerId: program.centerId, agencyProgramId, familyId, childId, authorizationNumber,
          coverageStart, coverageEnd, authorizedRateCents, familyCopayCents,
          unitType, authorizedUnits,
          requiredDocuments: normalizeAgencyRequirements(body.requiredDocuments),
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) {
        return NextResponse.json({ ok: false, error: "This authorization already exists for the selected child. Use Edit authorization to correct its rate or dates." }, { status: 409 });
      }
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.created", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { agencyProgramId, familyId, childId, coverageStart, coverageEnd } });
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
          include: { claims: { where: { status: { not: "void" } }, select: { id: true }, take: 1 } },
        });
        if (!authorization || !centerAllowed(auth.user, authorization.centerId)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (authorization.claims.length) throw new AgencyWorkflowError("Void every draft claim tied to this authorization before correcting its rate or dates. Submitted and paid claim history cannot be rewritten.", 409);
        const unitType = clean(body.unitType) || authorization.unitType;
        if (!AUTHORIZATION_UNIT_TYPES.has(unitType)) throw new AgencyWorkflowError("Choose a supported authorization rate unit.");
        const updated = await tx.subsidyAuthorization.update({ where: { id: authorization.id }, data: { authorizationNumber, coverageStart, coverageEnd, authorizedRateCents, familyCopayCents, unitType, authorizedUnits } });
        return { authorization, updated, unitType };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ ok: false, error: "This authorization or its claims changed at the same time. Refresh before trying the correction again." }, { status: 409 });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ ok: false, error: "Another authorization already uses that number for this child and agency." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: correction.authorization.centerId, action: "billing.subsidy_authorization.updated", resource: "SubsidyAuthorization", resourceId: correction.authorization.id, metadata: { previousRateCents: correction.authorization.authorizedRateCents, authorizedRateCents, previousCoverageStart: dateInput(correction.authorization.coverageStart), previousCoverageEnd: dateInput(correction.authorization.coverageEnd), coverageStart: dateInput(coverageStart), coverageEnd: dateInput(coverageEnd), unitType: correction.unitType, authorizedUnits } });
    return NextResponse.json({ ok: true, authorization: correction.updated });
  }

  if (action === "archiveAuthorization") {
    const authorization = await prisma.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) } });
    if (!authorization || !centerAllowed(auth.user, authorization.centerId)) return NextResponse.json({ ok: false, error: "Authorization not found." }, { status: 404 });
    const updated = await prisma.subsidyAuthorization.update({ where: { id: authorization.id }, data: { status: "inactive" } });
    await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.archived", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { previousStatus: authorization.status } });
    return NextResponse.json({ ok: true, authorization: updated });
  }

  if (action === "restoreAuthorization") {
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) }, include: { agencyProgram: true, child: { select: { enrollmentStatus: true, classroomId: true } } } });
        if (!authorization || !centerAllowed(auth.user, authorization.centerId)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (!isCurrentlyEnrolledChildRecord(authorization.child)) throw new AgencyWorkflowError("Only an authorization for a currently enrolled child with an assigned classroom can be restored.", 409);
        const programBlockers = agencyProgramSetupBlockers(authorization.agencyProgram);
        if (programBlockers.length) throw new AgencyWorkflowError(`Complete agency setup before restoring this authorization. ${programBlockers.join(" ")}`, 409);
        const transition = await tx.subsidyAuthorization.updateMany({ where: { id: authorization.id, status: { not: "active" } }, data: { status: "active" } });
        const updated = transition.count ? await tx.subsidyAuthorization.findUniqueOrThrow({ where: { id: authorization.id } }) : authorization;
        return { authorization, updated };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The authorization changed while it was being restored. Refresh and try again." }, { status: 409 });
      throw error;
    }
    const { authorization, updated } = result;
    await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.restored", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { previousStatus: authorization.status } });
    return NextResponse.json({ ok: true, authorization: updated });
  }

  if (action === "prepareRemittanceBatch" || action === "recordRemittance") {
    if (!centerAllowed(auth.user, centerId)) return NextResponse.json({ ok: false, error: "School access denied." }, { status: 403 });
    const reference = clean(body.externalReference);
    const paidAt = dateValue(body.paidAt);
    const paymentMethod = clean(body.paymentMethod) || "ach";
    const totalCents = cents(body.totalDollars ?? body.amountDollars);
    const evidenceName = clean(body.evidenceName);
    const evidenceReference = clean(body.evidenceReference);
    const followUpDueAt = dateValue(body.followUpDueAt);
    const requestedAllocationRows = agencyAllocationRows(body.allocations);
    if (requestedAllocationRows.hasDuplicateClaims) return NextResponse.json({ ok: false, error: "Choose each claim only once in a deposit batch." }, { status: 400 });
    const allocations = requestedAllocationRows.allocations.length
      ? requestedAllocationRows.allocations
      : clean(body.claimId) && cents(body.amountDollars) > 0
        ? [{ claimId: clean(body.claimId), amountCents: cents(body.amountDollars), notes: clean(body.notes) || null }]
        : [];
    const allocatedCents = allocations.reduce((total, allocation) => total + allocation.amountCents, 0);
    if (!reference || !paidAt || totalCents <= 0) return NextResponse.json({ ok: false, error: "A payment reference, paid date, and positive deposit total are required." }, { status: 400 });
    if (!REMITTANCE_METHODS.has(paymentMethod)) return NextResponse.json({ ok: false, error: "Choose ACH, check, agency portal, or other as the remittance method." }, { status: 400 });
    if (allocatedCents > totalCents) return NextResponse.json({ ok: false, error: "Claim allocations cannot exceed the deposit total." }, { status: 400 });
    if (!evidenceName || !evidenceReference || !followUpDueAt) return NextResponse.json({ ok: false, error: "Name the remittance evidence, enter its secure internal reference, and assign a follow-up due date." }, { status: 400 });
    const agencyProgramId = clean(body.agencyProgramId);
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
        const idempotencyKey = clean(body.idempotencyKey) || `agency-batch:${randomUUID()}`;
        const existingByIdempotency = await tx.agencyRemittanceBatch.findUnique({ where: { idempotencyKey } });
        if (existingByIdempotency) {
          if (existingByIdempotency.reconciliationFingerprint !== fingerprint) throw new AgencyWorkflowError("This retry key was already used for a different remittance batch.", 409);
          return { batch: existingByIdempotency, reused: true };
        }
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
        return { batch, reused: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "That school and agency already have a remittance batch with this payment reference. Review the existing batch instead of posting it again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId, action: "billing.agency_remittance_batch.prepared", resource: "AgencyRemittanceBatch", resourceId: prepared.batch.id, metadata: { agencyProgramId: prepared.batch.agencyProgramId, totalCents, allocatedForReviewCents: allocatedCents, reused: prepared.reused, evidenceRecorded: true } });
    return NextResponse.json({ ok: true, ...prepared, requiresReview: true });
  }

  if (action === "approveRemittanceBatch") {
    const batchId = clean(body.batchId);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const batch = await tx.agencyRemittanceBatch.findUnique({ where: { id: batchId }, include: { allocations: { orderBy: { createdAt: "asc" } }, agencyProgram: true } });
        if (!batch || !centerAllowed(auth.user, batch.centerId)) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: batch.enteredById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must approve this batch.", 403);
        if (batch.status !== "pending_review" || batch.reviewedAt) throw new AgencyWorkflowError("This remittance batch is no longer awaiting initial review.", 409);
        const pendingAllocations = batch.allocations.filter((allocation) => allocation.status === "pending_review");
        const fingerprint = agencyBatchFingerprint({ centerId: batch.centerId, agencyProgramId: batch.agencyProgramId, externalReference: batch.externalReference, paidAt: batch.paidAt, paymentMethod: batch.paymentMethod, totalCents: batch.totalCents, notes: batch.notes, evidenceName: batch.evidenceName, evidenceReference: batch.evidenceReference, followUpDueAt: batch.followUpDueAt, allocations: pendingAllocations });
        if (fingerprint !== batch.reconciliationFingerprint) throw new AgencyWorkflowError("The batch no longer matches its reviewed fingerprint. Recreate the batch from current evidence.", 409);
        await assertAgencyPeriodOpen(tx, batch.centerId, batch.paidAt);
        let allocatedCents = 0;
        const posted = [];
        for (const allocation of pendingAllocations) {
          const current = await agencyPostingClaim(tx, allocation.claimId);
          if (!current || current.centerId !== batch.centerId || current.agencyProgramId !== batch.agencyProgramId) throw new AgencyWorkflowError("A claim allocation no longer belongs to this school and agency.", 409);
          const allocationResult = await postAgencyClaimAllocation(tx, { claim: current, batchId: batch.id, allocationId: allocation.id, amountCents: allocation.amountCents, paidAt: batch.paidAt, paymentMethod: batch.paymentMethod, reference: batch.externalReference, notes: allocation.notes, reviewerId: auth.user.id });
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
            effectiveAt: batch.paidAt,
            externalReference: batch.externalReference,
            externalId: `batch-unapplied:${batch.id}`,
            metadata: { paymentMethod: batch.paymentMethod, evidenceReference: batch.evidenceReference },
          });
          unappliedEntryId = unapplied.entry.id;
        }
        const updated = await tx.agencyRemittanceBatch.update({ where: { id: batch.id }, data: {
          allocatedCents,
          unappliedCents,
          status: agencyBatchStatus({ totalCents: batch.totalCents, allocatedCents }),
          reviewedById: auth.user.id,
          reviewedAt: new Date(),
          reviewNotes: clean(body.reviewNotes) || null,
          ...(unappliedCents === 0 ? { followUpOwnerId: null, followUpDueAt: null } : {}),
        } });
        return { batch: updated, postedCount: posted.length, unappliedEntryId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The remittance batch or one of its claims changed during review. Refresh before approving it." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.batch.centerId, action: "billing.agency_remittance_batch.approved", resource: "AgencyRemittanceBatch", resourceId: result.batch.id, metadata: { postedCount: result.postedCount, totalCents: result.batch.totalCents, allocatedCents: result.batch.allocatedCents, unappliedCents: result.batch.unappliedCents, unappliedEntryId: result.unappliedEntryId } });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "requestBatchAllocation") {
    const batchId = clean(body.batchId);
    const claimId = clean(body.claimId);
    const amountCents = cents(body.amountDollars);
    const notes = clean(body.notes) || null;
    const idempotencyKey = clean(body.idempotencyKey);
    if (!batchId || !claimId || amountCents <= 0 || !idempotencyKey) return NextResponse.json({ ok: false, error: "Choose a batch, approved claim, positive allocation amount, and retry-safe request key." }, { status: 400 });
    const fingerprint = agencyAllocationFingerprint({ batchId, claimId, amountCents, notes });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const existingByIdempotency = await tx.agencyRemittanceAllocation.findUnique({ where: { idempotencyKey }, include: { batch: true } });
        if (existingByIdempotency) {
          if (!centerAllowed(auth.user, existingByIdempotency.batch.centerId)) throw new AgencyWorkflowError("Batch allocation not found.", 404);
          if (existingByIdempotency.fingerprint !== fingerprint) throw new AgencyWorkflowError("This retry key was already used for a different batch allocation.", 409);
          return { batch: existingByIdempotency.batch, allocation: existingByIdempotency, reused: true };
        }
        const batch = await tx.agencyRemittanceBatch.findUnique({ where: { id: batchId } });
        if (!batch || !centerAllowed(auth.user, batch.centerId)) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        if (batch.reversedAt || !new Set(["unmatched", "partially_allocated", "exception"]).has(batch.status)) throw new AgencyWorkflowError("Only an unreversed batch with unapplied cash can receive another allocation.", 409);
        if (amountCents > batch.unappliedCents) throw new AgencyWorkflowError("The new allocation exceeds the batch's unapplied amount.", 409);
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
        return { batch: updated, allocation, reused: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The batch or claim changed while the allocation was prepared. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.batch.centerId, action: "billing.agency_remittance_allocation.prepared", resource: "AgencyRemittanceAllocation", resourceId: result.allocation.id, metadata: { batchId, claimId, amountCents, reused: result.reused } });
    return NextResponse.json({ ok: true, ...result, requiresReview: true });
  }

  if (action === "approveBatchAllocation") {
    const allocationId = clean(body.allocationId);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const allocation = await tx.agencyRemittanceAllocation.findUnique({ where: { id: allocationId }, include: { batch: true } });
        if (!allocation || !centerAllowed(auth.user, allocation.batch.centerId)) throw new AgencyWorkflowError("Batch allocation not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: allocation.requestedById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must approve this allocation.", 403);
        if (allocation.status !== "pending_review" || allocation.batch.reversedAt) throw new AgencyWorkflowError("This allocation is no longer awaiting review.", 409);
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
        });
        const posted = await postAgencyClaimAllocation(tx, { claim: current, batchId: allocation.batch.id, allocationId: allocation.id, amountCents: allocation.amountCents, paidAt: allocation.batch.paidAt, ledgerEffectiveAt: effectiveAt, paymentMethod: allocation.batch.paymentMethod, reference: allocation.batch.externalReference, notes: allocation.notes, reviewerId: auth.user.id });
        const allocatedCents = allocation.batch.allocatedCents + allocation.amountCents;
        const unappliedCents = allocation.batch.unappliedCents - allocation.amountCents;
        const batch = await tx.agencyRemittanceBatch.update({ where: { id: allocation.batch.id }, data: { allocatedCents, unappliedCents, status: agencyBatchStatus({ totalCents: allocation.batch.totalCents, allocatedCents }), ...(unappliedCents === 0 ? { followUpOwnerId: null, followUpDueAt: null } : {}) } });
        return { batch, allocationId: allocation.id, releaseEntryId: release.entry.id, remittanceId: posted.remittance.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The allocation, batch, or claim changed during review. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.batch.centerId, action: "billing.agency_remittance_allocation.approved", resource: "AgencyRemittanceAllocation", resourceId: result.allocationId, metadata: { batchId: result.batch.id, remittanceId: result.remittanceId, releaseEntryId: result.releaseEntryId } });
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
        if (!allocation || !centerAllowed(auth.user, allocation.batch.centerId)) throw new AgencyWorkflowError("Batch allocation not found.", 404);
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
        return { batch, allocationId: allocation.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The allocation or batch changed during rejection. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.batch.centerId, action: "billing.agency_remittance_allocation.rejected", resource: "AgencyRemittanceAllocation", resourceId: result.allocationId, metadata: { batchId: result.batch.id, reasonRecorded: true } });
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
    if (!ledgerAccountId || !AGENCY_ADJUSTMENT_TYPES.includes(type as (typeof AGENCY_ADJUSTMENT_TYPES)[number]) || !amountCents || !effectiveAt || !reason || !idempotencyKey) return NextResponse.json({ ok: false, error: "Choose an agency account and adjustment type, then enter a positive amount, effective date, specific reason, and retry-safe request key." }, { status: 400 });
    if (!evidenceName || !evidenceReference || !followUpDueAt) return NextResponse.json({ ok: false, error: "Name the adjustment evidence, enter its secure internal reference, and assign a follow-up due date." }, { status: 400 });
    let prepared;
    try {
      prepared = await prisma.$transaction(async (tx) => {
        const account = await tx.agencyLedgerAccount.findUnique({ where: { id: ledgerAccountId } });
        if (!account || !centerAllowed(auth.user, account.centerId)) throw new AgencyWorkflowError("Agency ledger account not found.", 404);
        const fingerprint = agencyAdjustmentFingerprint({ ledgerAccountId: account.id, claimId, batchId, type, amountCents, effectiveAt, reason, evidenceName, evidenceReference, followUpDueAt });
        const existingByIdempotency = await tx.agencyLedgerAdjustment.findUnique({ where: { idempotencyKey } });
        if (existingByIdempotency) {
          if (existingByIdempotency.fingerprint !== fingerprint) throw new AgencyWorkflowError("This retry key was already used for a different agency adjustment.", 409);
          return { adjustment: existingByIdempotency, reused: true };
        }
        await assertAgencyPeriodOpen(tx, account.centerId, effectiveAt);
        if (claimId) {
          const claim = await tx.subsidyClaim.findFirst({ where: { id: claimId, centerId: account.centerId, agencyProgramId: account.agencyProgramId } });
          if (!claim) throw new AgencyWorkflowError("The linked claim must belong to this school and agency account.", 409);
        }
        if (batchId) {
          const batch = await tx.agencyRemittanceBatch.findFirst({ where: { id: batchId, centerId: account.centerId, agencyProgramId: account.agencyProgramId } });
          if (!batch) throw new AgencyWorkflowError("The linked remittance batch must belong to this school and agency account.", 409);
        }
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
          fingerprint,
          idempotencyKey,
          requestedById: auth.user.id,
          followUpOwnerId: auth.user.id,
          followUpDueAt,
        } });
        return { adjustment, reused: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The agency account changed while the adjustment was prepared. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: prepared.adjustment.centerId, action: "billing.agency_ledger_adjustment.requested", resource: "AgencyLedgerAdjustment", resourceId: prepared.adjustment.id, metadata: { type, amountCents, claimId: prepared.adjustment.claimId, batchId: prepared.adjustment.batchId, evidenceRecorded: true, reused: prepared.reused } });
    return NextResponse.json({ ok: true, ...prepared, requiresReview: true });
  }

  if (action === "approveLedgerAdjustment" || action === "rejectLedgerAdjustment") {
    const adjustmentId = clean(body.adjustmentId);
    const reviewNotes = clean(body.reviewNotes);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const adjustment = await tx.agencyLedgerAdjustment.findUnique({ where: { id: adjustmentId }, include: { agencyProgram: true } });
        if (!adjustment || !centerAllowed(auth.user, adjustment.centerId)) throw new AgencyWorkflowError("Agency adjustment not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: adjustment.requestedById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must review this adjustment.", 403);
        if (adjustment.status !== "pending_review") throw new AgencyWorkflowError("This adjustment is no longer awaiting review.", 409);
        const fingerprint = agencyAdjustmentFingerprint({ ledgerAccountId: adjustment.ledgerAccountId, claimId: adjustment.claimId, batchId: adjustment.batchId, type: adjustment.type, amountCents: adjustment.amountCents, effectiveAt: adjustment.effectiveAt, reason: adjustment.reason, evidenceName: adjustment.evidenceName, evidenceReference: adjustment.evidenceReference, followUpDueAt: adjustment.followUpDueAt });
        if (fingerprint !== adjustment.fingerprint) throw new AgencyWorkflowError("The adjustment no longer matches its reviewed fingerprint. Recreate it from current evidence.", 409);
        if (action === "rejectLedgerAdjustment") {
          const rejected = await tx.agencyLedgerAdjustment.update({ where: { id: adjustment.id }, data: { status: "rejected", reviewedById: auth.user.id, reviewedAt: new Date(), reviewNotes: reviewNotes || "Rejected by accounting reviewer." } });
          return { adjustment: rejected, ledgerEntryId: null as string | null };
        }
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
        });
        const posted = await tx.agencyLedgerAdjustment.update({ where: { id: adjustment.id }, data: { status: "posted", reviewedById: auth.user.id, reviewedAt: new Date(), reviewNotes: reviewNotes || null } });
        return { adjustment: posted, ledgerEntryId: ledger.entry.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The adjustment or agency account changed during review. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.adjustment.centerId, action: action === "approveLedgerAdjustment" ? "billing.agency_ledger_adjustment.approved" : "billing.agency_ledger_adjustment.rejected", resource: "AgencyLedgerAdjustment", resourceId: result.adjustment.id, metadata: { type: result.adjustment.type, amountCents: result.adjustment.amountCents, ledgerEntryId: result.ledgerEntryId } });
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
        if (!adjustment || !centerAllowed(auth.user, adjustment.centerId)) throw new AgencyWorkflowError("Agency adjustment not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: adjustment.requestedById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reverse this adjustment.", 403);
        if (adjustment.status !== "posted" || adjustment.reversedAt) throw new AgencyWorkflowError("Only an unreversed posted adjustment can be reversed.", 409);
        const effectiveAt = new Date();
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
        });
        const reversed = await tx.agencyLedgerAdjustment.update({ where: { id: adjustment.id }, data: { status: "reversed", reversedAt: effectiveAt, reversedById: auth.user.id, reversalReason: reason } });
        return { adjustment: reversed, ledgerEntryId: ledger.entry.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The adjustment changed while it was being reversed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.adjustment.centerId, action: "billing.agency_ledger_adjustment.reversed", resource: "AgencyLedgerAdjustment", resourceId: result.adjustment.id, metadata: { ledgerEntryId: result.ledgerEntryId, reasonRecorded: true } });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "closeAccountingPeriod") {
    if (!centerAllowed(auth.user, centerId)) return NextResponse.json({ ok: false, error: "School access denied." }, { status: 403 });
    if (!canCloseAgencyAccountingPeriod(auth.user.role)) return NextResponse.json({ ok: false, error: "Only a billing administrator or higher accounting role can close an agency accounting period." }, { status: 403 });
    const startDate = dateValue(body.startDate);
    const endDate = dateValue(body.endDate);
    const name = clean(body.name);
    const reason = clean(body.reason);
    if (!startDate || !endDate || endDate < startDate || !name || !reason) return NextResponse.json({ ok: false, error: "Period name, valid start/end dates, and a close reason are required." }, { status: 400 });
    const { startInclusive, endExclusive } = agencyUtcCalendarRange(startDate, endDate);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const overlap = await tx.agencyAccountingPeriod.findFirst({ where: { centerId, OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }] } });
        if (overlap && (overlap.startDate.getTime() !== startDate.getTime() || overlap.endDate.getTime() !== endDate.getTime())) throw new AgencyWorkflowError(`This range overlaps ${overlap.name}.`, 409);
        if (overlap?.status === "closed") return { period: overlap, reused: true };
        const [unresolvedBatches, pendingAllocations, pendingAdjustments, reconciliationVariances] = await Promise.all([
          tx.agencyRemittanceBatch.count({
            where: {
              centerId,
              OR: [
                { status: { in: ["unmatched", "partially_allocated", "exception"] } },
                { status: "pending_review", reviewedAt: null },
              ],
              paidAt: { gte: startInclusive, lt: endExclusive },
            },
          }),
          tx.agencyRemittanceAllocation.count({
            where: {
              status: "pending_review",
              createdAt: { gte: startInclusive, lt: endExclusive },
              batch: { centerId, reviewedAt: { not: null } },
            },
          }),
          tx.agencyLedgerAdjustment.count({
            where: {
              centerId,
              status: "pending_review",
              effectiveAt: { gte: startInclusive, lt: endExclusive },
            },
          }),
          agencyReconciliationVarianceCount(tx, centerId, endExclusive),
        ]);
        if (unresolvedBatches || pendingAllocations || pendingAdjustments || reconciliationVariances) throw new AgencyWorkflowError(`Resolve ${unresolvedBatches} remittance batch exception(s), ${pendingAllocations} pending additional allocation(s), ${pendingAdjustments} pending adjustment(s), and ${reconciliationVariances} reconciliation variance(s) before closing this period.`, 409);
        const period = overlap
          ? await tx.agencyAccountingPeriod.update({ where: { id: overlap.id }, data: { name, status: "closed", closedAt: new Date(), closedById: auth.user.id, closeReason: reason } })
          : await tx.agencyAccountingPeriod.create({ data: { centerId, name, startDate, endDate, status: "closed", closedAt: new Date(), closedById: auth.user.id, closeReason: reason } });
        return { period, reused: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The accounting period changed while it was being closed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId, action: result.reused ? "billing.agency_accounting_period.close_replayed" : "billing.agency_accounting_period.closed", resource: "AgencyAccountingPeriod", resourceId: result.period.id, metadata: { name, startDate, endDate, reasonRecorded: true, reused: result.reused } });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "reopenAccountingPeriod") {
    const periodId = clean(body.periodId);
    const reason = clean(body.reason);
    if (!canCloseAgencyAccountingPeriod(auth.user.role)) return NextResponse.json({ ok: false, error: "Only a billing administrator or higher accounting role can reopen an agency accounting period." }, { status: 403 });
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a specific reason for reopening the period." }, { status: 400 });
    const existing = await prisma.agencyAccountingPeriod.findUnique({ where: { id: periodId } });
    if (!existing || !centerAllowed(auth.user, existing.centerId)) return NextResponse.json({ ok: false, error: "Accounting period not found." }, { status: 404 });
    if (existing.status !== "closed") return NextResponse.json({ ok: false, error: "This accounting period is not closed." }, { status: 409 });
    const period = await prisma.agencyAccountingPeriod.update({ where: { id: existing.id }, data: { status: "open", reopenedAt: new Date(), reopenedById: auth.user.id, reopenReason: reason } });
    await writeAuditLog(auth.user, { centerId: existing.centerId, action: "billing.agency_accounting_period.reopened", resource: "AgencyAccountingPeriod", resourceId: period.id, metadata: { reasonRecorded: true } });
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
        if (!batch || !centerAllowed(auth.user, batch.centerId)) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: batch.enteredById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reject this batch.", 403);
        if (batch.status !== "pending_review" || batch.reviewedAt) throw new AgencyWorkflowError("Only an unposted batch awaiting initial review can be rejected.", 409);
        await tx.agencyRemittanceAllocation.updateMany({ where: { batchId: batch.id, status: "pending_review" }, data: { status: "rejected", reviewedById: auth.user.id, reviewedAt: new Date() } });
        const updated = await tx.agencyRemittanceBatch.update({ where: { id: batch.id }, data: { status: "rejected", reviewedById: auth.user.id, reviewedAt: new Date(), reviewNotes: reason } });
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The batch changed while it was being rejected. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.centerId, action: "billing.agency_remittance_batch.rejected", resource: "AgencyRemittanceBatch", resourceId: result.id, metadata: { reasonRecorded: true } });
    return NextResponse.json({ ok: true, batch: result });
  }

  if (action === "reverseRemittanceBatch") {
    const batchId = clean(body.batchId);
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a specific reason for reversing this deposit batch." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const batch = await tx.agencyRemittanceBatch.findUnique({ where: { id: batchId }, include: { allocations: true, agencyProgram: true } });
        if (!batch || !centerAllowed(auth.user, batch.centerId)) throw new AgencyWorkflowError("Remittance batch not found.", 404);
        if (!canReviewAgencyPosting({ role: auth.user.role, reviewerId: auth.user.id, requestedById: batch.enteredById })) throw new AgencyWorkflowError("A different billing administrator or accounting reviewer must reverse this batch.", 403);
        if (batch.reversedAt || batch.status === "reversed") throw new AgencyWorkflowError("This remittance batch was already reversed.", 409);
        if (batch.status === "pending_review" && !batch.reviewedAt) throw new AgencyWorkflowError("Reject an unposted batch instead of creating financial reversal entries.", 409);
        const reversedAt = new Date();
        await assertAgencyPeriodOpen(tx, batch.centerId, reversedAt);
        const postedAllocations = batch.allocations.filter((allocation) => allocation.status === "posted" && allocation.remittanceId);
        const reversedRemittances = [];
        for (const allocation of postedAllocations) {
          reversedRemittances.push(await reverseAgencyRemittanceRecord(tx, { remittanceId: allocation.remittanceId as string, reviewerId: auth.user.id, reason, reversedAt }));
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
          });
          unappliedReversalEntryId = reversal.entry.id;
        }
        await tx.agencyRemittanceAllocation.updateMany({ where: { batchId: batch.id, status: "pending_review" }, data: { status: "rejected", reviewedById: auth.user.id, reviewedAt: reversedAt } });
        const updated = await tx.agencyRemittanceBatch.update({ where: { id: batch.id }, data: { status: "reversed", reversedAt, reversedById: auth.user.id, reversalReason: reason } });
        return { batch: updated, reversedRemittanceCount: reversedRemittances.length, unappliedReversalEntryId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The batch changed while it was being reversed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: result.batch.centerId, action: "billing.agency_remittance_batch.reversed", resource: "AgencyRemittanceBatch", resourceId: result.batch.id, metadata: { reversedRemittanceCount: result.reversedRemittanceCount, unappliedReversalEntryId: result.unappliedReversalEntryId, reasonRecorded: true } });
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
        const authorization = await tx.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) }, include: { agencyProgram: true, child: { select: { fullName: true, enrollmentStatus: true, classroomId: true } } } });
        if (!authorization || !centerAllowed(auth.user, authorization.centerId)) throw new AgencyWorkflowError("Authorization not found.", 404);
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
        return tx.subsidyClaim.create({ data: {
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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "Another claim was created for this authorization at the same time. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.created", resource: "SubsidyClaim", resourceId: claim.id, metadata: { authorizationId: claim.authorizationId, claimedCents: claim.claimedCents, servicePeriodStart: start, servicePeriodEnd: end } });
    return NextResponse.json({ ok: true, claim });
  }

  const claim = await prisma.subsidyClaim.findUnique({ where: { id: clean(body.claimId) }, include: { agencyProgram: true, authorization: true, documents: true } });
  if (!claim || !centerAllowed(auth.user, claim.centerId)) return NextResponse.json({ ok: false, error: "Claim not found." }, { status: 404 });

  if (action === "syncRequirements") {
    let missing: ReturnType<typeof claimRequirements> = [];
    try {
      missing = await prisma.$transaction(async (tx) => {
        const transition = await tx.subsidyClaim.updateMany({
          where: { id: claim.id, status: { in: ["draft", "ready", "submitted"] } },
          data: { updatedAt: new Date() },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("Requirements cannot be changed after the agency decision is recorded.", 409);
        const current = await tx.subsidyClaim.findUniqueOrThrow({
          where: { id: claim.id },
          include: { agencyProgram: true, authorization: true, documents: true },
        });
        const requirements = claimRequirements(current);
        const existing = new Set(current.documents.map((document) => `${document.name.trim().toLowerCase()}|${document.type.trim().toLowerCase()}`));
        const missingRequirements = requirements.filter((requirement) => !existing.has(`${requirement.label.trim().toLowerCase()}|${requirement.type.trim().toLowerCase()}`));
        if (missingRequirements.length) await tx.subsidyClaimDocument.createMany({ data: missingRequirements.map((requirement) => ({ claimId: current.id, name: requirement.label, type: requirement.type })) });
        return missingRequirements;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim changed while requirements were synchronized. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.requirements_synced", resource: "SubsidyClaim", resourceId: claim.id, metadata: { addedCount: missing.length, requirementLabels: missing.map((item) => item.label) } });
    return NextResponse.json({ ok: true, addedCount: missing.length });
  }

  if (action === "updateDocument") {
    const status = clean(body.status);
    if (!new Set(["required", "requested", "received", "verified", "not_applicable"]).has(status)) return NextResponse.json({ ok: false, error: "Invalid document status." }, { status: 400 });
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const transition = await tx.subsidyClaim.updateMany({
          where: { id: claim.id, status: { in: ["draft", "ready", "submitted"] } },
          data: { updatedAt: new Date() },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("Documents cannot be changed after the agency decision is recorded.", 409);
        const document = await tx.subsidyClaimDocument.findFirst({ where: { id: clean(body.documentId), claimId: claim.id } });
        if (!document) throw new AgencyWorkflowError("Claim document not found.", 404);
        const linkedDocumentId = clean(body.linkedDocumentId) || document.documentId;
        const notes = clean(body.notes) || document.notes;
        if (status === "verified" && !linkedDocumentId && !notes) throw new AgencyWorkflowError("Add an evidence note or linked document before marking this item verified.");
        return tx.subsidyClaimDocument.update({ where: { id: document.id }, data: { status, documentId: linkedDocumentId, notes } });
      });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim_document.updated", resource: "SubsidyClaimDocument", resourceId: updated.id, metadata: { claimId: claim.id, status } });
    return NextResponse.json({ ok: true, document: updated });
  }

  if (action === "submitClaim") {
    const externalReference = clean(body.externalReference);
    if (!externalReference) return NextResponse.json({ ok: false, error: "Enter the confirmation reference returned by the external agency channel." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const transition = await tx.subsidyClaim.updateMany({ where: { id: claim.id, status: { in: ["draft", "ready"] } }, data: { updatedAt: new Date() } });
        if (transition.count !== 1) throw new AgencyWorkflowError("Only a current draft or ready claim can be submitted.", 409);
        const current = await tx.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id }, include: { agencyProgram: true, authorization: true, documents: true } });
        const blockers = claimSubmissionBlockers({ ...current.agencyProgram, documents: current.documents, requirements: claimRequirements(current) });
        if (blockers.length) throw new AgencyWorkflowError(`Claim is not ready for submission. ${blockers.join(" ")}`, 409);
        const submitted = await tx.subsidyClaim.update({ where: { id: current.id }, data: { status: "submitted", submittedAt: new Date(), externalReference } });
        return { submitted, submissionMethod: current.agencyProgram.submissionMethod };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim or its requirements changed before submission was recorded. Refresh and try again." }, { status: 409 });
      throw error;
    }
    const { submitted, submissionMethod } = result;
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.marked_submitted", resource: "SubsidyClaim", resourceId: claim.id, metadata: { submissionMethod, externalReference: submitted.externalReference } });
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
        const transition = await tx.subsidyClaim.updateMany({ where: { id: claim.id, status: "submitted" }, data: { updatedAt: new Date() } });
        if (transition.count !== 1) throw new AgencyWorkflowError("The claim changed before the agency decision was recorded. Refresh before trying again.", 409);
        const current = await tx.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id }, include: { agencyProgram: true, authorization: true, documents: true } });
        if (decision === "approved") {
          const blockers = claimSubmissionBlockers({ ...current.agencyProgram, documents: current.documents, requirements: claimRequirements(current) });
          if (blockers.length) throw new AgencyWorkflowError("Complete every required claim document before recording agency approval.", 409);
        }
        const approvedAt = decision === "approved" ? new Date() : null;
        if (approvedAt) await assertAgencyPeriodOpen(tx, current.centerId, approvedAt);
        const updated = await tx.subsidyClaim.update({ where: { id: current.id }, data: { status: decision, approvedCents, approvedAt, denialReason: decision === "denied" ? denialReason : null, externalReference } });
        const ledger = decision === "approved" ? await ensureAgencyClaimReceivable(tx, { ...updated, agencyProgram: current.agencyProgram }) : null;
        return { updated, ledgerEntryId: ledger?.entry.id ?? null };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim or agency ledger changed before the decision was recorded. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: `billing.subsidy_claim.${decision}`, resource: "SubsidyClaim", resourceId: claim.id, metadata: { approvedCents, externalReference: result.updated.externalReference, agencyLedgerEntryId: result.ledgerEntryId } });
    return NextResponse.json({ ok: true, claim: result.updated, agencyLedgerEntryId: result.ledgerEntryId });
  }

  if (action === "voidClaim") {
    if (!["draft", "ready"].includes(claim.status)) return NextResponse.json({ ok: false, error: "Only an unsubmitted draft claim can be voided here. Submitted decisions and payments must retain their history." }, { status: 409 });
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a reason for voiding the draft claim." }, { status: 400 });
    const transition = await prisma.subsidyClaim.updateMany({ where: { id: claim.id, status: { in: ["draft", "ready"] } }, data: { status: "void", customFields: { ...recordValue(claim.customFields), voidReason: reason, voidedAt: new Date().toISOString(), voidedById: auth.user.id } } });
    if (transition.count !== 1) return NextResponse.json({ ok: false, error: "The claim changed before it could be voided. Refresh before trying again." }, { status: 409 });
    const updated = await prisma.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id } });
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.voided", resource: "SubsidyClaim", resourceId: claim.id, metadata: { reasonRecorded: true } });
    return NextResponse.json({ ok: true, claim: updated });
  }

  if (action === "recordRemittance") {
    const amountCents = cents(body.amountDollars);
    const reference = clean(body.externalReference);
    const paidAt = dateValue(body.paidAt);
    const paymentMethod = clean(body.paymentMethod) || "ach";
    if (!reference || !paidAt || amountCents <= 0) return NextResponse.json({ ok: false, error: "A unique reference, paid date, and positive remittance amount are required." }, { status: 400 });
    if (!REMITTANCE_METHODS.has(paymentMethod)) return NextResponse.json({ ok: false, error: "Choose ACH, check, agency portal, or other as the remittance method." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const current = await tx.subsidyClaim.findUnique({
          where: { id: claim.id },
          include: { agencyProgram: true, authorization: { include: { family: { include: { billingAccount: true } } } }, remittances: true },
        });
        if (!current || !new Set(["approved", "partially_paid"]).has(current.status)) throw new AgencyWorkflowError("Record an agency approval before posting a remittance.", 409);
        const payable = current.approvedCents ?? current.claimedCents;
        const paidBeforeCents = activeRemittanceTotalCents(current.remittances);
        if (paidBeforeCents + amountCents > payable) throw new AgencyWorkflowError("The remittance amount cannot exceed the remaining approved claim.");
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
        let legacyFamilyLedgerAppliedCents = 0;
        let legacyFamilyLedgerEntryId: string | null = null;
        const billingAccount = current.authorization?.family.billingAccount;
        if (billingAccount) {
          const authorizationNumber = current.authorization?.authorizationNumber ?? "";
          const agencyEntries = await tx.ledgerEntry.findMany({
            where: { billingAccountId: billingAccount.id, sourceSystem: "subsidy_agency" },
            orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          });
          const matchingOutstandingCents = agencyEntries.reduce((total, entry) => {
            const metadata = recordValue(entry.metadata);
            const entryAuthorizationNumber = clean(metadata.authorizationNumber);
            const entryAgencyName = clean(metadata.agencyName).toLowerCase();
            const agencyName = current.agencyProgram.name.trim().toLowerCase();
            const matches = entryAuthorizationNumber && entryAgencyName
              ? entryAuthorizationNumber === authorizationNumber && entryAgencyName === agencyName
              : entryAuthorizationNumber
                ? entryAuthorizationNumber === authorizationNumber
                : entryAgencyName === agencyName;
            return matches ? total + entry.amountCents : total;
          }, 0);
          legacyFamilyLedgerAppliedCents = Math.min(amountCents, Math.max(0, matchingOutstandingCents));
          if (legacyFamilyLedgerAppliedCents > 0) {
            const updatedAccount = await tx.billingAccount.update({ where: { id: billingAccount.id }, data: { balanceCents: { decrement: legacyFamilyLedgerAppliedCents } } });
            const ledgerEntry = await tx.ledgerEntry.create({ data: {
              billingAccountId: billingAccount.id,
              type: "agency_payment",
              description: `Legacy family-ledger settlement for ${current.agencyProgram.name} remittance ${current.number}`,
              amountCents: -legacyFamilyLedgerAppliedCents,
              balanceAfterCents: updatedAccount.balanceCents,
              effectiveAt: paidAt,
              sourceSystem: "subsidy_agency",
              externalId: `agency-remittance:${remittance.id}`,
              metadata: { claimId: current.id, claimNumber: current.number, remittanceId: remittance.id, agencyName: current.agencyProgram.name, authorizationNumber, externalReference: reference, legacyCompatibilityMirror: true },
            } });
            legacyFamilyLedgerEntryId = ledgerEntry.id;
          }
        }
        const paidCents = paidBeforeCents + amountCents;
        const updated = await tx.subsidyClaim.update({ where: { id: current.id }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: current.claimedCents, approvedCents: current.approvedCents, paidCents }) } });
        return {
          remittance,
          claim: updated,
          agencyLedgerEntryId: agencyLedger.entry.id,
          agencyLedgerBalanceCents: agencyLedger.account.balanceCents,
          legacyFamilyLedgerAppliedCents,
          legacyFamilyLedgerEntryId,
          ledgerAppliedCents: legacyFamilyLedgerAppliedCents,
          ledgerEntryId: legacyFamilyLedgerEntryId,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "That remittance reference is already recorded or the claim changed. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_remittance.recorded", resource: "SubsidyRemittance", resourceId: result.remittance.id, metadata: { claimId: claim.id, amountCents, externalReference: reference, agencyLedgerEntryId: result.agencyLedgerEntryId, agencyLedgerBalanceCents: result.agencyLedgerBalanceCents, legacyFamilyLedgerAppliedCents: result.legacyFamilyLedgerAppliedCents, legacyFamilyLedgerEntryId: result.legacyFamilyLedgerEntryId } });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "reverseRemittance") {
    const remittanceId = clean(body.remittanceId);
    const reason = clean(body.reason);
    if (!remittanceId || !reason) return NextResponse.json({ ok: false, error: "Choose a remittance and enter a correction reason." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction((tx) => reverseAgencyRemittanceRecord(tx, {
        remittanceId,
        reviewerId: auth.user.id,
        reviewerRole: auth.user.role,
        expectedClaimId: claim.id,
        requireUnbatched: true,
        reason,
        reversedAt: new Date(),
      }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The remittance changed while it was being reversed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_remittance.reversed", resource: "SubsidyRemittance", resourceId: result.remittanceId, metadata: { claimId: claim.id, reason, agencyLedgerEntryId: result.agencyLedgerEntryId, agencyLedgerBalanceCents: result.agencyLedgerBalanceCents, legacyFamilyReversalLedgerEntryId: result.legacyFamilyReversalLedgerEntryId } });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ ok: false, error: "Unsupported agency billing action." }, { status: 400 });
}

export const GET = withApiLogging("api.billing.agency-claims.get", getHandler);
export const POST = withApiLogging("api.billing.agency-claims.post", postHandler);
