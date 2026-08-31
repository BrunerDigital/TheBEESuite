import "./load-env";

import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";

import { planHistoricalOfflineInvoiceReconciliation } from "../src/lib/offline-payment-reconciliation";
import { AGENCY_LEDGER_ENTRY_TYPES, AGENCY_LEDGER_SOURCE_SYSTEM, parentVisibleBillingBalanceCents } from "../src/lib/parent-billing-visibility";
import { prisma } from "../src/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-historical-offline-invoice-reconciliation";
const SUMMARY_FLAG = "--summary";
const RECONCILIATION_VERSION = 1;
const OFFLINE_PROVIDERS = ["manual_cash", "manual_check", "manual_payroll_deduction"] as const;

type LoadedPayment = Awaited<ReturnType<typeof loadOfflinePayments>>[number];
type LoadedAccount = NonNullable<LoadedPayment["billingAccount"]>;

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function integer(value: unknown) {
  return Number.isInteger(value) ? Number(value) : 0;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asInputJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

function loadOfflinePayments() {
  return prisma.payment.findMany({
    where: { status: PaymentStatus.PAID, provider: { in: [...OFFLINE_PROVIDERS] } },
    orderBy: [{ billingAccountId: "asc" }, { paidAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      billingAccountId: true,
      amountCents: true,
      status: true,
      provider: true,
      paidAt: true,
      customFields: true,
      ledgerEntries: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, billingAccountId: true, invoiceId: true, paymentId: true, type: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, sourceSystem: true, externalId: true },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          family: { select: { id: true, name: true, centerId: true } },
          invoices: {
            orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            select: { id: true, number: true, status: true, totalCents: true, dueDate: true, createdAt: true, customFields: true },
          },
          ledgerEntries: {
            where: { OR: [{ type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } }, { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM }] },
            orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            select: { id: true, invoiceId: true, type: true, sourceSystem: true, amountCents: true, effectiveAt: true, createdAt: true, externalId: true, metadata: true },
          },
        },
      },
    },
  });
}

function expectedLedger(payment: LoadedPayment) {
  const expected = payment.provider === "manual_cash"
    ? { type: "cash_payment", sourceSystem: "bee_suite_manual_cash" }
    : payment.provider === "manual_check"
      ? { type: "check_payment", sourceSystem: "bee_suite_manual_check" }
      : { type: "payroll_deduction_payment", sourceSystem: "bee_suite_payroll_deduction" };
  return payment.ledgerEntries.length === 1
    && payment.ledgerEntries[0]?.paymentId === payment.id
    && payment.ledgerEntries[0]?.billingAccountId === payment.billingAccountId
    && payment.ledgerEntries[0]?.invoiceId === null
    && payment.ledgerEntries[0]?.amountCents === -payment.amountCents
    && payment.ledgerEntries[0]?.type === expected.type
    && payment.ledgerEntries[0]?.sourceSystem === expected.sourceSystem
    && Number.isInteger(payment.ledgerEntries[0]?.balanceAfterCents)
    ? payment.ledgerEntries[0]
    : null;
}

function paymentState(payment: LoadedPayment) {
  const fields = jsonRecord(payment.customFields);
  const reconciliation = jsonRecord(fields.historicalOfflineInvoiceReconciliation);
  const reconciledCents = Math.max(0, Math.min(payment.amountCents, integer(reconciliation.reconciledCents)));
  const appliedInvoiceIds = stringArray(fields.appliedInvoiceIds);
  const alreadyAppliedByCurrentFlow = appliedInvoiceIds.length > 0 && reconciledCents === 0;
  return { fields, reconciliation, reconciledCents, appliedInvoiceIds, alreadyAppliedByCurrentFlow };
}

function accountFingerprintInput(account: LoadedAccount, payments: LoadedPayment[]) {
  return {
    billingAccountId: account.id,
    balanceCents: account.balanceCents,
    familyId: account.family.id,
    centerId: account.family.centerId,
    payments: payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      status: payment.status,
      provider: payment.provider,
      paidAt: payment.paidAt?.toISOString() ?? null,
      customFields: payment.customFields,
      ledgerEntries: payment.ledgerEntries.map((entry) => ({
        id: entry.id,
        invoiceId: entry.invoiceId,
        paymentId: entry.paymentId,
        type: entry.type,
        amountCents: entry.amountCents,
        balanceAfterCents: entry.balanceAfterCents,
        effectiveAt: entry.effectiveAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        sourceSystem: entry.sourceSystem,
        externalId: entry.externalId,
      })),
    })),
    invoices: account.invoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      totalCents: invoice.totalCents,
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      customFields: invoice.customFields,
    })),
    agencyLedgerEntries: account.ledgerEntries,
  };
}

function buildReview(loadedPayments: LoadedPayment[]) {
  const exceptions: Array<{ paymentId: string; billingAccountId: string; reason: string }> = [];
  const accountPayments = new Map<string, LoadedPayment[]>();
  let alreadyAppliedPaymentCount = 0;

  for (const payment of loadedPayments) {
    if (!payment.billingAccount || !payment.billingAccount.family.centerId) {
      exceptions.push({ paymentId: payment.id, billingAccountId: payment.billingAccountId, reason: "missing_family_or_center" });
      continue;
    }
    if (!payment.paidAt) {
      exceptions.push({ paymentId: payment.id, billingAccountId: payment.billingAccountId, reason: "missing_paid_at" });
      continue;
    }
    const state = paymentState(payment);
    const referencedInvoice = payment.billingAccount.invoices.find((invoice) => {
      const fields = jsonRecord(invoice.customFields);
      return fields.paymentId === payment.id && invoice.status === PaymentStatus.PAID;
    });
    if (state.alreadyAppliedByCurrentFlow || referencedInvoice) {
      alreadyAppliedPaymentCount += 1;
      continue;
    }
    if (!expectedLedger(payment)) {
      exceptions.push({ paymentId: payment.id, billingAccountId: payment.billingAccountId, reason: "payment_ledger_fingerprint_mismatch" });
      continue;
    }
    if (state.reconciledCents >= payment.amountCents) {
      alreadyAppliedPaymentCount += 1;
      continue;
    }
    const list = accountPayments.get(payment.billingAccountId) ?? [];
    list.push(payment);
    accountPayments.set(payment.billingAccountId, list);
  }

  const accounts = [...accountPayments.entries()].map(([billingAccountId, payments]) => {
    const account = payments[0]!.billingAccount!;
    const visibleBalanceCents = parentVisibleBillingBalanceCents({
      accountBalanceCents: account.balanceCents,
      agencyLedgerEntries: account.ledgerEntries,
    });
    const openInvoices = account.invoices.filter((invoice) => invoice.status === PaymentStatus.OPEN && invoice.totalCents > 0);
    const accountFingerprint = fingerprint(accountFingerprintInput(account, payments));
    const plan = planHistoricalOfflineInvoiceReconciliation({
      visibleBalanceCents,
      payments: payments.map((payment) => {
        const state = paymentState(payment);
        const ledger = expectedLedger(payment)!;
        return {
          id: payment.id,
          amountCents: payment.amountCents - state.reconciledCents,
          postedAt: ledger.createdAt.toISOString(),
        };
      }),
      invoices: openInvoices.map((invoice) => ({
        id: invoice.id,
        totalCents: invoice.totalCents,
        dueAt: invoice.dueDate.toISOString(),
        createdAt: invoice.createdAt.toISOString(),
      })),
    });
    return {
      billingAccountId,
      familyId: account.family.id,
      familyName: account.family.name,
      centerId: account.family.centerId!,
      balanceCents: account.balanceCents,
      visibleBalanceCents,
      accountFingerprint,
      paymentIds: payments.map((payment) => payment.id),
      plan,
    };
  }).sort((left, right) => left.centerId.localeCompare(right.centerId) || left.familyName.localeCompare(right.familyName) || left.billingAccountId.localeCompare(right.billingAccountId));

  const actionableAccounts = accounts.filter((account) => account.plan.closures.length > 0);
  const fleetFingerprint = fingerprint({
    version: RECONCILIATION_VERSION,
    accounts: actionableAccounts.map((account) => ({ accountFingerprint: account.accountFingerprint, plan: account.plan })),
  });
  return { loadedPaymentCount: loadedPayments.length, alreadyAppliedPaymentCount, exceptions, accounts, actionableAccounts, fleetFingerprint };
}

async function loadCenters(centerIds: string[]) {
  return prisma.center.findMany({
    where: { id: { in: centerIds } },
    select: { id: true, name: true, organization: { select: { tenantId: true } } },
  });
}

async function applyAccount(input: {
  preview: ReturnType<typeof buildReview>["actionableAccounts"][number];
  center: Awaited<ReturnType<typeof loadCenters>>[number];
  fleetFingerprint: string;
}) {
  const appliedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "id" = ${input.preview.billingAccountId} FOR UPDATE`);
    const freshPayments = await tx.payment.findMany({
      where: { id: { in: input.preview.paymentIds } },
      orderBy: [{ billingAccountId: "asc" }, { paidAt: "asc" }, { id: "asc" }],
      select: {
        id: true, billingAccountId: true, amountCents: true, status: true, provider: true, paidAt: true, customFields: true,
        ledgerEntries: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, billingAccountId: true, invoiceId: true, paymentId: true, type: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, sourceSystem: true, externalId: true } },
        billingAccount: {
          select: {
            id: true, balanceCents: true, family: { select: { id: true, name: true, centerId: true } },
            invoices: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, number: true, status: true, totalCents: true, dueDate: true, createdAt: true, customFields: true } },
            ledgerEntries: { where: { OR: [{ type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } }, { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM }] }, orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, invoiceId: true, type: true, sourceSystem: true, amountCents: true, effectiveAt: true, createdAt: true, externalId: true, metadata: true } },
          },
        },
      },
    });
    const freshReview = buildReview(freshPayments);
    const fresh = freshReview.actionableAccounts.find((account) => account.billingAccountId === input.preview.billingAccountId);
    if (!fresh || fresh.accountFingerprint !== input.preview.accountFingerprint || JSON.stringify(fresh.plan) !== JSON.stringify(input.preview.plan)) {
      throw new Error(`Account ${input.preview.billingAccountId} changed after preview; reconciliation aborted.`);
    }

    const paymentMap = new Map(freshPayments.map((payment) => [payment.id, payment]));
    for (const closure of fresh.plan.closures) {
      const completingPayment = paymentMap.get(closure.completedByPaymentId);
      if (!completingPayment?.paidAt) throw new Error(`Completing payment ${closure.completedByPaymentId} is unavailable.`);
      const invoice = completingPayment.billingAccount!.invoices.find((item) => item.id === closure.invoiceId);
      if (!invoice || invoice.status !== PaymentStatus.OPEN || invoice.totalCents !== closure.amountCents) {
        throw new Error(`Invoice ${closure.invoiceId} changed after preview; reconciliation aborted.`);
      }
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, billingAccountId: fresh.billingAccountId, status: PaymentStatus.OPEN, totalCents: invoice.totalCents },
        data: { status: PaymentStatus.PAID, customFields: asInputJson({
          ...jsonRecord(invoice.customFields),
          status: "paid",
          paidAt: completingPayment.paidAt.toISOString(),
          paymentId: completingPayment.id,
          paidByBalancePayment: true,
          historicalOfflineInvoiceReconciliation: {
            version: RECONCILIATION_VERSION,
            appliedAt: appliedAt.toISOString(),
            fleetFingerprint: input.fleetFingerprint,
            accountFingerprint: fresh.accountFingerprint,
          },
        }) },
      });
      if (claimed.count !== 1) throw new Error(`Invoice ${invoice.id} could not be claimed for reconciliation.`);
    }

    for (const allocation of fresh.plan.paymentAllocations) {
      if (allocation.invoiceClosureContributionCents <= 0) continue;
      const payment = paymentMap.get(allocation.paymentId)!;
      const state = paymentState(payment);
      const completedInvoiceIds = [...new Set([...state.appliedInvoiceIds, ...allocation.completedInvoiceIds])];
      const reconciledCents = state.reconciledCents + allocation.invoiceClosureContributionCents;
      await tx.payment.update({
        where: { id: payment.id },
        data: { customFields: asInputJson({
          ...state.fields,
          appliedInvoiceIds: completedInvoiceIds,
          appliedInvoiceCount: completedInvoiceIds.length,
          invoiceApplicationStatus: reconciledCents >= payment.amountCents ? "applied_to_open_invoices" : "partially_applied_to_open_invoices",
          status: "paid",
          historicalOfflineInvoiceReconciliation: {
            version: RECONCILIATION_VERSION,
            appliedAt: appliedAt.toISOString(),
            fleetFingerprint: input.fleetFingerprint,
            accountFingerprint: fresh.accountFingerprint,
            reconciledCents,
            remainingCents: payment.amountCents - reconciledCents,
            completedInvoiceIds,
          },
        }) },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: input.center.organization.tenantId,
        centerId: fresh.centerId,
        action: "billing.historical_offline_invoice_application.reconciled",
        resource: "BillingAccount",
        resourceId: fresh.billingAccountId,
        metadata: asInputJson({
          familyId: fresh.familyId,
          paymentIds: fresh.paymentIds,
          invoiceIds: fresh.plan.closures.map((closure) => closure.invoiceId),
          invoiceClosureTotalCents: fresh.plan.invoiceClosureTotalCents,
          balanceCentsBefore: fresh.balanceCents,
          balanceCentsChanged: false,
          paymentHistoryPreserved: true,
          ledgerHistoryPreserved: true,
          newPaymentCreated: false,
          fleetFingerprint: input.fleetFingerprint,
          accountFingerprint: fresh.accountFingerprint,
        }),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const summaryOnly = process.argv.includes(SUMMARY_FLAG);
  const confirmed = process.argv.includes(CONFIRM_FLAG);
  const suppliedFingerprint = process.argv.find((arg) => arg.startsWith("--confirm-fingerprint="))?.split("=")[1] ?? "";
  const before = buildReview(await loadOfflinePayments());
  const centers = await loadCenters([...new Set(before.actionableAccounts.map((account) => account.centerId))]);
  const centerMap = new Map(centers.map((center) => [center.id, center]));
  const summary = {
    loadedPaymentCount: before.loadedPaymentCount,
    alreadyAppliedPaymentCount: before.alreadyAppliedPaymentCount,
    exceptionCount: before.exceptions.length,
    reviewedAccountCount: before.accounts.length,
    actionableAccountCount: before.actionableAccounts.length,
    invoiceCount: before.actionableAccounts.reduce((total, account) => total + account.plan.closures.length, 0),
    invoiceClosureTotalCents: before.actionableAccounts.reduce((total, account) => total + account.plan.invoiceClosureTotalCents, 0),
  };

  if (!apply) {
    const accounts = summaryOnly
      ? before.actionableAccounts.map((account) => ({
          centerId: account.centerId,
          familyId: account.familyId,
          familyName: account.familyName,
          billingAccountId: account.billingAccountId,
          balanceCents: account.balanceCents,
          visibleBalanceCents: account.visibleBalanceCents,
          paymentCount: account.paymentIds.length,
          invoiceCount: account.plan.closures.length,
          invoiceClosureTotalCents: account.plan.invoiceClosureTotalCents,
        }))
      : before.actionableAccounts;
    console.log(JSON.stringify({ ok: true, mode: "preview", fingerprint: before.fleetFingerprint, summary, exceptions: before.exceptions, accounts }, null, 2));
    return;
  }
  if (!confirmed || suppliedFingerprint !== before.fleetFingerprint) {
    throw new Error(`Apply requires ${CONFIRM_FLAG} and --confirm-fingerprint=${before.fleetFingerprint}`);
  }
  if (before.exceptions.length > 0) {
    throw new Error(`Apply is blocked by ${before.exceptions.length} offline payment fingerprint exception(s).`);
  }
  for (const account of before.actionableAccounts) {
    const center = centerMap.get(account.centerId);
    if (!center) throw new Error(`Center ${account.centerId} is unavailable.`);
    await applyAccount({ preview: account, center, fleetFingerprint: before.fleetFingerprint });
  }

  const after = buildReview(await loadOfflinePayments());
  const remainingAppliedInvoiceIds = new Set(after.actionableAccounts.flatMap((account) => account.plan.closures.map((closure) => closure.invoiceId)));
  const plannedInvoiceIds = before.actionableAccounts.flatMap((account) => account.plan.closures.map((closure) => closure.invoiceId));
  const verifiedInvoices = await prisma.invoice.findMany({ where: { id: { in: plannedInvoiceIds } }, select: { id: true, status: true } });
  if (verifiedInvoices.length !== plannedInvoiceIds.length || verifiedInvoices.some((invoice) => invoice.status !== PaymentStatus.PAID) || plannedInvoiceIds.some((id) => remainingAppliedInvoiceIds.has(id))) {
    throw new Error("Post-apply verification found an invoice that was not durably reconciled.");
  }
  const balances = await prisma.billingAccount.findMany({ where: { id: { in: before.actionableAccounts.map((account) => account.billingAccountId) } }, select: { id: true, balanceCents: true } });
  const balanceMap = new Map(balances.map((account) => [account.id, account.balanceCents]));
  if (before.actionableAccounts.some((account) => balanceMap.get(account.billingAccountId) !== account.balanceCents)) {
    throw new Error("Post-apply verification found an unexpected family balance change.");
  }
  console.log(JSON.stringify({ ok: true, mode: "applied", fingerprint: before.fleetFingerprint, summary, postVerification: { paidInvoiceCount: verifiedInvoices.length, balancesUnchanged: true, remainingActionableAccountCount: after.actionableAccounts.length, remainingExceptionCount: after.exceptions.length } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
