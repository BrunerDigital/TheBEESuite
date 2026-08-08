import "./load-env";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const TARGETS = [
  ["Anna Finesilver Family", "Evelyn parish"],
  ["Anna Finesilver Family", "Korbin Parish"],
  ["Caylah Courtenay Family", "Noir Harris"],
  ["Delon Jenkins Family", "Charli mickens"],
  ["Genesis Vicente Rio Family", "Mya Acevedo Vicente"],
  ["Mikevia Richardson Family", "Ariah Anderson"],
  ["Mikevia Richardson Family", "Gregory Anderson"],
  ["Nyasia Smith Family", "Aiden A Taylor"],
] as const;

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

async function main() {
  const center = await prisma.center.findUnique({
    where: { id: CENTER_ID },
    select: { id: true, name: true, status: true, customFields: true },
  });
  if (center?.name !== CENTER_NAME) throw new Error("Oakleaf center identity changed.");
  const families = await prisma.family.findMany({
    where: { centerId: CENTER_ID, name: { in: [...new Set(TARGETS.map(([family]) => family))] } },
    select: {
      id: true,
      name: true,
      children: {
        select: {
          id: true,
          fullName: true,
          enrollmentStatus: true,
          classroomId: true,
          customFields: true,
        },
        orderBy: { fullName: "asc" },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          customFields: true,
          invoices: {
            where: { status: { not: PaymentStatus.VOID } },
            select: { id: true, number: true, status: true, totalCents: true, dueDate: true, customFields: true },
            orderBy: { createdAt: "desc" },
          },
          payments: {
            select: { id: true, status: true, amountCents: true, provider: true, customFields: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const plans = await prisma.tuitionPlan.findMany({
    where: { centerId: CENTER_ID, amountCents: { in: [6_987, 9_750] } },
    select: { id: true, name: true, amountCents: true, cadence: true, ageGroup: true },
    orderBy: [{ amountCents: "asc" }, { id: "asc" }],
  });

  console.log(JSON.stringify({
    asOf: new Date().toISOString(),
    center: center ? { ...center, customFields: object(center.customFields) } : null,
    targetCount: TARGETS.length,
    families: families.map((family) => ({
      ...family,
      children: family.children.map((child) => ({ ...child, customFields: object(child.customFields) })),
      billingAccount: family.billingAccount ? {
        ...family.billingAccount,
        customFields: object(family.billingAccount.customFields),
        invoices: family.billingAccount.invoices.map((invoice) => ({ ...invoice, customFields: object(invoice.customFields) })),
        payments: family.billingAccount.payments.map((payment) => ({ ...payment, customFields: object(payment.customFields) })),
      } : null,
    })),
    matchingPlans: plans,
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
