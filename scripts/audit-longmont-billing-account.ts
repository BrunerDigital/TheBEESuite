import "./load-env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildBillingBalanceAudit,
  buildOpeningBalanceReversalPlan,
  LONGMONT_OPENING_BALANCE_REVERSAL_SOURCE,
  LONGMONT_OPENING_BALANCE_REVERSAL_TYPE,
  type BillingBalanceAuditInput,
  type OpeningBalanceReversalPreconditions,
} from "@/lib/billing-balance-audit";

type Args = {
  centerId: string;
  familyId: string;
  billingAccountId: string;
  originalLedgerEntryId: string;
  expectedCurrentBalanceCents: number | null;
  expectedOpenInvoiceTotalCents: number | null;
  expectedSourceFingerprint: string;
  confirmPlanFingerprint: string;
  apply: boolean;
  confirmScope: boolean;
  confirmHistory: boolean;
};

const APPLY_FLAG = "--apply";
const CONFIRM_SCOPE_FLAG = "--confirm-longmont-opening-balance-reversal";
const CONFIRM_HISTORY_FLAG = "--confirm-preserve-invoices-payments-access";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${flag} must be a whole number of cents.`);
  return parsed;
}

export function parseLongmontBillingAuditArgs(argv = process.argv.slice(2)): Args {
  const values = new Map<string, string>();
  const args: Args = {
    centerId: "",
    familyId: "",
    billingAccountId: "",
    originalLedgerEntryId: "",
    expectedCurrentBalanceCents: null,
    expectedOpenInvoiceTotalCents: null,
    expectedSourceFingerprint: "",
    confirmPlanFingerprint: "",
    apply: false,
    confirmScope: false,
    confirmHistory: false,
  };

  for (const arg of argv) {
    if (arg === APPLY_FLAG) args.apply = true;
    else if (arg === CONFIRM_SCOPE_FLAG) args.confirmScope = true;
    else if (arg === CONFIRM_HISTORY_FLAG) args.confirmHistory = true;
    else if (arg.startsWith("--") && arg.includes("=")) {
      const separator = arg.indexOf("=");
      values.set(arg.slice(2, separator), arg.slice(separator + 1));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.centerId = clean(values.get("center-id"));
  args.familyId = clean(values.get("family-id"));
  args.billingAccountId = clean(values.get("billing-account-id"));
  args.originalLedgerEntryId = clean(values.get("original-ledger-entry-id"));
  args.expectedSourceFingerprint = clean(values.get("expected-source-fingerprint"));
  args.confirmPlanFingerprint = clean(values.get("confirm-plan-fingerprint"));
  if (values.has("expected-current-balance-cents")) {
    args.expectedCurrentBalanceCents = integer(values.get("expected-current-balance-cents") || "", "--expected-current-balance-cents");
  }
  if (values.has("expected-open-invoice-total-cents")) {
    args.expectedOpenInvoiceTotalCents = integer(values.get("expected-open-invoice-total-cents") || "", "--expected-open-invoice-total-cents");
  }

  if (!args.centerId || !args.familyId) {
    throw new Error("Read-only audit requires exact --center-id and --family-id scope flags.");
  }
  if (args.apply) {
    const missing = [
      !args.billingAccountId && "--billing-account-id",
      !args.originalLedgerEntryId && "--original-ledger-entry-id",
      args.expectedCurrentBalanceCents === null && "--expected-current-balance-cents",
      args.expectedOpenInvoiceTotalCents === null && "--expected-open-invoice-total-cents",
      !args.expectedSourceFingerprint && "--expected-source-fingerprint",
      !args.confirmPlanFingerprint && "--confirm-plan-fingerprint",
      !args.confirmScope && CONFIRM_SCOPE_FLAG,
      !args.confirmHistory && CONFIRM_HISTORY_FLAG,
    ].filter(Boolean);
    if (missing.length) throw new Error(`Apply is blocked. Missing exact confirmation flags: ${missing.join(", ")}`);
  }
  return args;
}

type DbClient = typeof prisma | Prisma.TransactionClient;

async function loadAuditInput(client: DbClient, args: Pick<Args, "centerId" | "familyId" | "billingAccountId">) {
  const center = await client.center.findUnique({
    where: { id: args.centerId },
    select: { id: true, name: true, crmLocationId: true, organization: { select: { tenantId: true } } },
  });
  if (!center) throw new Error("Exact center was not found.");
  if (!`${center.name} ${center.crmLocationId || ""}`.toLowerCase().includes("longmont")) {
    throw new Error("The exact center scope is not the Longmont school.");
  }

  const family = await client.family.findFirst({
    where: { id: args.familyId, centerId: center.id },
    select: {
      id: true,
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          ledgerEntries: {
            orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              type: true,
              description: true,
              amountCents: true,
              balanceAfterCents: true,
              effectiveAt: true,
              createdAt: true,
              sourceSystem: true,
              externalId: true,
              invoiceId: true,
              paymentId: true,
              metadata: true,
            },
          },
          invoices: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              number: true,
              status: true,
              totalCents: true,
              dueDate: true,
              createdAt: true,
              sourceSystem: true,
              externalId: true,
              customFields: true,
              items: { orderBy: { id: "asc" }, select: { description: true } },
            },
          },
          payments: {
            orderBy: [{ paidAt: "asc" }, { id: "asc" }],
            select: { id: true, status: true, amountCents: true, paidAt: true, provider: true },
          },
        },
      },
    },
  });
  if (!family) throw new Error("Exact family was not found in the Longmont school.");
  if (!family.billingAccount) throw new Error("The exact family has no billing account.");
  if (args.billingAccountId && family.billingAccount.id !== args.billingAccountId) {
    throw new Error("Exact billing-account scope does not match the family.");
  }

  const input: BillingBalanceAuditInput = {
    centerId: center.id,
    familyId: family.id,
    billingAccountId: family.billingAccount.id,
    balanceCents: family.billingAccount.balanceCents,
    asOf: new Date(),
    ledgerEntries: family.billingAccount.ledgerEntries,
    invoices: family.billingAccount.invoices.map((invoice) => ({
      ...invoice,
      status: String(invoice.status),
      descriptions: invoice.items.map((item) => item.description),
    })),
    payments: family.billingAccount.payments.map((payment) => ({ ...payment, status: String(payment.status) })),
  };
  return { center, input };
}

function planPreconditions(args: Args, audit: ReturnType<typeof buildBillingBalanceAudit>, originalLedgerEntryId: string): OpeningBalanceReversalPreconditions {
  return {
    centerId: args.centerId,
    familyId: args.familyId,
    billingAccountId: args.billingAccountId || audit.scope.billingAccountId,
    originalLedgerEntryId,
    expectedCurrentBalanceCents: args.expectedCurrentBalanceCents ?? audit.balanceCents,
    expectedOpenInvoiceTotalCents: args.expectedOpenInvoiceTotalCents ?? audit.openInvoiceTotalCents,
    expectedSourceFingerprint: args.expectedSourceFingerprint || audit.sourceFingerprint,
  };
}

function auditOutput(audit: ReturnType<typeof buildBillingBalanceAudit>) {
  return {
    scope: audit.scope,
    billingAccountBalanceCents: audit.balanceCents,
    orderedLedgerTotalCents: audit.orderedLedgerTotalCents,
    latestLedgerBalanceCents: audit.latestLedgerBalanceCents,
    openInvoiceTotalCents: audit.openInvoiceTotalCents,
    succeededPaymentTotalCents: audit.succeededPaymentTotalCents,
    creditAndReversalTotalCents: audit.creditAndReversalTotalCents,
    originalProcareReconciliationEntries: audit.originalProcareEntries.map((entry) => ({
      id: entry.id,
      amountCents: entry.amountCents,
      effectiveAt: entry.effectiveAt,
      externalId: entry.externalId,
    })),
    duplicateOpeningBalanceCandidates: audit.duplicateOpeningBalanceCandidates,
    flags: audit.flags,
    sourceFingerprint: audit.sourceFingerprint,
    invoicesPreserved: audit.invoices.length,
    paymentsPreserved: audit.payments.length,
    guardianPiiQueried: false,
  };
}

export async function runLongmontBillingAudit(argv = process.argv.slice(2)) {
  const args = parseLongmontBillingAuditArgs(argv);
  const { input } = await loadAuditInput(prisma, args);
  const audit = buildBillingBalanceAudit(input);
  const candidateLedgerIds = [...new Set(audit.duplicateOpeningBalanceCandidates.map((candidate) => candidate.ledgerEntryId))];
  const selectedOriginalLedgerEntryId = args.originalLedgerEntryId || (candidateLedgerIds.length === 1 ? candidateLedgerIds[0] : "");
  const preview = selectedOriginalLedgerEntryId
    ? buildOpeningBalanceReversalPlan(audit, planPreconditions(args, audit, selectedOriginalLedgerEntryId))
    : null;

  if (!args.apply) {
    console.log(JSON.stringify({
      mode: "dry-run",
      audit: auditOutput(audit),
      reversalPlan: preview,
      applyExecuted: false,
      nextStep: preview?.status === "ready"
        ? "Review the exact source and plan fingerprints. Apply remains blocked without all explicit scope, balance, history-preservation, and fingerprint flags."
        : "Resolve audit flags or select the exact original ledger entry before any apply attempt.",
    }, null, 2));
    return;
  }

  if (!preview || preview.status === "blocked") {
    throw new Error(`Apply is blocked by the dry-run plan: ${preview?.errors.join(" ") || "No unique opening-balance candidate was selected."}`);
  }
  if (preview.planFingerprint !== args.confirmPlanFingerprint) {
    throw new Error("Plan fingerprint confirmation does not match the reviewed dry-run plan.");
  }
  if (preview.status === "already_applied") {
    console.log(JSON.stringify({ mode: "apply", status: "already_applied", plan: preview }, null, 2));
    return;
  }

  const explicitPreconditions = planPreconditions(args, audit, args.originalLedgerEntryId);
  const result = await prisma.$transaction(async (tx) => {
    const liveState = await loadAuditInput(tx, args);
    const liveAudit = buildBillingBalanceAudit(liveState.input);
    const livePlan = buildOpeningBalanceReversalPlan(liveAudit, explicitPreconditions);
    if (livePlan.planFingerprint !== args.confirmPlanFingerprint) throw new Error("Live plan fingerprint changed before apply.");
    if (livePlan.status === "already_applied") return { status: "already_applied" as const, plan: livePlan };
    if (livePlan.status !== "ready") throw new Error(`Live preconditions failed: ${livePlan.errors.join(" ")}`);

    const updated = await tx.billingAccount.updateMany({
      where: { id: args.billingAccountId, familyId: args.familyId, balanceCents: args.expectedCurrentBalanceCents! },
      data: { balanceCents: { increment: livePlan.reversalAmountCents } },
    });
    if (updated.count !== 1) throw new Error("Billing-account balance precondition changed during apply.");

    const appliedAt = new Date();
    const ledger = await tx.ledgerEntry.create({
      data: {
        billingAccountId: args.billingAccountId,
        type: LONGMONT_OPENING_BALANCE_REVERSAL_TYPE,
        description: "Compensating reversal of duplicated Longmont ProCare opening balance",
        amountCents: livePlan.reversalAmountCents,
        balanceAfterCents: livePlan.expectedBalanceAfterCents,
        effectiveAt: appliedAt,
        sourceSystem: LONGMONT_OPENING_BALANCE_REVERSAL_SOURCE,
        externalId: livePlan.idempotencyExternalId,
        metadata: {
          centerId: args.centerId,
          familyId: args.familyId,
          billingAccountId: args.billingAccountId,
          originalLedgerEntryId: args.originalLedgerEntryId,
          expectedCurrentBalanceCents: args.expectedCurrentBalanceCents,
          expectedOpenInvoiceTotalCents: args.expectedOpenInvoiceTotalCents,
          sourceFingerprint: args.expectedSourceFingerprint,
          planFingerprint: args.confirmPlanFingerprint,
          invoicesMutated: false,
          paymentsMutated: false,
          parentAccessMutated: false,
          invitationsMutated: false,
          tuitionAssignmentsMutated: false,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: liveState.center.organization.tenantId,
        centerId: args.centerId,
        userId: null,
        action: "billing.longmont_opening_balance_duplicate_reversed",
        resource: "BillingAccount",
        resourceId: args.billingAccountId,
        metadata: {
          ledgerEntryId: ledger.id,
          originalLedgerEntryId: args.originalLedgerEntryId,
          reversalAmountCents: livePlan.reversalAmountCents,
          balanceAfterCents: livePlan.expectedBalanceAfterCents,
          sourceFingerprint: args.expectedSourceFingerprint,
          planFingerprint: args.confirmPlanFingerprint,
          preservedInvoiceIds: livePlan.preservedInvoiceIds,
          preservedPaymentIds: livePlan.preservedPaymentIds,
          parentAccessMutated: false,
          invitationsMutated: false,
          tuitionAssignmentsMutated: false,
        },
      },
    });
    return { status: "applied" as const, plan: livePlan, ledgerEntryId: ledger.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(JSON.stringify({ mode: "apply", ...result }, null, 2));
}

if (process.argv[1]?.toLowerCase().includes("audit-longmont-billing-account")) {
  runLongmontBillingAudit()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
