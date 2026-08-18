import "./load-env";

import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const THURSDAY_START = new Date("2026-08-13T04:00:00.000Z");
const FRIDAY_START = new Date("2026-08-14T04:00:00.000Z");
const PERIODS = new Set(["2026-W33", "2026-W34"]);

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const payments = await prisma.payment.findMany({
    where: {
      provider: "stripe",
      status: PaymentStatus.PAID,
      paidAt: { gte: THURSDAY_START, lt: FRIDAY_START },
    },
    select: {
      id: true,
      amountCents: true,
      paidAt: true,
      customFields: true,
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          family: {
            select: {
              id: true,
              name: true,
              centerId: true,
            },
          },
          invoices: {
            where: { status: { not: PaymentStatus.VOID } },
            orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              number: true,
              status: true,
              totalCents: true,
              dueDate: true,
              createdAt: true,
              customFields: true,
              ledgerEntries: {
                select: { id: true, paymentId: true, type: true, amountCents: true, balanceAfterCents: true },
              },
            },
          },
        },
      },
      ledgerEntries: {
        select: { id: true, invoiceId: true, amountCents: true, balanceAfterCents: true, effectiveAt: true },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  const centerIds = [...new Set(payments
    .map((payment) => payment.billingAccount.family.centerId)
    .filter((centerId): centerId is string => Boolean(centerId)))];
  const centers = await prisma.center.findMany({
    where: { id: { in: centerIds } },
    select: { id: true, name: true },
  });
  const centerById = new Map(centers.map((center) => [center.id, center.name]));

  const reviewed = payments.map((payment) => {
    const paymentFields = object(payment.customFields);
    const appliedInvoiceIds = Array.isArray(paymentFields.appliedInvoiceIds)
      ? paymentFields.appliedInvoiceIds.filter((value): value is string => typeof value === "string")
      : [];
    const weeklyInvoices = payment.billingAccount.invoices
      .map((invoice) => {
        const fields = object(invoice.customFields);
        const billingPeriod = string(fields.billingPeriod) || string(fields.coverageStartsPeriod);
        return {
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          totalCents: invoice.totalCents,
          billingPeriod,
          dueDate: invoice.dueDate.toISOString(),
          createdAt: invoice.createdAt.toISOString(),
          mode: string(fields.mode),
          chargeSource: string(fields.chargeSource),
          childId: string(fields.childId),
          paymentLinked: string(fields.paymentId) === payment.id
            || appliedInvoiceIds.includes(invoice.id)
            || invoice.ledgerEntries.some((entry) => entry.paymentId === payment.id),
          ledger: invoice.ledgerEntries,
        };
      })
      .filter((invoice) => PERIODS.has(invoice.billingPeriod));

    return {
      paymentId: payment.id,
      amountCents: payment.amountCents,
      paidAt: payment.paidAt?.toISOString() ?? null,
      collectionMode: string(paymentFields.collectionMode),
      paymentScope: string(paymentFields.paymentScope),
      invoiceIdFromPayment: string(paymentFields.invoiceId),
      appliedInvoiceIds,
      account: {
        id: payment.billingAccount.id,
        balanceCents: payment.billingAccount.balanceCents,
        familyId: payment.billingAccount.family.id,
        familyName: payment.billingAccount.family.name,
        centerId: payment.billingAccount.family.centerId,
        centerName: payment.billingAccount.family.centerId
          ? centerById.get(payment.billingAccount.family.centerId) ?? "Unknown center"
          : "Unknown center",
      },
      paymentLedger: payment.ledgerEntries,
      weeklyInvoices,
    };
  });

  console.log(JSON.stringify({
    asOf: new Date().toISOString(),
    window: { start: THURSDAY_START.toISOString(), end: FRIDAY_START.toISOString() },
    paymentCount: reviewed.length,
    paymentCents: reviewed.reduce((sum, payment) => sum + payment.amountCents, 0),
    centers: [...new Set(reviewed.map((payment) => payment.account.centerName))],
    payments: reviewed,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
