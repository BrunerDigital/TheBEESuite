import { createHash } from "node:crypto";

export type BillingAuditLedgerEntry = {
  id: string;
  type: string;
  description: string;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: Date | string;
  createdAt: Date | string;
  sourceSystem: string | null;
  externalId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  metadata: unknown;
};

export type BillingAuditInvoice = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  dueDate: Date | string;
  createdAt: Date | string;
  descriptions: string[];
  sourceSystem?: string | null;
  externalId?: string | null;
  customFields?: unknown;
};

export type BillingAuditPayment = {
  id: string;
  status: string;
  amountCents: number;
  paidAt: Date | string | null;
  provider: string;
};

export type BillingBalanceAuditInput = {
  centerId: string;
  familyId: string;
  billingAccountId: string;
  balanceCents: number;
  asOf: Date | string;
  ledgerEntries: BillingAuditLedgerEntry[];
  invoices: BillingAuditInvoice[];
  payments: BillingAuditPayment[];
};

export type BillingAuditFlag = {
  code: "ledger_balance_mismatch" | "opening_balance_recreated_as_invoice" | "future_source_as_of";
  message: string;
  ledgerEntryId?: string;
  invoiceId?: string;
};

export type BillingBalanceAudit = {
  scope: Pick<BillingBalanceAuditInput, "centerId" | "familyId" | "billingAccountId">;
  balanceCents: number;
  orderedLedgerTotalCents: number;
  latestLedgerBalanceCents: number | null;
  openInvoiceTotalCents: number;
  succeededPaymentTotalCents: number;
  creditAndReversalTotalCents: number;
  originalProcareEntries: BillingAuditLedgerEntry[];
  duplicateOpeningBalanceCandidates: Array<{ ledgerEntryId: string; invoiceId: string; amountCents: number }>;
  flags: BillingAuditFlag[];
  sourceFingerprint: string;
  orderedLedgerEntries: BillingAuditLedgerEntry[];
  invoices: BillingAuditInvoice[];
  payments: BillingAuditPayment[];
};

export const LONGMONT_OPENING_BALANCE_REVERSAL_SOURCE = "bee_suite_guarded_remediation";
export const LONGMONT_OPENING_BALANCE_REVERSAL_TYPE = "procare_opening_balance_reversal";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function timestamp(value: Date | string | null | undefined) {
  if (!value) return Number.NaN;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

function iso(value: Date | string | null | undefined) {
  const valueTimestamp = timestamp(value);
  return Number.isFinite(valueTimestamp) ? new Date(valueTimestamp).toISOString() : null;
}

function stableFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isCreditOrReversal(entry: BillingAuditLedgerEntry) {
  const normalized = entry.type.trim().toLowerCase();
  return entry.amountCents < 0 && (
    normalized.includes("credit")
    || normalized.includes("reversal")
    || normalized.includes("refund")
    || normalized.includes("adjustment")
    || normalized === "agency_payment"
  );
}

function sourceAsOf(entry: BillingAuditLedgerEntry) {
  const metadata = record(entry.metadata);
  return typeof metadata.sourceAsOf === "string" ? metadata.sourceAsOf.trim() : "";
}

function appliedAt(entry: BillingAuditLedgerEntry) {
  const metadata = record(entry.metadata);
  const reconciledAt = typeof metadata.reconciledAt === "string" ? metadata.reconciledAt : null;
  const metadataAppliedAt = typeof metadata.appliedAt === "string" ? metadata.appliedAt : null;
  return reconciledAt || metadataAppliedAt || entry.effectiveAt || entry.createdAt;
}

export function openingBalanceReversalExternalId(originalLedgerEntryId: string) {
  return `longmont-opening-balance-reversal:${originalLedgerEntryId}`;
}

export function buildBillingBalanceAudit(input: BillingBalanceAuditInput): BillingBalanceAudit {
  const orderedLedgerEntries = [...input.ledgerEntries].sort((left, right) => (
    timestamp(left.effectiveAt) - timestamp(right.effectiveAt)
    || timestamp(left.createdAt) - timestamp(right.createdAt)
    || left.id.localeCompare(right.id)
  ));
  const invoices = [...input.invoices].sort((left, right) => (
    timestamp(left.createdAt) - timestamp(right.createdAt) || left.id.localeCompare(right.id)
  ));
  const payments = [...input.payments].sort((left, right) => (
    timestamp(left.paidAt) - timestamp(right.paidAt) || left.id.localeCompare(right.id)
  ));
  const originalProcareEntries = orderedLedgerEntries.filter((entry) => entry.type === "procare_balance_reconciliation");
  const orderedLedgerTotalCents = orderedLedgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const latestLedgerBalanceCents = [...orderedLedgerEntries]
    .reverse()
    .find((entry) => entry.balanceAfterCents !== null)?.balanceAfterCents ?? null;
  const openInvoices = invoices.filter((invoice) => invoice.status === "OPEN");
  const openInvoiceTotalCents = openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const succeededPaymentTotalCents = payments
    .filter((payment) => payment.status === "PAID")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const creditAndReversalTotalCents = orderedLedgerEntries
    .filter(isCreditOrReversal)
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const flags: BillingAuditFlag[] = [];

  if (latestLedgerBalanceCents !== null && latestLedgerBalanceCents !== input.balanceCents) {
    flags.push({
      code: "ledger_balance_mismatch",
      message: `Billing account balance ${input.balanceCents} does not match latest ordered ledger balance ${latestLedgerBalanceCents}.`,
    });
  }

  const duplicateOpeningBalanceCandidates: BillingBalanceAudit["duplicateOpeningBalanceCandidates"] = [];
  for (const entry of originalProcareEntries) {
    const entryAppliedAt = timestamp(appliedAt(entry));
    for (const invoice of openInvoices) {
      const invoiceText = [invoice.number, ...invoice.descriptions].join(" ").toLowerCase();
      const invoiceFields = record(invoice.customFields);
      const chargeSource = typeof invoiceFields.chargeSource === "string" ? invoiceFields.chargeSource.trim().toLowerCase() : "";
      const sourceId = typeof invoiceFields.sourceId === "string" ? invoiceFields.sourceId.trim().toLowerCase() : "";
      const createdAfterReconciliation = timestamp(invoice.createdAt) >= entryAppliedAt;
      const isTuitionPlanInvoice = chargeSource === "tuitionplan";
      const describesOpeningBalance = /past\s*due|opening\s*balance|balance\s*(reconciliation|forward)/.test(invoiceText)
        || /past[-_\s]*due|opening[-_\s]*balance/.test(sourceId);
      if (
        entry.amountCents > 0
        && invoice.totalCents === entry.amountCents
        && createdAfterReconciliation
        && !isTuitionPlanInvoice
        && describesOpeningBalance
      ) {
        duplicateOpeningBalanceCandidates.push({
          ledgerEntryId: entry.id,
          invoiceId: invoice.id,
          amountCents: entry.amountCents,
        });
        flags.push({
          code: "opening_balance_recreated_as_invoice",
          ledgerEntryId: entry.id,
          invoiceId: invoice.id,
          message: `Imported opening balance ${entry.amountCents} may have been recreated as later open invoice ${invoice.id}.`,
        });
      }
    }

    const sourceDate = sourceAsOf(entry);
    const sourceDateTimestamp = timestamp(sourceDate ? `${sourceDate.slice(0, 10)}T00:00:00.000Z` : null);
    const appliedTimestamp = timestamp(appliedAt(entry));
    if (Number.isFinite(sourceDateTimestamp) && Number.isFinite(appliedTimestamp) && sourceDateTimestamp > appliedTimestamp) {
      flags.push({
        code: "future_source_as_of",
        ledgerEntryId: entry.id,
        message: `Reconciliation sourceAsOf ${sourceDate} is later than applied/reconciled time ${iso(appliedAt(entry))}.`,
      });
    }
  }

  const fingerprintPayload = {
    centerId: input.centerId,
    familyId: input.familyId,
    billingAccountId: input.billingAccountId,
    balanceCents: input.balanceCents,
    ledgerEntries: orderedLedgerEntries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amountCents: entry.amountCents,
      balanceAfterCents: entry.balanceAfterCents,
      effectiveAt: iso(entry.effectiveAt),
      createdAt: iso(entry.createdAt),
      sourceSystem: entry.sourceSystem,
      externalId: entry.externalId,
      invoiceId: entry.invoiceId,
      paymentId: entry.paymentId,
      metadata: entry.metadata,
    })),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      totalCents: invoice.totalCents,
      dueDate: iso(invoice.dueDate),
      createdAt: iso(invoice.createdAt),
      descriptions: invoice.descriptions,
      sourceSystem: invoice.sourceSystem ?? null,
      externalId: invoice.externalId ?? null,
      customFields: invoice.customFields ?? null,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      status: payment.status,
      amountCents: payment.amountCents,
      paidAt: iso(payment.paidAt),
      provider: payment.provider,
    })),
  };

  return {
    scope: { centerId: input.centerId, familyId: input.familyId, billingAccountId: input.billingAccountId },
    balanceCents: input.balanceCents,
    orderedLedgerTotalCents,
    latestLedgerBalanceCents,
    openInvoiceTotalCents,
    succeededPaymentTotalCents,
    creditAndReversalTotalCents,
    originalProcareEntries,
    duplicateOpeningBalanceCandidates,
    flags,
    sourceFingerprint: stableFingerprint(fingerprintPayload),
    orderedLedgerEntries,
    invoices,
    payments,
  };
}

export type OpeningBalanceReversalPreconditions = {
  centerId: string;
  familyId: string;
  billingAccountId: string;
  originalLedgerEntryId: string;
  expectedCurrentBalanceCents: number;
  expectedOpenInvoiceTotalCents: number;
  expectedSourceFingerprint: string;
};

export type OpeningBalanceReversalPlan = {
  status: "ready" | "blocked" | "already_applied";
  errors: string[];
  planFingerprint: string;
  sourceFingerprint: string;
  idempotencyExternalId: string;
  originalLedgerEntryId: string;
  reversalAmountCents: number;
  expectedBalanceAfterCents: number;
  preservedInvoiceIds: string[];
  preservedPaymentIds: string[];
};

export function buildOpeningBalanceReversalPlan(
  audit: BillingBalanceAudit,
  preconditions: OpeningBalanceReversalPreconditions,
): OpeningBalanceReversalPlan {
  const idempotencyExternalId = openingBalanceReversalExternalId(preconditions.originalLedgerEntryId);
  const original = audit.originalProcareEntries.find((entry) => entry.id === preconditions.originalLedgerEntryId);
  const existingReversal = audit.orderedLedgerEntries.find((entry) => (
    entry.sourceSystem === LONGMONT_OPENING_BALANCE_REVERSAL_SOURCE
    && entry.externalId === idempotencyExternalId
  ));
  const reversalAmountCents = original ? -original.amountCents : 0;
  const expectedBalanceAfterCents = preconditions.expectedCurrentBalanceCents + reversalAmountCents;
  const planFingerprint = stableFingerprint({
    ...preconditions,
    idempotencyExternalId,
    reversalAmountCents,
    expectedBalanceAfterCents,
  });

  const scopeErrors: string[] = [];
  if (audit.scope.centerId !== preconditions.centerId) scopeErrors.push("Center precondition does not match the audited account.");
  if (audit.scope.familyId !== preconditions.familyId) scopeErrors.push("Family precondition does not match the audited account.");
  if (audit.scope.billingAccountId !== preconditions.billingAccountId) scopeErrors.push("Billing-account precondition does not match the audited account.");
  if (!original) scopeErrors.push("The exact original ProCare reconciliation ledger entry was not found.");

  if (existingReversal) {
    const errors = [...scopeErrors];
    if (existingReversal.type !== LONGMONT_OPENING_BALANCE_REVERSAL_TYPE || existingReversal.amountCents !== reversalAmountCents) {
      errors.push("An idempotency entry exists but does not match the requested opening-balance reversal.");
    }
    return {
      status: errors.length ? "blocked" : "already_applied",
      errors,
      planFingerprint,
      sourceFingerprint: audit.sourceFingerprint,
      idempotencyExternalId,
      originalLedgerEntryId: preconditions.originalLedgerEntryId,
      reversalAmountCents,
      expectedBalanceAfterCents,
      preservedInvoiceIds: audit.invoices.map((invoice) => invoice.id),
      preservedPaymentIds: audit.payments.map((payment) => payment.id),
    };
  }

  const errors = [...scopeErrors];
  if (original && original.amountCents <= 0) errors.push("The original reconciliation entry is not a positive opening balance.");
  if (audit.balanceCents !== preconditions.expectedCurrentBalanceCents) errors.push("Current billing-account balance changed after review.");
  if (audit.openInvoiceTotalCents !== preconditions.expectedOpenInvoiceTotalCents) errors.push("Open invoice total changed after review.");
  if (audit.sourceFingerprint !== preconditions.expectedSourceFingerprint) errors.push("Source fingerprint changed after review.");
  if (!audit.duplicateOpeningBalanceCandidates.some((candidate) => candidate.ledgerEntryId === preconditions.originalLedgerEntryId)) {
    errors.push("No later open invoice matches the selected imported opening balance.");
  }

  return {
    status: errors.length ? "blocked" : "ready",
    errors,
    planFingerprint,
    sourceFingerprint: audit.sourceFingerprint,
    idempotencyExternalId,
    originalLedgerEntryId: preconditions.originalLedgerEntryId,
    reversalAmountCents,
    expectedBalanceAfterCents,
    preservedInvoiceIds: audit.invoices.map((invoice) => invoice.id),
    preservedPaymentIds: audit.payments.map((payment) => payment.id),
  };
}
