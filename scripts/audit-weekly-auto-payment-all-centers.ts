import "./load-env";

import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const START = new Date("2026-08-06T00:00:00.000Z");
const END = new Date("2026-08-19T00:00:00.000Z");
const THURSDAY_START = new Date("2026-08-13T04:00:00.000Z");
const FRIDAY_START = new Date("2026-08-14T04:00:00.000Z");
const MODES = ["autopay", "stored_method", "director_saved_method"] as const;
const AUTO_ACTIONS = [
  "billing.autopay.completed",
  "billing.autopay.payment_intent_created",
  "billing.autopay.failed",
  "billing.autopay.credit_applied",
  "billing.autopay.ignored",
  "billing.stored_method.completed",
  "billing.stored_method.payment_intent_created",
  "billing.stored_method.failed",
  "billing.stored_method.credit_applied",
  "billing.stored_method.ignored",
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
  const [payments, audits, w34Invoices] = await Promise.all([
    prisma.payment.findMany({
      where: {
        provider: "stripe",
        status: PaymentStatus.PAID,
        paidAt: { gte: START, lt: END },
        OR: MODES.map((mode) => ({ customFields: { path: ["collectionMode"], equals: mode } })),
      },
      select: {
        id: true,
        billingAccountId: true,
        amountCents: true,
        paidAt: true,
        customFields: true,
        ledgerEntries: { select: { id: true, invoiceId: true, amountCents: true, balanceAfterCents: true, externalId: true } },
        billingAccount: {
          select: {
            balanceCents: true,
            family: { select: { id: true, name: true, centerId: true } },
            invoices: {
              where: {
                OR: [
                  { customFields: { path: ["billingPeriod"], equals: "2026-W33" } },
                  { customFields: { path: ["billingPeriod"], equals: "2026-W34" } },
                  { customFields: { path: ["coverageStartsPeriod"], equals: "2026-W33" } },
                  { customFields: { path: ["coverageStartsPeriod"], equals: "2026-W34" } },
                ],
              },
              select: { id: true, number: true, status: true, totalCents: true, dueDate: true, createdAt: true, customFields: true },
              orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
      orderBy: { paidAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: AUTO_ACTIONS }, createdAt: { gte: START, lt: END } },
      select: { id: true, centerId: true, action: true, resourceId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invoice.findMany({
      where: {
        status: { not: PaymentStatus.VOID },
        OR: [
          { customFields: { path: ["billingPeriod"], equals: "2026-W34" } },
          { customFields: { path: ["coverageStartsPeriod"], equals: "2026-W34" } },
        ],
      },
      select: {
        id: true,
        status: true,
        totalCents: true,
        billingAccount: { select: { family: { select: { centerId: true } } } },
      },
    }),
  ]);

  const centerIds = [...new Set([
    ...payments.map((payment) => payment.billingAccount.family.centerId),
    ...audits.map((audit) => audit.centerId),
    ...w34Invoices.map((invoice) => invoice.billingAccount.family.centerId),
  ].filter((centerId): centerId is string => Boolean(centerId)))];
  const centers = await prisma.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } });
  const centerById = new Map(centers.map((center) => [center.id, center.name]));

  const rows = payments.map((payment) => {
    const fields = object(payment.customFields);
    const mode = string(fields.collectionMode);
    const invoiceId = string(fields.invoiceId);
    const appliedInvoiceIds = Array.isArray(fields.appliedInvoiceIds)
      ? fields.appliedInvoiceIds.filter((value): value is string => typeof value === "string")
      : [];
    const invoices = payment.billingAccount.invoices.map((invoice) => {
      const invoiceFields = object(invoice.customFields);
      return {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        totalCents: invoice.totalCents,
        billingPeriod: string(invoiceFields.billingPeriod) || string(invoiceFields.coverageStartsPeriod),
        dueDate: invoice.dueDate.toISOString(),
        createdAt: invoice.createdAt.toISOString(),
        paymentId: string(invoiceFields.paymentId),
        paidAt: string(invoiceFields.paidAt),
      };
    });
    const allocatedIds = invoiceId ? [invoiceId] : appliedInvoiceIds;
    const allocatedInvoices = invoices.filter((invoice) => allocatedIds.includes(invoice.id));
    const w33Paid = invoices.filter((invoice) => invoice.billingPeriod === "2026-W33" && invoice.status === PaymentStatus.PAID && allocatedIds.includes(invoice.id));
    const w34Open = invoices.filter((invoice) => invoice.billingPeriod === "2026-W34" && invoice.status === PaymentStatus.OPEN);
    const wrongWeekPattern = w33Paid.length > 0
      && w34Open.length > 0
      && w33Paid.reduce((sum, invoice) => sum + invoice.totalCents, 0) === w34Open.reduce((sum, invoice) => sum + invoice.totalCents, 0);
    return {
      paymentId: payment.id,
      paidAt: payment.paidAt?.toISOString() ?? null,
      paidOnThursday: Boolean(payment.paidAt && payment.paidAt >= THURSDAY_START && payment.paidAt < FRIDAY_START),
      mode,
      amountCents: payment.amountCents,
      invoiceId,
      appliedInvoiceIds,
      centerId: payment.billingAccount.family.centerId,
      centerName: payment.billingAccount.family.centerId ? centerById.get(payment.billingAccount.family.centerId) ?? "Unknown" : "Unknown",
      familyId: payment.billingAccount.family.id,
      familyName: payment.billingAccount.family.name,
      balanceCents: payment.billingAccount.balanceCents,
      allocatedInvoices,
      w33Paid,
      w34Open,
      wrongWeekPattern,
      ledger: payment.ledgerEntries,
    };
  });

  const w34ByCenter = centers.map((center) => {
    const invoices = w34Invoices.filter((invoice) => invoice.billingAccount.family.centerId === center.id);
    return {
      centerId: center.id,
      centerName: center.name,
      invoiceCount: invoices.length,
      invoiceCents: invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      openCount: invoices.filter((invoice) => invoice.status === PaymentStatus.OPEN).length,
      paidCount: invoices.filter((invoice) => invoice.status === PaymentStatus.PAID).length,
    };
  }).filter((center) => center.invoiceCount > 0);

  const auditRows = audits.map((audit) => ({
    id: audit.id,
    centerId: audit.centerId,
    centerName: audit.centerId ? centerById.get(audit.centerId) ?? "Unknown" : "Unknown",
    action: audit.action,
    resourceId: audit.resourceId,
    createdAt: audit.createdAt.toISOString(),
    metadata: audit.metadata,
  }));
  const centennial = rows.filter((row) => row.centerName.includes("Centennial"));
  const suspects = rows.filter((row) => row.wrongWeekPattern);

  const output = {
    asOf: new Date().toISOString(),
    window: { start: START.toISOString(), end: END.toISOString() },
    autoPaymentCount: rows.length,
    autoPaymentCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    modeCounts: Object.fromEntries(MODES.map((mode) => [mode, rows.filter((row) => row.mode === mode).length])),
    thursdayAutoPaymentCount: rows.filter((row) => row.paidOnThursday).length,
    suspectCount: suspects.length,
    suspectCents: suspects.reduce((sum, row) => sum + row.amountCents, 0),
    centennial,
    suspects,
    autoAuditCount: auditRows.length,
    autoAudits: auditRows,
    w34ByCenter,
  };
  if (process.argv.includes("--compact")) {
    console.log(JSON.stringify({
      asOf: output.asOf,
      autoPaymentCount: output.autoPaymentCount,
      autoPaymentCents: output.autoPaymentCents,
      modeCounts: output.modeCounts,
      thursdayAutoPaymentCount: output.thursdayAutoPaymentCount,
      suspectCount: output.suspectCount,
      suspectCents: output.suspectCents,
      suspects: output.suspects,
      centennialSummary: {
        paymentCount: centennial.length,
        paymentCents: centennial.reduce((sum, row) => sum + row.amountCents, 0),
        w33AllocatedCount: centennial.filter((row) => row.allocatedInvoices.some((invoice) => invoice.billingPeriod === "2026-W33")).length,
        w34AllocatedCount: centennial.filter((row) => row.allocatedInvoices.some((invoice) => invoice.billingPeriod === "2026-W34")).length,
        thursdayCount: centennial.filter((row) => row.paidOnThursday).length,
        wrongWeekPatternCount: centennial.filter((row) => row.wrongWeekPattern).length,
      },
      centennialPaymentsSinceW34Creation: centennial.filter((row) => row.paidAt && row.paidAt >= "2026-08-13T13:15:00.000Z").map((row) => ({
        paymentId: row.paymentId,
        paidAt: row.paidAt,
        mode: row.mode,
        amountCents: row.amountCents,
        familyName: row.familyName,
        allocatedInvoices: row.allocatedInvoices,
        w34Open: row.w34Open,
        wrongWeekPattern: row.wrongWeekPattern,
      })),
      autoActionCounts: Object.fromEntries([...new Set(auditRows.map((audit) => audit.action))].map((action) => [action, auditRows.filter((audit) => audit.action === action).length])),
      w34ByCenter: output.w34ByCenter,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
