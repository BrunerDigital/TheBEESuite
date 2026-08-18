import "./load-env";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const familyNames = [
  "Abigail Brown Family", "Barnhart Family", "Bernadette Mckenzie Family", "Chelsia Kirksey Family",
  "Lamarriel Johnson Family", "Michelle Quarles Family", "Noura Elofir Family", "Sharon ` Hall Family",
  "Alexus Brown Family", "Altavia James Family", "Amber Petti Family", "Amire Shakir-Fulford Family",
  "Asia Collins Family", "Brandi Ordu Family", "Britney Meadows Family", "Bryonna Ridley Family",
  "Carson Brown Family", "Delsheka Brown Family", "Denise Moya Family", "Dominique Jackson Family",
  "Gabriel sharp Family", "Jamese Touze Family", "Jania Finklea Family", "Katryna Rhymer Family",
  "Kiana *Cook Family", "Marianne Carrion Family", "Rut Avraham Family", "Savannah Hube Family",
  "Thanh Van Tran Family", "Tyler Ramirez Family", "Victoria Williams Family",
];

async function main() {
  const [classrooms, families, audits] = await Promise.all([
    prisma.classroom.findMany({ where: { centerId: CENTER_ID }, select: { id: true, name: true } }),
    prisma.family.findMany({ where: { centerId: CENTER_ID, name: { in: familyNames } }, select: {
      id: true, name: true, externalId: true,
      children: { select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, ageGroup: true, customFields: true } },
      guardians: { select: { id: true, fullName: true, email: true, userId: true, customFields: true, user: { select: { id: true, email: true, isActive: true, role: true, mustResetPassword: true } } } },
      billingAccount: { select: { id: true, balanceCents: true, customFields: true,
        invoices: { select: { id: true, number: true, status: true, totalCents: true, dueDate: true, sourceSystem: true, externalId: true, customFields: true, ledgerEntries: { select: { id: true, type: true, amountCents: true, balanceAfterCents: true, externalId: true, sourceSystem: true, metadata: true, createdAt: true }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
      } },
    }, orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({ where: { centerId: CENTER_ID, action: { in: ["billing.oakleaf_reviewed_weekly_rate_corrected", "billing.oakleaf_withdrawn_roster_corrected"] } }, select: { id: true, action: true, resourceId: true, metadata: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
  ]);
  console.log(JSON.stringify({ classrooms, audits, families }, null, 2));
}
main().finally(() => prisma.$disconnect());
