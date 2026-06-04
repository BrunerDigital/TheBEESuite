import { NextRequest, NextResponse } from "next/server";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import {
  billingDedupeKey,
  normalizeBillingCadence,
  normalizeBillingPeriod,
  normalizeRecurringBillingDay,
  normalizeRecurringBillingPeriod,
  recurringDueDateForPeriod,
  shouldCreateRecurringTuitionInvoice,
  utcBillingWeekday,
} from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const asOfParam = request.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const safeAsOf = Number.isNaN(asOf.getTime()) ? new Date() : asOf;
  const requestedPeriod = request.nextUrl.searchParams.get("period");
  const monthlyBillingPeriod = normalizeBillingPeriod(requestedPeriod, safeAsOf);
  const weeklyBillingPeriod = normalizeRecurringBillingPeriod(requestedPeriod, safeAsOf, "weekly");
  const currentMonthlyDay = safeAsOf.getUTCDate();
  const currentWeeklyDay = utcBillingWeekday(safeAsOf);
  const openCenters = await prisma.center.findMany({
    where: { status: { not: "closed" } },
    select: { id: true },
    take: 2000,
  });
  const openCenterIds = openCenters.map((center) => center.id);

  const assignedChildren = await prisma.child.findMany({
    where: {
      customFields: { path: ["tuitionBillingEnabled"], equals: true },
      family: { is: { centerId: { in: openCenterIds } } },
    },
    orderBy: [{ family: { name: "asc" } }, { fullName: "asc" }],
    take: 1500,
    select: {
      id: true,
      familyId: true,
      fullName: true,
      customFields: true,
      family: {
        select: {
          centerId: true,
        },
      },
    },
  });

  const candidateChildren = assignedChildren.flatMap((child) => {
    const fields = jsonObject(child.customFields);
    const planId = clean(fields.tuitionPlanId);
    const snapshotAmountCents = numeric(fields.tuitionPlanAmountCents);
    if (!child.family.centerId || !planId || snapshotAmountCents <= 0) return [];
    return [{ child, fields, planId, snapshotAmountCents }];
  });

  const planIds = Array.from(new Set(candidateChildren.map((entry) => entry.planId)));
  const plans = planIds.length
    ? await prisma.tuitionPlan.findMany({ where: { id: { in: planIds } } })
    : [];
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const dueChildren = candidateChildren.flatMap((entry) => {
    const plan = plansById.get(entry.planId);
    const cadence = normalizeBillingCadence(plan?.cadence ?? entry.fields.tuitionPlanCadence);
    const billingPeriod = cadence === "weekly" ? weeklyBillingPeriod : monthlyBillingPeriod;
    const startsPeriod = normalizeRecurringBillingPeriod(clean(entry.fields.tuitionBillingStartsPeriod) || billingPeriod, safeAsOf, cadence);
    const billingDay = normalizeRecurringBillingDay(entry.fields.tuitionBillingDay, cadence);
    const currentDay = cadence === "weekly" ? currentWeeklyDay : currentMonthlyDay;
    if (!shouldCreateRecurringTuitionInvoice({
      enabled: true,
      planId: entry.planId,
      amountCents: plan?.amountCents ?? entry.snapshotAmountCents,
      startsPeriod,
      billingPeriod,
      billingDay,
      currentDay,
    })) return [];
    return [{ ...entry, cadence, billingPeriod, billingDay }];
  });

  let created = 0;
  let skipped = 0;
  let totalCents = 0;
  const invoices: Array<{ id: string; number: string; totalCents: number; childId: string; familyId: string }> = [];

  if (!dryRun && dueChildren.length) {
    const result = await prisma.$transaction(async (tx) => {
      let transactionCreated = 0;
      let transactionSkipped = 0;
      let transactionTotalCents = 0;
      const transactionInvoices: typeof invoices = [];

      for (const entry of dueChildren) {
        const plan = plansById.get(entry.planId);
        const description = clean(entry.fields.tuitionBillingDescription) || plan?.name || clean(entry.fields.tuitionPlanName) || "Tuition";
        const amountCents = plan?.amountCents ?? entry.snapshotAmountCents;
        const dueDate = recurringDueDateForPeriod(entry.billingPeriod, entry.billingDay, entry.cadence);
        const dedupeKey = billingDedupeKey({
          familyId: entry.child.familyId,
          chargeSource: "tuitionPlan",
          sourceId: entry.planId,
          billingPeriod: entry.billingPeriod,
          batchTarget: "recurring-child",
          childIds: [entry.child.id],
        });
        const lineDescription = `${description} - ${entry.child.fullName}`;
        const invoice = await createBillingInvoiceForFamily(tx, {
          familyId: entry.child.familyId,
          dueDate,
          description: lineDescription,
          items: [{ description: lineDescription, amountCents }],
          customFields: {
            mode: "recurring",
            billingPeriod: entry.billingPeriod,
            billingCadence: entry.cadence,
            centerId: entry.child.family.centerId,
            childId: entry.child.id,
            childName: entry.child.fullName,
            chargeSource: "tuitionPlan",
            sourceId: entry.planId,
            tuitionPlanName: (plan?.name ?? clean(entry.fields.tuitionPlanName)) || null,
            tuitionPlanCadence: (plan?.cadence ?? clean(entry.fields.tuitionPlanCadence)) || entry.cadence,
            dedupeKey,
          },
        });

        if (invoice.created) {
          transactionCreated += 1;
          transactionTotalCents += invoice.totalCents;
        } else {
          transactionSkipped += 1;
        }
        transactionInvoices.push({
          ...invoice.invoice,
          childId: entry.child.id,
          familyId: entry.child.familyId,
        });
      }

      return {
        created: transactionCreated,
        skipped: transactionSkipped,
        totalCents: transactionTotalCents,
        invoices: transactionInvoices,
      };
    });
    created = result.created;
    skipped = result.skipped;
    totalCents = result.totalCents;
    invoices.push(...result.invoices);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    asOf: safeAsOf.toISOString(),
    billingPeriod: monthlyBillingPeriod,
    monthlyBillingPeriod,
    weeklyBillingPeriod,
    assignedChildren: assignedChildren.length,
    dueChildren: dueChildren.length,
    created,
    skipped: dryRun ? 0 : skipped,
    wouldCreate: dryRun ? dueChildren.length : 0,
    totalCents,
    invoices,
  });
}
