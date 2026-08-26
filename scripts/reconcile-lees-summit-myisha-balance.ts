import "./load-env";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-fingerprint";
const CENTER_ID = "cmp4ewfzn004g6alwqbqrzcql";
const CENTER_NAME = "Kid City USA - Lees Summit";
const FAMILY_ID = "cmruz8nbx000dle041ovivf1u";
const BILLING_ACCOUNT_ID = "cmsdisl3z000s6angymfe10z6";
const GUARDIAN_NAME = "Myisha Adams";
const IMPORTED_CREDIT_CENTS = 31_500;
const ORIGINAL_LEDGER_ID = "cmsdisl8q000u6angbd8wav8l";
const SOURCE_CURRENT_BILLING_MESSAGE_ID = "19ff320186bb7110";
const SOURCE_CURRENT_BILLING_FILE = "Current Billing.csv";
const SOURCE_STATEMENT_MESSAGE_ID = "19fba3193a9ea3a0";
const SOURCE_STATEMENT_FILE = "Standard customer statement.pdf";
const SOURCE_CURRENT_BILLING_AT = new Date("2026-08-11T23:19:43.000Z");
const CORRECTION_SOURCE_SYSTEM = "bee_suite_source_reconciliation";
const CORRECTION_EXTERNAL_ID = "lees-summit:myisha-adams:current-billing:2026-08-11";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadState(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [center, family, account, originalLedger, correctionLedger, refundRequests] = await Promise.all([
    db.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, organization: { select: { tenantId: true } } } }),
    db.family.findUnique({ where: { id: FAMILY_ID }, select: { id: true, centerId: true, name: true, guardians: { select: { id: true, fullName: true } } } }),
    db.billingAccount.findUnique({ where: { id: BILLING_ACCOUNT_ID }, select: {
      id: true,
      familyId: true,
      balanceCents: true,
      customFields: true,
      invoices: { select: { id: true, number: true, status: true, totalCents: true }, orderBy: { id: "asc" } },
      payments: { select: { id: true, status: true, provider: true, amountCents: true, externalIdPlaceholder: true }, orderBy: { id: "asc" } },
    } }),
    db.ledgerEntry.findUnique({ where: { id: ORIGINAL_LEDGER_ID }, select: { id: true, billingAccountId: true, amountCents: true, balanceAfterCents: true, sourceSystem: true, externalId: true, metadata: true } }),
    db.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: CORRECTION_SOURCE_SYSTEM, externalId: CORRECTION_EXTERNAL_ID } }, select: { id: true, billingAccountId: true, amountCents: true, balanceAfterCents: true } }),
    db.refundRequest.findMany({ where: { familyId: FAMILY_ID }, select: { id: true, amountCents: true, status: true, processedAmountCents: true }, orderBy: { id: "asc" } }),
  ]);

  invariant(center?.name === CENTER_NAME, "Lees Summit center identity changed.");
  invariant(family?.centerId === CENTER_ID && family.guardians.some((guardian) => guardian.fullName === GUARDIAN_NAME), "Myisha family identity changed.");
  invariant(account?.familyId === FAMILY_ID, "Myisha billing account identity changed.");
  invariant(originalLedger?.billingAccountId === BILLING_ACCOUNT_ID && originalLedger.amountCents === -IMPORTED_CREDIT_CENTS, "The imported Myisha credit ledger changed.");

  return { center, family, account, originalLedger, correctionLedger, refundRequests };
}

function reviewedState(state: Awaited<ReturnType<typeof loadState>>) {
  return {
    centerId: state.center.id,
    familyId: state.family.id,
    billingAccountId: state.account.id,
    balanceCents: state.account.balanceCents,
    originalLedger: {
      id: state.originalLedger.id,
      amountCents: state.originalLedger.amountCents,
      balanceAfterCents: state.originalLedger.balanceAfterCents,
      sourceSystem: state.originalLedger.sourceSystem,
      externalId: state.originalLedger.externalId,
    },
    correctionLedger: state.correctionLedger,
    invoices: state.account.invoices,
    payments: state.account.payments,
    refundRequests: state.refundRequests,
  };
}

async function main() {
  const before = await loadState();
  const reviewed = reviewedState(before);
  const planFingerprint = fingerprint(reviewed);
  const alreadyApplied = Boolean(before.correctionLedger);

  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({
      mode: "preview",
      alreadyApplied,
      planFingerprint,
      reviewed,
      evidence: {
        sourceCurrentBilling: { messageId: SOURCE_CURRENT_BILLING_MESSAGE_ID, filename: SOURCE_CURRENT_BILLING_FILE, reportedBalanceCents: 0 },
        sourceStatement: { messageId: SOURCE_STATEMENT_MESSAGE_ID, filename: SOURCE_STATEMENT_FILE, endingBalanceCents: 0, throughDate: "2026-07-31" },
        stripeConnectedCustomerAudit: { paymentIntents: 0, charges: 0, refunds: 0 },
      },
      planned: {
        accountBalanceAdjustmentCents: alreadyApplied ? 0 : IMPORTED_CREDIT_CENTS,
        invoicesChanged: 0,
        paymentsChanged: 0,
        refundsCreatedOrChanged: 0,
        chargesCreated: 0,
      },
    }, null, 2));
    return;
  }

  invariant(option(CONFIRM_FLAG) === planFingerprint, `Pass ${CONFIRM_FLAG} ${planFingerprint} after reviewing the current preview.`);

  await prisma.$transaction(async (tx) => {
    const current = await loadState(tx);
    invariant(fingerprint(reviewedState(current)) === planFingerprint, "Production state changed after preview; no reconciliation was applied.");

    if (current.correctionLedger) {
      invariant(current.account.balanceCents === 0 && current.correctionLedger.amountCents === IMPORTED_CREDIT_CENTS && current.correctionLedger.balanceAfterCents === 0, "Existing Myisha reconciliation is incomplete or changed.");
      return;
    }

    invariant(current.account.balanceCents === -IMPORTED_CREDIT_CENTS, "Myisha balance is no longer the reviewed imported -$315.00.");
    invariant(current.account.invoices.length === 0 && current.account.payments.length === 0 && current.refundRequests.length === 0, "A BEE Suite invoice, payment, or refund request now exists; manual transaction reconciliation is required.");

    const accountFields = record(current.account.customFields);
    const account = await tx.billingAccount.update({
      where: { id: BILLING_ACCOUNT_ID },
      data: {
        balanceCents: { increment: IMPORTED_CREDIT_CENTS },
        customFields: {
          ...accountFields,
          latestSourceBalanceReconciliation: {
            reconciledAt: new Date().toISOString(),
            balanceCents: 0,
            previousBalanceCents: -IMPORTED_CREDIT_CENTS,
            reason: "Later authoritative ProCare billing export and transaction statement supersede the imported credit display.",
            currentBillingMessageId: SOURCE_CURRENT_BILLING_MESSAGE_ID,
            currentBillingFilename: SOURCE_CURRENT_BILLING_FILE,
            statementMessageId: SOURCE_STATEMENT_MESSAGE_ID,
            statementFilename: SOURCE_STATEMENT_FILE,
            invoicesChanged: false,
            paymentsChanged: false,
            refundsChanged: false,
          },
        },
      },
      select: { balanceCents: true },
    });
    invariant(account.balanceCents === 0, "Myisha post-reconciliation balance is not $0.00.");

    const ledger = await tx.ledgerEntry.create({ data: {
      billingAccountId: BILLING_ACCOUNT_ID,
      type: "source_balance_reconciliation",
      description: "Reconciled imported ProCare credit to later authoritative $0.00 balance",
      amountCents: IMPORTED_CREDIT_CENTS,
      balanceAfterCents: 0,
      effectiveAt: SOURCE_CURRENT_BILLING_AT,
      sourceSystem: CORRECTION_SOURCE_SYSTEM,
      externalId: CORRECTION_EXTERNAL_ID,
      metadata: {
        familyId: FAMILY_ID,
        centerId: CENTER_ID,
        priorLedgerEntryId: ORIGINAL_LEDGER_ID,
        priorBalanceCents: -IMPORTED_CREDIT_CENTS,
        reconciledBalanceCents: 0,
        currentBillingMessageId: SOURCE_CURRENT_BILLING_MESSAGE_ID,
        currentBillingFilename: SOURCE_CURRENT_BILLING_FILE,
        statementMessageId: SOURCE_STATEMENT_MESSAGE_ID,
        statementFilename: SOURCE_STATEMENT_FILE,
        stripePaymentIntentsFound: 0,
        stripeChargesFound: 0,
        stripeRefundsFound: 0,
        invoicesChanged: false,
        paymentsChanged: false,
        refundsChanged: false,
        originalLedgerPreserved: true,
      },
    } });

    await tx.auditLog.create({ data: {
      tenantId: current.center.organization.tenantId,
      centerId: CENTER_ID,
      action: "billing.source_balance.reconciled",
      resource: "BillingAccount",
      resourceId: BILLING_ACCOUNT_ID,
      metadata: {
        familyId: FAMILY_ID,
        priorLedgerEntryId: ORIGINAL_LEDGER_ID,
        correctionLedgerEntryId: ledger.id,
        previousBalanceCents: -IMPORTED_CREDIT_CENTS,
        reconciledBalanceCents: 0,
        currentBillingMessageId: SOURCE_CURRENT_BILLING_MESSAGE_ID,
        statementMessageId: SOURCE_STATEMENT_MESSAGE_ID,
        originalLedgerPreserved: true,
        chargeCreated: false,
        refundCreated: false,
        paymentCreated: false,
      },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

  const after = await loadState();
  invariant(after.account.balanceCents === 0, "Myisha balance did not reconcile to $0.00.");
  invariant(after.correctionLedger?.amountCents === IMPORTED_CREDIT_CENTS && after.correctionLedger.balanceAfterCents === 0, "Myisha reconciliation ledger is missing or incorrect.");
  invariant(after.originalLedger.id === ORIGINAL_LEDGER_ID && after.originalLedger.amountCents === -IMPORTED_CREDIT_CENTS, "The original imported-credit ledger was not preserved.");
  invariant(JSON.stringify(after.account.invoices) === JSON.stringify(before.account.invoices), "An invoice changed during Myisha reconciliation.");
  invariant(JSON.stringify(after.account.payments) === JSON.stringify(before.account.payments), "A payment changed during Myisha reconciliation.");
  invariant(JSON.stringify(after.refundRequests) === JSON.stringify(before.refundRequests), "A refund request changed during Myisha reconciliation.");

  console.log(JSON.stringify({
    mode: alreadyApplied ? "already_applied" : "applied",
    billingAccountId: BILLING_ACCOUNT_ID,
    balanceCents: after.account.balanceCents,
    correctionLedgerId: after.correctionLedger.id,
    originalLedgerPreserved: true,
    invoicesChanged: 0,
    paymentsChanged: 0,
    refundsCreatedOrChanged: 0,
    chargesCreated: 0,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
