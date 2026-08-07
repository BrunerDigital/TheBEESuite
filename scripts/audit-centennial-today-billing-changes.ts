import "./load-env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_NAME = "Miss Honey's Learning Center - Centennial";
const START = new Date("2026-08-07T04:00:00.000Z");
const END = new Date("2026-08-08T04:00:00.000Z");

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

async function main() {
  const center = await prisma.center.findFirstOrThrow({
    where: { name: CENTER_NAME },
    select: { id: true, name: true },
  });
  const families = await prisma.family.findMany({
    where: { centerId: center.id },
    select: { id: true, name: true, billingAccount: { select: { id: true, balanceCents: true } } },
  });
  const familyByAccount = new Map(
    families.flatMap((family) => family.billingAccount
      ? [[family.billingAccount.id, { familyId: family.id, familyName: family.name, balanceCents: family.billingAccount.balanceCents }] as const]
      : []),
  );
  const accountIds = [...familyByAccount.keys()];

  const [invoices, ledgerEntries, payments, auditLogs, children] = await Promise.all([
    prisma.invoice.findMany({
      where: { billingAccountId: { in: accountIds }, createdAt: { gte: START, lt: END } },
      select: {
        id: true,
        billingAccountId: true,
        number: true,
        status: true,
        dueDate: true,
        totalCents: true,
        sourceSystem: true,
        customFields: true,
        createdAt: true,
        items: { select: { id: true, description: true, amountCents: true } },
        ledgerEntries: { select: { id: true, type: true, amountCents: true, balanceAfterCents: true, sourceSystem: true, externalId: true, createdAt: true, metadata: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ledgerEntry.findMany({
      where: { billingAccountId: { in: accountIds }, createdAt: { gte: START, lt: END } },
      select: { id: true, billingAccountId: true, invoiceId: true, paymentId: true, type: true, description: true, amountCents: true, balanceAfterCents: true, sourceSystem: true, externalId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payment.findMany({
      where: { billingAccountId: { in: accountIds }, OR: [{ paidAt: { gte: START, lt: END } }, { ledgerEntries: { some: { createdAt: { gte: START, lt: END } } } }] },
      select: { id: true, billingAccountId: true, amountCents: true, status: true, provider: true, paidAt: true, customFields: true },
      orderBy: { paidAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { centerId: center.id, createdAt: { gte: START, lt: END } },
      select: { id: true, action: true, resource: true, resourceId: true, metadata: true, createdAt: true, user: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.child.findMany({
      where: { family: { centerId: center.id }, updatedAt: { gte: START, lt: END } },
      select: { id: true, fullName: true, updatedAt: true, customFields: true, family: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  const family = (accountId: string) => familyByAccount.get(accountId) ?? null;
  console.log(JSON.stringify({
    center,
    window: { start: START.toISOString(), end: END.toISOString() },
    invoices: invoices.map((invoice) => ({ ...invoice, family: family(invoice.billingAccountId), customFields: object(invoice.customFields) })),
    ledgerEntries: ledgerEntries.map((entry) => ({ ...entry, family: family(entry.billingAccountId), metadata: object(entry.metadata) })),
    payments: payments.map((payment) => ({ ...payment, family: family(payment.billingAccountId), customFields: object(payment.customFields) })),
    auditLogs: auditLogs.map((log) => ({ ...log, metadata: object(log.metadata) })),
    childrenUpdated: children.map((child) => ({ ...child, customFields: object(child.customFields) })),
    counts: {
      invoices: invoices.length,
      ledgerEntries: ledgerEntries.length,
      payments: payments.length,
      auditLogs: auditLogs.length,
      childrenUpdated: children.length,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
