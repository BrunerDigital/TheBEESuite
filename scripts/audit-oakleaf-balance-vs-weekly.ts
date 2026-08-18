import "./load-env";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { invoiceLedgerBalanceCents } from "@/lib/invoice-void";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function main() {
  const families = await prisma.family.findMany({
    where: { centerId: CENTER_ID, children: { some: currentlyEnrolledChildWhere() } },
    select: {
      id: true,
      name: true,
      children: {
        where: currentlyEnrolledChildWhere(),
        select: { id: true, fullName: true, customFields: true },
      },
      billingAccount: {
        select: {
          balanceCents: true,
          invoices: {
            where: { status: "OPEN" },
            select: {
              id: true,
              number: true,
              sourceSystem: true,
              externalId: true,
              totalCents: true,
              createdAt: true,
              dueDate: true,
              customFields: true,
              ledgerEntries: { select: { id: true, type: true, amountCents: true, paymentId: true } },
            },
          },
          payments: { select: { id: true, amountCents: true, status: true, provider: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = families.map((family) => {
    const weeklyCents = family.children.reduce((sum, child) => {
      const fields = object(child.customFields);
      return sum + (fields.tuitionBillingEnabled === true ? Number(fields.tuitionPlanAmountCents ?? 0) : 0);
    }, 0);
    const balanceCents = family.billingAccount?.balanceCents ?? 0;
    const openInvoiceCents = family.billingAccount?.invoices.reduce(
      (sum, invoice) => sum + invoiceLedgerBalanceCents(invoice.ledgerEntries),
      0,
    ) ?? 0;
    const balanceWithoutOpenInvoicesCents = balanceCents - openInvoiceCents;
    const classification = weeklyCents === 0
      ? (balanceCents === 0 ? "zero_rate_zero_balance" : "no_reviewed_rate_with_balance")
      : balanceCents === weeklyCents
        ? "exactly_one_week"
        : balanceCents === weeklyCents * 2
          ? "exactly_two_weeks"
          : balanceCents > weeklyCents
            ? "above_one_week"
            : "below_one_week";
    return {
      familyId: family.id,
      familyName: family.name,
      weeklyCents,
      balanceCents,
      differenceFromOneWeekCents: balanceCents - weeklyCents,
      openInvoiceCents,
      balanceWithoutOpenInvoicesCents,
      openInvoices: family.billingAccount?.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        sourceSystem: invoice.sourceSystem,
        externalId: invoice.externalId,
        totalCents: invoice.totalCents,
        createdAt: invoice.createdAt,
        dueDate: invoice.dueDate,
        billingPeriod: object(invoice.customFields).billingPeriod ?? null,
        netCents: invoiceLedgerBalanceCents(invoice.ledgerEntries),
        paymentIds: invoice.ledgerEntries.map((entry) => entry.paymentId).filter(Boolean),
      })) ?? [],
      payments: family.billingAccount?.payments ?? [],
      classification,
    };
  });

  const groups = Object.groupBy(rows, (row) => row.classification);
  console.log(JSON.stringify({
    summary: {
      currentFamilies: rows.length,
      currentBalanceCents: rows.reduce((sum, row) => sum + row.balanceCents, 0),
      oneWeekTotalCents: rows.reduce((sum, row) => sum + row.weeklyCents, 0),
      differenceFromOneWeekCents: rows.reduce((sum, row) => sum + row.differenceFromOneWeekCents, 0),
      openInvoiceCents: rows.reduce((sum, row) => sum + row.openInvoiceCents, 0),
      balanceWithoutOpenInvoicesCents: rows.reduce((sum, row) => sum + row.balanceWithoutOpenInvoicesCents, 0),
      paymentCount: rows.reduce((sum, row) => sum + row.payments.length, 0),
      classifications: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values?.length ?? 0])),
    },
    families: rows,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
