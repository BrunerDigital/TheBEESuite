import "./load-env";
import { PaymentStatus, Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { normalizeTuitionCredits, totalTuitionCreditsCents } from "@/lib/tuition-credits";

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

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

async function main() {
  const schools = await prisma.center.findMany({
    where: { name: { in: SCHOOL_NAMES }, status: { not: "closed" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (schools.length !== SCHOOL_NAMES.length) throw new Error(`Expected ${SCHOOL_NAMES.length} schools; found ${schools.length}.`);

  const children = await prisma.child.findMany({
    where: {
      ...currentlyEnrolledChildWhere(),
      family: { is: { centerId: { in: schools.map((school) => school.id) } } },
    },
    select: {
      id: true,
      fullName: true,
      customFields: true,
      family: {
        select: {
          id: true,
          name: true,
          centerId: true,
          billingAccount: { select: { id: true, balanceCents: true } },
        },
      },
    },
    orderBy: [{ family: { name: "asc" } }, { fullName: "asc" }],
  });

  const planIds = [...new Set(children.map((child) => string(object(child.customFields).tuitionPlanId)).filter(Boolean))];
  const plans = await prisma.tuitionPlan.findMany({ where: { id: { in: planIds } } });
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const familyIds = [...new Set(children.map((child) => child.family.id))];
  const invoices = await prisma.invoice.findMany({
    where: {
      billingAccount: { familyId: { in: familyIds } },
      status: { not: PaymentStatus.VOID },
    },
    select: {
      id: true,
      number: true,
      status: true,
      totalCents: true,
      customFields: true,
      billingAccount: { select: { familyId: true } },
      items: { select: { amountCents: true } },
      ledgerEntries: { select: { type: true, amountCents: true } },
    },
  });
  const w33Invoices = invoices.filter((invoice) => {
    const fields = object(invoice.customFields);
    return fields.billingPeriod === PERIOD || fields.coverageStartsPeriod === PERIOD;
  });

  const accountIds = [...new Set(children.map((child) => child.family.billingAccount?.id).filter((id): id is string => Boolean(id)))];
  const latestLedger = await prisma.ledgerEntry.findMany({
    where: { billingAccountId: { in: accountIds }, balanceAfterCents: { not: null } },
    select: { billingAccountId: true, balanceAfterCents: true, effectiveAt: true, createdAt: true },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
  const latestBalanceByAccount = new Map<string, number>();
  for (const entry of latestLedger) {
    if (!latestBalanceByAccount.has(entry.billingAccountId) && entry.balanceAfterCents !== null) {
      latestBalanceByAccount.set(entry.billingAccountId, entry.balanceAfterCents);
    }
  }

  const output = schools.map((school) => {
    const schoolChildren = children.filter((child) => child.family.centerId === school.id);
    const exact: string[] = [];
    const missingInvoice: string[] = [];
    const conflictingInvoice: string[] = [];
    const future: string[] = [];
    const zero: string[] = [];
    const unconfigured: string[] = [];
    const assignmentPlanDrift: string[] = [];

    for (const child of schoolChildren) {
      const fields = object(child.customFields);
      const planId = string(fields.tuitionPlanId);
      const plan = plansById.get(planId);
      const cadence = string(fields.tuitionBillingCadence || plan?.cadence || fields.tuitionPlanCadence).toLowerCase();
      const enabled = fields.tuitionBillingEnabled === true;
      const snapshotAmount = number(fields.tuitionPlanAmountCents);
      const amountCents = plan?.amountCents ?? snapshotAmount;
      const startPeriod = string(fields.tuitionBillingStartsPeriod) || PERIOD;
      const label = `${child.family.name} — ${child.fullName}`;
      const childInvoices = w33Invoices.filter((invoice) => {
        const invoiceFields = object(invoice.customFields);
        return invoice.billingAccount.familyId === child.family.id
          && invoiceFields.childId === child.id
          && invoiceFields.chargeSource === "tuitionPlan";
      });

      if (enabled && plan && plan.centerId === school.id && cadence === "weekly" && amountCents === 0) {
        zero.push(label);
        continue;
      }
      if (!(enabled && plan && plan.centerId === school.id && cadence === "weekly" && amountCents > 0)) {
        unconfigured.push(label);
        continue;
      }
      if (snapshotAmount !== plan.amountCents) {
        assignmentPlanDrift.push(`${label} (saved $${(snapshotAmount / 100).toFixed(2)}; plan $${(plan.amountCents / 100).toFixed(2)})`);
      }
      if (startPeriod > PERIOD) {
        future.push(`${label} (${startPeriod})`);
        continue;
      }

      const credits = totalTuitionCreditsCents(normalizeTuitionCredits(fields.tuitionCredits));
      const expected = amountCents - credits;
      if (childInvoices.length === 0) {
        missingInvoice.push(`${label} ($${(expected / 100).toFixed(2)})`);
        continue;
      }
      const invoice = childInvoices[0];
      const itemTotal = invoice.items.reduce((sum, item) => sum + item.amountCents, 0);
      const chargeLedgerTotal = invoice.ledgerEntries
        .filter((entry) => ["invoice", "tuition_charge", "tuition_credit", "invoice_adjustment"].includes(entry.type))
        .reduce((sum, entry) => sum + entry.amountCents, 0);
      if (childInvoices.length !== 1 || expected <= 0 || invoice.totalCents !== expected || itemTotal !== invoice.totalCents || chargeLedgerTotal !== invoice.totalCents) {
        conflictingInvoice.push(`${label} (expected $${(expected / 100).toFixed(2)}; invoice count ${childInvoices.length}; invoices ${childInvoices.map((item) => `${item.number} $${(item.totalCents / 100).toFixed(2)} items $${(item.items.reduce((sum, line) => sum + line.amountCents, 0) / 100).toFixed(2)} charge-ledger $${(item.ledgerEntries.filter((entry) => ["invoice", "tuition_charge", "tuition_credit", "invoice_adjustment"].includes(entry.type)).reduce((sum, entry) => sum + entry.amountCents, 0) / 100).toFixed(2)}`).join(", ")})`);
      } else {
        exact.push(label);
      }
    }

    const schoolAccountIds = [...new Set(schoolChildren.map((child) => child.family.billingAccount?.id).filter((id): id is string => Boolean(id)))];
    const accountBalanceMismatches = schoolAccountIds.filter((accountId) => {
      const account = schoolChildren.find((child) => child.family.billingAccount?.id === accountId)?.family.billingAccount;
      const latest = latestBalanceByAccount.get(accountId);
      return account && latest !== undefined && account.balanceCents !== latest;
    }).length;

    return {
      school: school.name,
      currentChildren: schoolChildren.length,
      exactW33PositiveInvoices: exact.length,
      enabledZeroResponsibility: zero.length,
      futureStart: future,
      missingW33PositiveInvoice: missingInvoice,
      conflictingW33Invoice: conflictingInvoice,
      assignmentPlanDrift,
      remainingUnconfiguredFamilies: [...new Set(unconfigured.map((label) => label.split(" — ")[0]))].length,
      remainingUnconfiguredChildren: unconfigured,
      accountBalanceMismatches,
    };
  });

  console.log(JSON.stringify({
    asOf: new Date().toISOString(),
    period: PERIOD,
    schools: output,
    totals: {
      currentChildren: output.reduce((sum, school) => sum + school.currentChildren, 0),
      exactW33PositiveInvoices: output.reduce((sum, school) => sum + school.exactW33PositiveInvoices, 0),
      enabledZeroResponsibility: output.reduce((sum, school) => sum + school.enabledZeroResponsibility, 0),
      missingW33PositiveInvoice: output.reduce((sum, school) => sum + school.missingW33PositiveInvoice.length, 0),
      conflictingW33Invoice: output.reduce((sum, school) => sum + school.conflictingW33Invoice.length, 0),
      assignmentPlanDrift: output.reduce((sum, school) => sum + school.assignmentPlanDrift.length, 0),
      remainingUnconfiguredFamilies: output.reduce((sum, school) => sum + school.remainingUnconfiguredFamilies, 0),
      accountBalanceMismatches: output.reduce((sum, school) => sum + school.accountBalanceMismatches, 0),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
