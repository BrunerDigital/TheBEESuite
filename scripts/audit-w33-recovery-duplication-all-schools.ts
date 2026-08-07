import "./load-env";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PERIOD = "2026-W33";
const SCHOOL_NAMES = [
  "Kid City USA - Beach Blvd",
  "Kid City USA - Cordera (Colorado Springs)",
  "Kid City USA - Granbury",
  "Kid City USA - Holly Hill",
  "Kid City USA - Kokomo",
  "Kid City USA - Longmont",
  "Kid City USA - Oakleaf",
  "Miss Honey's Learning Center - Centennial",
  "Miss Honey's Learning Center - Lincolnton",
];

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const centers = await prisma.center.findMany({
    where: { name: { in: SCHOOL_NAMES }, status: { not: "closed" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (centers.length !== SCHOOL_NAMES.length) {
    throw new Error(`Expected ${SCHOOL_NAMES.length} schools; found ${centers.length}.`);
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      billingAccount: { family: { centerId: { in: centers.map((center) => center.id) } } },
      customFields: { path: ["billingPeriod"], equals: PERIOD },
    },
    select: {
      id: true,
      number: true,
      status: true,
      totalCents: true,
      createdAt: true,
      customFields: true,
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          customFields: true,
          family: { select: { id: true, name: true, centerId: true } },
          payments: {
            where: { status: PaymentStatus.DRAFT },
            select: { id: true, amountCents: true, status: true, provider: true, customFields: true },
          },
        },
      },
      ledgerEntries: {
        select: {
          id: true,
          amountCents: true,
          balanceAfterCents: true,
          type: true,
          paymentId: true,
          createdAt: true,
          effectiveAt: true,
          metadata: true,
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
    orderBy: [{ createdAt: "asc" }, { number: "asc" }],
  });

  const recoveryInvoices = invoices.filter((invoice) => {
    const fields = object(invoice.customFields);
    return string(fields.recoveryManifestFingerprint).length > 0
      && fields.autopaySuppressedReason === "weekly_tuition_recovery_review"
      && fields.chargeSource === "tuitionPlan";
  });
  const paymentIds = [...new Set(recoveryInvoices.flatMap((invoice) => invoice.ledgerEntries.map((entry) => entry.paymentId).filter((id): id is string => Boolean(id))))];
  const accountIds = [...new Set(recoveryInvoices.map((invoice) => invoice.billingAccount.id))];
  const [payments, priorLedgerEntries, priorInvoices] = await Promise.all([
    prisma.payment.findMany({
      where: { id: { in: paymentIds } },
      select: { id: true, amountCents: true, status: true, provider: true, paidAt: true, customFields: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { billingAccountId: { in: accountIds }, createdAt: { lt: new Date("2026-08-07T16:14:00.000Z") } },
      select: { id: true, billingAccountId: true, type: true, description: true, amountCents: true, balanceAfterCents: true, sourceSystem: true, externalId: true, createdAt: true, metadata: true },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.invoice.findMany({
      where: {
        billingAccountId: { in: accountIds },
        createdAt: { gte: new Date("2026-08-04T00:00:00.000Z"), lt: new Date("2026-08-07T16:14:00.000Z") },
      },
      select: {
        id: true,
        billingAccountId: true,
        number: true,
        status: true,
        dueDate: true,
        totalCents: true,
        createdAt: true,
        customFields: true,
        items: { select: { description: true, amountCents: true } },
        ledgerEntries: { select: { type: true, amountCents: true, paymentId: true } },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const latestPriorLedgerByAccount = new Map<string, (typeof priorLedgerEntries)[number]>();
  for (const entry of priorLedgerEntries) {
    if (!latestPriorLedgerByAccount.has(entry.billingAccountId)) latestPriorLedgerByAccount.set(entry.billingAccountId, entry);
  }

  const output = centers.map((center) => {
    const centerInvoices = recoveryInvoices.filter((invoice) => invoice.billingAccount.family.centerId === center.id);
    const nonRecoveryInvoices = invoices.filter((invoice) => invoice.billingAccount.family.centerId === center.id && !recoveryInvoices.some((recovery) => recovery.id === invoice.id));
    const accountGroups = new Map<string, typeof centerInvoices>();
    for (const invoice of centerInvoices) {
      const group = accountGroups.get(invoice.billingAccount.id) ?? [];
      group.push(invoice);
      accountGroups.set(invoice.billingAccount.id, group);
    }
    const accounts = [...accountGroups.values()].map((group) => {
      const sortedChargeEntries = group.flatMap((invoice) => invoice.ledgerEntries
        .filter((entry) => ["invoice", "tuition_charge", "tuition_credit", "invoice_adjustment"].includes(entry.type))
        .map((entry) => ({ ...entry, invoiceId: invoice.id, invoiceNumber: invoice.number })))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const first = sortedChargeEntries[0];
      const preBatchBalanceCents = first?.balanceAfterCents === null || first?.balanceAfterCents === undefined
        ? null
        : first.balanceAfterCents - first.amountCents;
      const originalBatchChargeCents = group.reduce((sum, invoice) => sum + invoice.totalCents, 0);
      const linkedIds = [...new Set(group.flatMap((invoice) => invoice.ledgerEntries.map((entry) => entry.paymentId).filter((id): id is string => Boolean(id))))];
      return {
        billingAccountId: group[0].billingAccount.id,
        familyId: group[0].billingAccount.family.id,
        familyName: group[0].billingAccount.family.name,
        currentBalanceCents: group[0].billingAccount.balanceCents,
        billingAccountCustomFields: group[0].billingAccount.customFields,
        preBatchBalanceCents,
        originalBatchChargeCents,
        exactDoublePattern: preBatchBalanceCents === originalBatchChargeCents,
        zeroBeforeBatch: preBatchBalanceCents === 0,
        invoices: group.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          totalCents: invoice.totalCents,
          createdAt: invoice.createdAt,
          recoveryManifestFingerprint: string(object(invoice.customFields).recoveryManifestFingerprint),
          childId: string(object(invoice.customFields).childId),
          sourceId: string(object(invoice.customFields).sourceId),
          scheduledChargeDate: string(object(invoice.customFields).scheduledChargeDate),
          ledger: invoice.ledgerEntries.map((entry) => ({
            id: entry.id,
            type: entry.type,
            amountCents: entry.amountCents,
            balanceAfterCents: entry.balanceAfterCents,
            paymentId: entry.paymentId,
            createdAt: entry.createdAt,
          })),
        })),
        linkedPayments: linkedIds.map((id) => paymentById.get(id) ?? { id, missing: true }),
        draftPayments: group[0].billingAccount.payments,
        latestPriorLedger: latestPriorLedgerByAccount.get(group[0].billingAccount.id) ?? null,
        priorInvoices: priorInvoices.filter((invoice) => invoice.billingAccountId === group[0].billingAccount.id),
      };
    });
    const fingerprints = [...new Set(centerInvoices.map((invoice) => string(object(invoice.customFields).recoveryManifestFingerprint)))];
    return {
      centerId: center.id,
      school: center.name,
      recoveryInvoiceCount: centerInvoices.length,
      recoveryInvoiceCents: centerInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      statusCounts: Object.fromEntries([...new Set(centerInvoices.map((invoice) => invoice.status))].map((status) => [status, centerInvoices.filter((invoice) => invoice.status === status).length])),
      fingerprints,
      createdFrom: centerInvoices[0]?.createdAt ?? null,
      createdTo: centerInvoices.at(-1)?.createdAt ?? null,
      familyCount: accounts.length,
      exactDoublePatternFamilies: accounts.filter((account) => account.exactDoublePattern).length,
      zeroBeforeBatchFamilies: accounts.filter((account) => account.zeroBeforeBatch).length,
      otherPriorBalanceFamilies: accounts.filter((account) => account.preBatchBalanceCents !== null && !account.exactDoublePattern && !account.zeroBeforeBatch).length,
      linkedPaymentCount: accounts.reduce((sum, account) => sum + account.linkedPayments.length, 0),
      linkedPaymentCents: accounts.flatMap((account) => account.linkedPayments).reduce((sum, payment) => sum + ("amountCents" in payment ? payment.amountCents : 0), 0),
      draftPaymentCount: accounts.reduce((sum, account) => sum + account.draftPayments.length, 0),
      nonRecoveryW33Invoices: nonRecoveryInvoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        familyName: invoice.billingAccount.family.name,
        status: invoice.status,
        totalCents: invoice.totalCents,
        createdAt: invoice.createdAt,
        customFields: invoice.customFields,
      })),
      accounts,
    };
  });
  console.log(JSON.stringify({ asOf: new Date().toISOString(), period: PERIOD, schools: output }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
