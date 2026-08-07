import "./load-env";
import { prisma } from "@/lib/prisma";

const FAMILY_NAME = "Poole, Aaron Household";
const CENTER_NAME = "Kid City USA - Longmont";

async function main() {
  const center = await prisma.center.findFirstOrThrow({ where: { name: CENTER_NAME }, select: { id: true } });
  const family = await prisma.family.findFirstOrThrow({
    where: { name: FAMILY_NAME, centerId: center.id },
    select: {
      id: true,
      name: true,
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          customFields: true,
          ledgerEntries: {
            select: { id: true, invoiceId: true, paymentId: true, type: true, description: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, sourceSystem: true, externalId: true, metadata: true },
            orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
          },
          invoices: {
            select: { id: true, number: true, status: true, totalCents: true, dueDate: true, createdAt: true, customFields: true, items: { select: { description: true, amountCents: true } }, ledgerEntries: { select: { type: true, amountCents: true, paymentId: true } } },
            orderBy: { createdAt: "asc" },
          },
          payments: {
            select: { id: true, amountCents: true, status: true, provider: true, paidAt: true, customFields: true },
          },
        },
      },
    },
  });
  console.log(JSON.stringify(family, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
