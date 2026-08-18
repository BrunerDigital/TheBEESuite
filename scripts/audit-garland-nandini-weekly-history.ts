import "./load-env";

import { prisma } from "../src/lib/prisma";

const FAMILY_ID = "cms9fbxyq003r6asg3rdwmwgq";
const ACCOUNT_ID = "cmsqggt16000rla04kma3pw7q";

async function main() {
  const [family, invoices, payments, ledger, audits] = await Promise.all([
    prisma.family.findUniqueOrThrow({
      where: { id: FAMILY_ID },
      select: {
        id: true,
        name: true,
        centerId: true,
        children: { select: { id: true, fullName: true, enrollmentStatus: true, customFields: true } },
        billingAccount: { select: { id: true, balanceCents: true, customFields: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { billingAccountId: ACCOUNT_ID },
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
        items: { select: { description: true, amountCents: true } },
        ledgerEntries: { select: { id: true, paymentId: true, type: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, sourceSystem: true, externalId: true, metadata: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ createdAt: "asc" }, { number: "asc" }],
    }),
    prisma.payment.findMany({
      where: { billingAccountId: ACCOUNT_ID },
      select: { id: true, amountCents: true, status: true, provider: true, paidAt: true, externalIdPlaceholder: true, customFields: true },
      orderBy: { paidAt: "asc" },
    }),
    prisma.ledgerEntry.findMany({
      where: { billingAccountId: ACCOUNT_ID },
      select: { id: true, invoiceId: true, paymentId: true, type: true, description: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, sourceSystem: true, externalId: true, metadata: true },
      orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.auditLog.findMany({
      where: { OR: [{ resourceId: FAMILY_ID }, { resourceId: ACCOUNT_ID }, { metadata: { path: ["familyId"], equals: FAMILY_ID } }] },
      select: { id: true, action: true, resource: true, resourceId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  console.log(JSON.stringify({ asOf: new Date().toISOString(), family, invoices, payments, ledger, audits }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
