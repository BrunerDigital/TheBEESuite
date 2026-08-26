import "./load-env";

import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";
const CENTER_NAME = "Miss Honey's Learning Center - Centennial";
const DUPLICATE_FAMILY_ID = "cms7g6luu004cl704amixz8oa";
const DUPLICATE_ACCOUNT_ID = "cmsdr3y4q000tld04xjs6a6yl";
const CURRENT_FAMILY_ID = "cms3lo8ks02ia6avwq3o6zppl";
const CURRENT_ACCOUNT_ID = "cmshyo8nv0001l7046ee8gyno";
const CURRENT_CHILD_ID = "cms3lo9i102io6avwixpx0ck1";
const STALE_CHILD_ID = "cms7g6m8w004il704kydwgic4";
const INVOICE_ID = "cmsg8sn73000djm04axfkdxd7";
const INVOICE_NUMBER = "INV-20260805-695D8108";
const INVOICE_CENTS = 45_200;
const SOURCE_PLAN_ID = "cmse28xx300en6amslro2altm";
const APPLY_FLAG = "--apply";
const CONFIRM_SCOPE_FLAG = "--confirm-centennial-brehm-duplicate";
const CONFIRM_FINGERPRINT_OPTION = "--confirm-fingerprint";
const LEDGER_SOURCE = "centennial_brehm_duplicate_reconciliation_2026_08_26";
const LEDGER_EXTERNAL_ID = `centennial-brehm-duplicate-invoice-void:${INVOICE_ID}`;
const AUDIT_ACTION = "billing.centennial_brehm_duplicate_invoice_voided";
const REASON = "Voided the childless duplicate-family W31 tuition invoice after the current Brehm family was verified active, paid, and explicitly reported at a zero balance.";

type Client = typeof prisma | Prisma.TransactionClient;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function option(argv: string[], name: string) {
  const equals = argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1]?.trim() ?? "" : "";
}

function parseArgs(argv = process.argv.slice(2)) {
  const apply = argv.includes(APPLY_FLAG);
  const confirmScope = argv.includes(CONFIRM_SCOPE_FLAG);
  const confirmFingerprint = option(argv, CONFIRM_FINGERPRINT_OPTION);
  const allowed = new Set([APPLY_FLAG, CONFIRM_SCOPE_FLAG, CONFIRM_FINGERPRINT_OPTION]);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index].split("=")[0];
    invariant(allowed.has(name), `Unknown option: ${argv[index]}`);
    if (name === CONFIRM_FINGERPRINT_OPTION && !argv[index].includes("=")) index += 1;
  }
  if (apply) {
    invariant(confirmScope, `Apply requires ${CONFIRM_SCOPE_FLAG}.`);
    invariant(confirmFingerprint, `Apply requires ${CONFIRM_FINGERPRINT_OPTION}.`);
  }
  return { apply, confirmFingerprint };
}

async function loadState(client: Client = prisma) {
  const [center, families, staleChild, auditCount, reversalCount] = await Promise.all([
    client.center.findUnique({
      where: { id: CENTER_ID },
      select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } },
    }),
    client.family.findMany({
      where: { id: { in: [DUPLICATE_FAMILY_ID, CURRENT_FAMILY_ID] }, centerId: CENTER_ID },
      select: {
        id: true,
        name: true,
        externalId: true,
        sourceSystem: true,
        children: { select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, externalId: true } },
        guardians: { select: { fullName: true, email: true, userId: true } },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            autopayPlaceholder: true,
            customFields: true,
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
                items: { select: { id: true, description: true, amountCents: true } },
                ledgerEntries: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, type: true, amountCents: true, balanceAfterCents: true, paymentId: true, sourceSystem: true, externalId: true } },
              },
            },
            payments: { orderBy: { id: "asc" }, select: { id: true, amountCents: true, status: true, provider: true, externalIdPlaceholder: true, paidAt: true } },
            ledgerEntries: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, invoiceId: true, paymentId: true, type: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, sourceSystem: true, externalId: true } },
          },
        },
      },
    }),
    client.child.findUnique({ where: { id: STALE_CHILD_ID }, select: { id: true } }),
    client.auditLog.count({ where: { centerId: CENTER_ID, action: AUDIT_ACTION, resource: "Invoice", resourceId: INVOICE_ID } }),
    client.ledgerEntry.count({ where: { sourceSystem: LEDGER_SOURCE, externalId: LEDGER_EXTERNAL_ID } }),
  ]);
  invariant(center?.name === CENTER_NAME, "The scoped Centennial center changed or was not found.");
  invariant(center.status === "active", "Centennial is not active.");
  invariant(families.length === 2, "The scoped Brehm family pair changed.");
  return { center, families, staleChild, auditCount, reversalCount };
}

type State = Awaited<ReturnType<typeof loadState>>;

function familyById(state: State, id: string) {
  const family = state.families.find((item) => item.id === id);
  invariant(family, `Missing scoped family ${id}.`);
  return family;
}

function financialHistory(state: State) {
  return state.families.map((family) => ({
    familyId: family.id,
    accountId: family.billingAccount?.id ?? null,
    balanceCents: family.id === DUPLICATE_FAMILY_ID ? "TARGET_BALANCE" : family.billingAccount?.balanceCents ?? null,
    invoices: (family.billingAccount?.invoices ?? []).map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.id === INVOICE_ID ? "TARGET_STATUS" : invoice.status,
      totalCents: invoice.totalCents,
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      sourceSystem: invoice.sourceSystem,
      externalId: invoice.externalId,
      items: invoice.items,
    })),
    payments: family.billingAccount?.payments.map((payment) => ({ ...payment, paidAt: payment.paidAt?.toISOString() ?? null })) ?? [],
    ledgerEntries: (family.billingAccount?.ledgerEntries ?? []).filter((entry) => entry.externalId !== LEDGER_EXTERNAL_ID),
  })).sort((left, right) => left.familyId.localeCompare(right.familyId));
}

function buildPlan(state: State) {
  const duplicate = familyById(state, DUPLICATE_FAMILY_ID);
  const current = familyById(state, CURRENT_FAMILY_ID);
  invariant(duplicate.name === "Brehm Family" && duplicate.externalId === "34189", "The duplicate Brehm identity changed.");
  invariant(current.name === "Brehm Family" && current.externalId === "BREHM", "The current Brehm identity changed.");
  invariant(duplicate.sourceSystem === "procare" && current.sourceSystem === "procare", "A scoped Brehm family source changed.");
  invariant(duplicate.children.length === 0, "The duplicate Brehm family gained a child.");
  invariant(state.staleChild === null, "The stale Brehm child exists again; review identity consolidation before applying.");
  invariant(duplicate.billingAccount?.id === DUPLICATE_ACCOUNT_ID, "The duplicate Brehm billing account changed.");
  invariant(current.billingAccount?.id === CURRENT_ACCOUNT_ID, "The current Brehm billing account changed.");
  invariant(duplicate.guardians.length === 2 && duplicate.guardians.every((guardian) => guardian.userId === null), "The duplicate Brehm guardian access state changed.");
  const duplicateEmails = duplicate.guardians.map((guardian) => guardian.email?.trim().toLowerCase()).sort();
  const currentEmails = current.guardians.map((guardian) => guardian.email?.trim().toLowerCase()).sort();
  invariant(JSON.stringify(duplicateEmails) === JSON.stringify(currentEmails), "The duplicate and current Brehm guardian emails no longer match.");
  invariant(current.children.some((child) => child.id === CURRENT_CHILD_ID && child.fullName === "Nicholas Brehm" && child.classroomId && ["enrolled", "active", "current"].includes(child.enrollmentStatus.trim().toLowerCase())), "The current Brehm child enrollment changed.");

  const invoice = duplicate.billingAccount.invoices.find((item) => item.id === INVOICE_ID);
  invariant(invoice, "The duplicate Brehm invoice was not found.");
  invariant(invoice.number === INVOICE_NUMBER && invoice.totalCents === INVOICE_CENTS, "The duplicate Brehm invoice identity or amount changed.");
  invariant(invoice.sourceSystem === "bee_suite" && invoice.externalId === null, "The duplicate Brehm invoice source changed.");
  const fields = record(invoice.customFields);
  invariant(fields.childId === STALE_CHILD_ID && fields.sourceId === SOURCE_PLAN_ID && fields.billingPeriod === "2026-W31" && fields.chargeSource === "tuitionPlan", "The duplicate Brehm invoice purpose changed.");
  invariant(invoice.items.length === 1 && invoice.items[0].amountCents === INVOICE_CENTS && invoice.items[0].description.includes("Nicholas Brehm"), "The duplicate Brehm invoice line changed.");
  invariant(duplicate.billingAccount.payments.length === 0, "The duplicate Brehm account now has payment history.");
  invariant(invoice.ledgerEntries.filter((entry) => entry.externalId !== LEDGER_EXTERNAL_ID).every((entry) => entry.paymentId === null), "The duplicate Brehm invoice has payment-linked ledger history.");

  const currentFields = record(current.billingAccount.customFields);
  invariant(current.billingAccount.balanceCents === 0, "The current Brehm balance is no longer zero.");
  invariant(current.billingAccount.autopayPlaceholder === true || currentFields.autopayEnabled === true, "The current Brehm explicit autopay consent is no longer enabled.");
  invariant(current.billingAccount.payments.some((payment) => payment.amountCents === INVOICE_CENTS && payment.status === PaymentStatus.PAID && payment.provider === "stripe"), "The current Brehm account no longer has the verified paid Stripe history.");

  const alreadyApplied = invoice.status === PaymentStatus.VOID;
  if (alreadyApplied) {
    invariant(duplicate.billingAccount.balanceCents === 0, "The duplicate Brehm balance changed after reconciliation.");
    invariant(state.auditCount === 1 && state.reversalCount === 1, "The guarded Brehm reconciliation evidence is missing or duplicated.");
    invariant(fields.staleDuplicateInvoiceBalanceReversed === true, "The Brehm invoice was voided outside this guarded reconciliation.");
  } else {
    invariant(invoice.status === PaymentStatus.OPEN, `The duplicate Brehm invoice changed to ${invoice.status}.`);
    invariant(duplicate.billingAccount.balanceCents === INVOICE_CENTS, "The duplicate Brehm balance changed before reconciliation.");
    invariant(state.auditCount === 0 && state.reversalCount === 0, "A Brehm reconciliation artifact already exists before apply.");
  }

  const sourceFingerprint = fingerprint({
    centerId: CENTER_ID,
    duplicateFamilyId: DUPLICATE_FAMILY_ID,
    currentFamilyId: CURRENT_FAMILY_ID,
    staleChildPresent: Boolean(state.staleChild),
    invoice: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      totalCents: invoice.totalCents,
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      customFields: invoice.customFields,
      items: invoice.items,
      ledgerEntries: invoice.ledgerEntries,
    },
    duplicateBalanceCents: duplicate.billingAccount.balanceCents,
    currentBalanceCents: current.billingAccount.balanceCents,
    currentPaymentIds: current.billingAccount.payments.map((payment) => payment.id).sort(),
    auditCount: state.auditCount,
    reversalCount: state.reversalCount,
  });
  return { duplicate, current, invoice, alreadyApplied, sourceFingerprint };
}

function summary(state: State, plan: ReturnType<typeof buildPlan>) {
  return {
    center: { id: state.center.id, name: state.center.name },
    fingerprint: plan.sourceFingerprint,
    duplicateFamily: { id: plan.duplicate.id, children: plan.duplicate.children.length, balanceCents: plan.duplicate.billingAccount?.balanceCents },
    currentFamily: { id: plan.current.id, currentChildren: plan.current.children.length, balanceCents: plan.current.billingAccount?.balanceCents, autopayPreserved: true },
    invoice: { id: plan.invoice.id, number: plan.invoice.number, status: plan.invoice.status, totalCents: plan.invoice.totalCents, targetStatus: PaymentStatus.VOID },
    paymentsPreserved: state.families.reduce((sum, family) => sum + (family.billingAccount?.payments.length ?? 0), 0),
    historicalLedgerEntriesPreserved: financialHistory(state).reduce((sum, family) => sum + family.ledgerEntries.length, 0),
    duplicateBalanceAfterCents: 0,
    currentBalanceAfterCents: 0,
    alreadyApplied: plan.alreadyApplied,
  };
}

async function applyPlan(initialState: State, expectedFingerprint: string) {
  const historyBefore = JSON.stringify(financialHistory(initialState));
  const appliedAt = new Date();
  let invoiceUpdated = 0;
  let accountUpdated = 0;
  let ledgerEntriesCreated = 0;
  let auditEntriesCreated = 0;

  await prisma.$transaction(async (tx) => {
    const state = await loadState(tx);
    const plan = buildPlan(state);
    invariant(plan.sourceFingerprint === expectedFingerprint, "The Brehm reconciliation fingerprint changed after preflight.");
    invariant(JSON.stringify(financialHistory(state)) === historyBefore, "Brehm financial history changed after preflight.");
    if (!plan.alreadyApplied) {
      const invoiceResult = await tx.invoice.updateMany({
        where: { id: INVOICE_ID, billingAccountId: DUPLICATE_ACCOUNT_ID, status: PaymentStatus.OPEN, totalCents: INVOICE_CENTS, sourceSystem: "bee_suite" },
        data: {
          status: PaymentStatus.VOID,
          customFields: {
            ...record(plan.invoice.customFields),
            staleDuplicateInvoiceVoidedAt: appliedAt.toISOString(),
            staleDuplicateInvoiceVoidReason: REASON,
            staleDuplicateInvoiceBalanceReversed: true,
            currentFamilyId: CURRENT_FAMILY_ID,
            duplicateFamilyId: DUPLICATE_FAMILY_ID,
          } as Prisma.InputJsonObject,
        },
      });
      invariant(invoiceResult.count === 1, "The duplicate Brehm invoice changed during apply.");
      invoiceUpdated = invoiceResult.count;

      const accountResult = await tx.billingAccount.updateMany({
        where: { id: DUPLICATE_ACCOUNT_ID, familyId: DUPLICATE_FAMILY_ID, balanceCents: INVOICE_CENTS },
        data: { balanceCents: 0, ledgerSyncedAt: appliedAt },
      });
      invariant(accountResult.count === 1, "The duplicate Brehm balance changed during apply.");
      accountUpdated = accountResult.count;

      await tx.ledgerEntry.create({
        data: {
          billingAccountId: DUPLICATE_ACCOUNT_ID,
          invoiceId: INVOICE_ID,
          type: "invoice_void",
          description: `Voided ${INVOICE_NUMBER}: childless duplicate Brehm family`,
          amountCents: -INVOICE_CENTS,
          balanceAfterCents: 0,
          effectiveAt: appliedAt,
          sourceSystem: LEDGER_SOURCE,
          externalId: LEDGER_EXTERNAL_ID,
          metadata: {
            reason: REASON,
            duplicateFamilyId: DUPLICATE_FAMILY_ID,
            currentFamilyId: CURRENT_FAMILY_ID,
            originalInvoiceStatus: PaymentStatus.OPEN,
            currentInvoiceStatus: PaymentStatus.VOID,
            paymentsMutated: false,
            currentFamilyMutated: false,
            sourceFingerprint: expectedFingerprint,
          },
        },
      });
      ledgerEntriesCreated = 1;

      await tx.auditLog.create({
        data: {
          tenantId: state.center.organization.tenantId,
          centerId: CENTER_ID,
          action: AUDIT_ACTION,
          resource: "Invoice",
          resourceId: INVOICE_ID,
          metadata: {
            authorization: "user_requested_centennial_autopay_and_payment_status_reconciliation",
            evidence: "latest_school_thread_zero_balance_plus_live_current_family_paid_history",
            invoiceNumber: INVOICE_NUMBER,
            invoiceTotalCents: INVOICE_CENTS,
            duplicateFamilyId: DUPLICATE_FAMILY_ID,
            currentFamilyId: CURRENT_FAMILY_ID,
            priorStatus: PaymentStatus.OPEN,
            nextStatus: PaymentStatus.VOID,
            priorDuplicateBalanceCents: INVOICE_CENTS,
            nextDuplicateBalanceCents: 0,
            currentFamilyBalancePreservedCents: 0,
            explicitAutopayConsentPreserved: true,
            paymentsPreserved: true,
            sourceFingerprint: expectedFingerprint,
            reason: REASON,
          },
        },
      });
      auditEntriesCreated = 1;
    }

    const verified = await loadState(tx);
    const verifiedPlan = buildPlan(verified);
    invariant(verifiedPlan.alreadyApplied, "The duplicate Brehm invoice is still open.");
    invariant(JSON.stringify(financialHistory(verified)) === historyBefore, "Existing Brehm invoices, payments, or ledger entries changed during reconciliation.");
  }, { maxWait: 10_000, timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { invoiceUpdated, accountUpdated, ledgerEntriesCreated, auditEntriesCreated, paymentsMutated: 0, currentFamilyMutated: false };
}

async function main() {
  const args = parseArgs();
  const state = await loadState();
  const plan = buildPlan(state);
  console.log(JSON.stringify({ mode: args.apply ? "apply-preflight" : "dry-run", ...summary(state, plan) }, null, 2));
  if (!args.apply) return;
  invariant(args.confirmFingerprint === plan.sourceFingerprint, `Fingerprint mismatch. Re-run the dry run and pass ${CONFIRM_FINGERPRINT_OPTION}.`);
  const result = await applyPlan(state, plan.sourceFingerprint);
  const verifiedState = await loadState();
  const verifiedPlan = buildPlan(verifiedState);
  console.log(JSON.stringify({ mode: "apply-result", result, verification: summary(verifiedState, verifiedPlan) }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
