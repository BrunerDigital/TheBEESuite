import "./load-env";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const surnames = ["Calvo", "Castillo", "Chum", "Rose", "Wenzl", "Keane", "Pastrana", "Poole", "Jensen", "Maclean", "Ortiz", "Yancy"];

function fields(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function main() {
const families = await prisma.family.findMany({
  where: { centerId: CENTER_ID, OR: surnames.flatMap((name) => [
    { name: { contains: name, mode: "insensitive" as const } },
    { children: { some: { fullName: { contains: name, mode: "insensitive" as const } } } },
  ]) },
  select: {
    id: true, name: true, children: { select: { id: true, fullName: true } },
    billingAccount: {
      select: {
        id: true, balanceCents: true,
        invoices: {
          where: { createdAt: { gte: new Date("2026-08-13T00:00:00Z"), lt: new Date("2026-08-15T00:00:00Z") } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, number: true, status: true, totalCents: true, createdAt: true, customFields: true,
            ledgerEntries: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, type: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, externalId: true, sourceSystem: true, paymentId: true } } },
        },
        payments: { where: { paidAt: { gte: new Date("2026-08-13T00:00:00Z") } }, orderBy: [{ paidAt: "asc" }], select: { id: true, amountCents: true, status: true, provider: true, paidAt: true, customFields: true } },
      },
    },
  },
  orderBy: { name: "asc" },
});

const result = families.map((family) => ({
  familyId: family.id,
  familyName: family.name,
  children: family.children,
  billingAccountId: family.billingAccount?.id,
  balanceCents: family.billingAccount?.balanceCents,
  invoices: family.billingAccount?.invoices.map((invoice) => ({
    ...invoice,
    billingPeriod: fields(invoice.customFields).billingPeriod,
    childId: fields(invoice.customFields).childId,
    voidReason: fields(invoice.customFields).voidReason,
  })),
  laterPayments: family.billingAccount?.payments,
}));

console.log(JSON.stringify({ asOf: new Date().toISOString(), requested: surnames, matched: result.length, result }, null, 2));
}

main().finally(() => prisma.$disconnect());
