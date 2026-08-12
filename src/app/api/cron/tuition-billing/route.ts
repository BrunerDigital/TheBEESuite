import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import {
  billingDedupeKey,
  defaultRecurringBillingPeriod,
  normalizeBillingCadence,
  normalizeBillingPeriod,
  normalizeRecurringBillingDay,
  recurringDueDateForPeriod,
  shouldCreateRecurringTuitionInvoice,
  tuitionInvoiceWeekCount,
  utcBillingWeekday,
  WEEKLY_TUITION_AUTOBILL_DAY,
  weeklyTuitionChargeDateForPeriod,
} from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { normalizeTuitionAdditionalCharges, normalizeTuitionCredits, totalTuitionAdditionalChargesCents, totalTuitionCreditsCents, tuitionInvoiceItems } from "@/lib/tuition-credits";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const TUITION_INVOICE_TRANSACTION_CONCURRENCY = 5;

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

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const suppressAutopay = request.nextUrl.searchParams.get("suppressAutopay") === "1";
  const requestedCadence = clean(request.nextUrl.searchParams.get("cadence")).toLowerCase();
  const cadenceScope = ["weekly", "four_week", "monthly"].includes(requestedCadence) ? requestedCadence : null;
  const asOfParam = request.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const safeAsOf = Number.isNaN(asOf.getTime()) ? new Date() : asOf;
  const requestedPeriod = request.nextUrl.searchParams.get("period");
  const monthlyBillingPeriod = normalizeBillingPeriod(requestedPeriod, safeAsOf);
  const weeklyBillingPeriod = defaultRecurringBillingPeriod(requestedPeriod, safeAsOf, "weekly");
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
      ...currentlyEnrolledChildWhere(),
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
    if (!plan || plan.centerId !== entry.child.family.centerId) return [];
    const cadence = normalizeBillingCadence(entry.fields.tuitionBillingCadence ?? plan?.cadence ?? entry.fields.tuitionPlanCadence);
    if (cadenceScope && cadence !== cadenceScope) return [];
    const billingPeriod = cadence === "weekly" || cadence === "four_week" ? weeklyBillingPeriod : monthlyBillingPeriod;
    const startsPeriod = defaultRecurringBillingPeriod(clean(entry.fields.tuitionBillingStartsPeriod) || billingPeriod, safeAsOf, cadence);
    const billingDay = cadence === "weekly" || cadence === "four_week"
      ? WEEKLY_TUITION_AUTOBILL_DAY
      : normalizeRecurringBillingDay(entry.fields.tuitionBillingDay, cadence);
    const currentDay = cadence === "weekly" || cadence === "four_week" ? currentWeeklyDay : currentMonthlyDay;
    if (!shouldCreateRecurringTuitionInvoice({
      enabled: true,
      planId: entry.planId,
      amountCents: plan?.amountCents ?? entry.snapshotAmountCents,
      startsPeriod,
      billingPeriod,
      billingDay,
      currentDay,
      cadence,
    })) return [];
    return [{ ...entry, cadence, billingPeriod, billingDay }];
  });

  let created = 0;
  let skipped = 0;
  let totalCents = 0;
  const invoices: Array<{ id: string; number: string; totalCents: number; childId: string; familyId: string }> = [];
  const failures: Array<{ childId: string; familyId: string; error: string }> = [];

  if (!dryRun && dueChildren.length) {
    for (let index = 0; index < dueChildren.length; index += TUITION_INVOICE_TRANSACTION_CONCURRENCY) {
      const batch = dueChildren.slice(index, index + TUITION_INVOICE_TRANSACTION_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (entry) => {
        const plan = plansById.get(entry.planId);
        const description = clean(entry.fields.tuitionBillingDescription) || plan?.name || clean(entry.fields.tuitionPlanName) || "Tuition";
        const amountCents = plan?.amountCents ?? entry.snapshotAmountCents;
        const tuitionAdditionalCharges = normalizeTuitionAdditionalCharges(entry.fields.tuitionAdditionalCharges);
        const tuitionAdditionalChargesTotalCents = totalTuitionAdditionalChargesCents(tuitionAdditionalCharges);
        const tuitionCredits = normalizeTuitionCredits(entry.fields.tuitionCredits);
        const tuitionCreditsTotalCents = totalTuitionCreditsCents(tuitionCredits);
        if (tuitionCreditsTotalCents >= amountCents + tuitionAdditionalChargesTotalCents) {
          throw new Error(`Weekly credits must be less than tuition for child ${entry.child.id}.`);
        }
        const invoiceWeekCount = tuitionInvoiceWeekCount(entry.cadence);
        const dueDate = entry.cadence === "weekly" || entry.cadence === "four_week"
          ? weeklyTuitionChargeDateForPeriod(entry.billingPeriod)
          : recurringDueDateForPeriod(entry.billingPeriod, entry.billingDay, entry.cadence);
        const dedupeKey = billingDedupeKey({
          familyId: entry.child.familyId,
          chargeSource: "tuitionPlan",
          sourceId: entry.planId,
          billingPeriod: entry.billingPeriod,
          batchTarget: "recurring-child",
          childIds: [entry.child.id],
        });
        const lineDescription = `${description} - ${entry.child.fullName}${invoiceWeekCount === 4 ? " (4 weeks ahead)" : ""}`;
        const invoiceItems = tuitionInvoiceItems({ description: lineDescription, grossAmountCents: amountCents, additionalCharges: tuitionAdditionalCharges, credits: tuitionCredits })
          .map((item) => ({ ...item, amountCents: item.amountCents * invoiceWeekCount }));
        const grossTuitionCents = (amountCents + tuitionAdditionalChargesTotalCents) * invoiceWeekCount;

        const invoice = await prisma.$transaction(async (tx) => {
          const equivalentInvoice = await tx.invoice.findFirst({
            where: {
              status: { not: PaymentStatus.VOID },
              billingAccount: { familyId: entry.child.familyId },
              AND: [
                { customFields: { path: ["billingPeriod"], equals: entry.billingPeriod } },
                { customFields: { path: ["childId"], equals: entry.child.id } },
                { customFields: { path: ["chargeSource"], equals: "tuitionPlan" } },
              ],
            },
            select: { id: true, number: true, totalCents: true },
          });
          if (equivalentInvoice) {
            return { invoice: equivalentInvoice, created: false as const, totalCents: 0 };
          }

          return createBillingInvoiceForFamily(tx, {
            familyId: entry.child.familyId,
            dueDate,
            description: lineDescription,
            items: invoiceItems,
            customFields: {
              mode: "recurring",
              billingPeriod: entry.billingPeriod,
              billingCadence: entry.cadence,
              scheduledChargeDate: dueDate.toISOString(),
              centerId: entry.child.family.centerId,
              childId: entry.child.id,
              childName: entry.child.fullName,
              chargeSource: "tuitionPlan",
              sourceId: entry.planId,
              tuitionPlanName: (plan?.name ?? clean(entry.fields.tuitionPlanName)) || null,
              tuitionPlanCadence: (plan?.cadence ?? clean(entry.fields.tuitionPlanCadence)) || entry.cadence,
              invoiceWeekCount,
              coverageStartsPeriod: entry.billingPeriod,
              grossTuitionCents,
              baseTuitionCents: amountCents * invoiceWeekCount,
              tuitionAdditionalCharges,
              tuitionAdditionalChargesTotalCents: tuitionAdditionalChargesTotalCents * invoiceWeekCount,
              tuitionChargeLines: invoiceItems.filter((item) => item.ledgerType === "tuition_charge").map((item) => ({
                description: item.description,
                amountCents: item.amountCents,
              })),
              tuitionCredits,
              tuitionCreditsTotalCents: tuitionCreditsTotalCents * invoiceWeekCount,
              netTuitionCents: grossTuitionCents - (tuitionCreditsTotalCents * invoiceWeekCount),
              dedupeKey,
              ...(suppressAutopay ? {
                autopaySuppressed: true,
                autopaySuppressedReason: "weekly_tuition_recovery_review",
                noPaymentSubmitted: true,
              } : {}),
            },
          });
        },
          { maxWait: 10_000, timeout: 30_000 },
        );

        return {
          created: invoice.created ? 1 : 0,
          skipped: invoice.created ? 0 : 1,
          totalCents: invoice.totalCents,
          invoice: {
            ...invoice.invoice,
            childId: entry.child.id,
            familyId: entry.child.familyId,
          },
        };
      }));

      for (const [batchIndex, result] of results.entries()) {
        if (result.status === "fulfilled") {
          created += result.value.created;
          skipped += result.value.skipped;
          totalCents += result.value.totalCents;
          invoices.push(result.value.invoice);
          continue;
        }

        const entry = batch[batchIndex];
        failures.push({
          childId: entry.child.id,
          familyId: entry.child.familyId,
          error: result.reason instanceof Error ? result.reason.message.slice(0, 500) : "Recurring tuition invoice failed.",
        });
      }
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    dryRun,
    cadenceScope,
    suppressAutopay,
    asOf: safeAsOf.toISOString(),
    billingPeriod: monthlyBillingPeriod,
    monthlyBillingPeriod,
    weeklyBillingPeriod,
    assignedChildren: assignedChildren.length,
    dueChildren: dueChildren.length,
    created,
    skipped: dryRun ? 0 : skipped,
    failed: failures.length,
    wouldCreate: dryRun ? dueChildren.length : 0,
    totalCents,
    invoices,
    failures,
  }, { status: failures.length ? 500 : 200 });
}

export const GET = withApiLogging("GET", GETHandler);
