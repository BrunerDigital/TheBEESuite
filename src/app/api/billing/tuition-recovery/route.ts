import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import {
  billingDedupeKey,
  defaultRecurringBillingPeriod,
  normalizeBillingCadence,
  normalizeWeeklyBillingPeriod,
  shouldCreateRecurringTuitionInvoice,
  tuitionInvoiceWeekCount,
  WEEKLY_TUITION_AUTOBILL_DAY,
  weeklyTuitionChargeDateForPeriod,
} from "@/lib/billing-workflows";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { normalizeTuitionCredits, totalTuitionCreditsCents, tuitionInvoiceItems } from "@/lib/tuition-credits";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

const TUITION_RECOVERY_TRANSACTION_CONCURRENCY = 5;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  const centerId = clean(body.centerId);
  if (!centerId) return NextResponse.json({ ok: false, error: "School is required." }, { status: 400 });
  if (!canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 });
  }
  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: { id: true, name: true },
  });
  if (!center) return NextResponse.json({ ok: false, error: "School not found or closed." }, { status: 404 });

  const dryRun = body.dryRun !== false;
  const requestedAsOf = clean(body.asOf);
  const asOf = requestedAsOf ? new Date(`${requestedAsOf}T12:00:00.000Z`) : new Date();
  const safeAsOf = Number.isNaN(asOf.getTime()) ? new Date() : asOf;
  const billingPeriod = normalizeWeeklyBillingPeriod(body.billingPeriod, safeAsOf);
  const previewDueChildren = typeof body.previewDueChildren === "number" && Number.isFinite(body.previewDueChildren)
    ? Math.max(0, Math.trunc(body.previewDueChildren))
    : null;

  const assignedChildren = await prisma.child.findMany({
    where: {
      ...currentlyEnrolledChildWhere(),
      customFields: { path: ["tuitionBillingEnabled"], equals: true },
      family: { is: { centerId: center.id } },
    },
    orderBy: [{ family: { name: "asc" } }, { fullName: "asc" }],
    take: 1500,
    select: {
      id: true,
      familyId: true,
      fullName: true,
      customFields: true,
      family: { select: { centerId: true, name: true } },
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
  const plans = planIds.length ? await prisma.tuitionPlan.findMany({ where: { id: { in: planIds } } }) : [];
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const dueChildren = candidateChildren.flatMap((entry) => {
    const plan = plansById.get(entry.planId);
    if (!plan || plan.centerId !== entry.child.family.centerId) return [];
    const cadence = normalizeBillingCadence(entry.fields.tuitionBillingCadence ?? plan.cadence ?? entry.fields.tuitionPlanCadence);
    if (cadence !== "weekly") return [];
    const startsPeriod = defaultRecurringBillingPeriod(clean(entry.fields.tuitionBillingStartsPeriod) || billingPeriod, safeAsOf, cadence);
    if (!shouldCreateRecurringTuitionInvoice({
      enabled: true,
      planId: entry.planId,
      amountCents: plan.amountCents ?? entry.snapshotAmountCents,
      startsPeriod,
      billingPeriod,
      billingDay: WEEKLY_TUITION_AUTOBILL_DAY,
      currentDay: WEEKLY_TUITION_AUTOBILL_DAY,
      cadence,
    })) return [];
    return [{ ...entry, cadence, billingPeriod, billingDay: WEEKLY_TUITION_AUTOBILL_DAY }];
  });

  if (!dryRun && previewDueChildren !== dueChildren.length) {
    return NextResponse.json({
      ok: false,
      error: "Preview changed before invoices were created. Run the preview again before creating invoices.",
      dueChildren: dueChildren.length,
      previewDueChildren,
    }, { status: 409 });
  }

  let created = 0;
  let skipped = 0;
  let totalCents = 0;
  const invoices: Array<{ id: string; number: string; totalCents: number; childId: string; familyId: string }> = [];
  const failures: Array<{ childId: string; familyId: string; error: string }> = [];

  if (!dryRun && dueChildren.length) {
    for (let index = 0; index < dueChildren.length; index += TUITION_RECOVERY_TRANSACTION_CONCURRENCY) {
      const batch = dueChildren.slice(index, index + TUITION_RECOVERY_TRANSACTION_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (entry) => {
        const plan = plansById.get(entry.planId);
        const description = clean(entry.fields.tuitionBillingDescription) || plan?.name || clean(entry.fields.tuitionPlanName) || "Tuition";
        const amountCents = plan?.amountCents ?? entry.snapshotAmountCents;
        const tuitionCredits = normalizeTuitionCredits(entry.fields.tuitionCredits);
        const tuitionCreditsTotalCents = totalTuitionCreditsCents(tuitionCredits);
        if (tuitionCreditsTotalCents >= amountCents) {
          throw new Error(`Weekly credits must be less than tuition for child ${entry.child.id}.`);
        }
        const invoiceWeekCount = tuitionInvoiceWeekCount(entry.cadence);
        const dueDate = weeklyTuitionChargeDateForPeriod(entry.billingPeriod);
        const dedupeKey = billingDedupeKey({
          familyId: entry.child.familyId,
          chargeSource: "tuitionPlan",
          sourceId: entry.planId,
          billingPeriod: entry.billingPeriod,
          batchTarget: "recurring-child",
          childIds: [entry.child.id],
        });
        const lineDescription = `${description} - ${entry.child.fullName}`;
        const invoiceItems = tuitionInvoiceItems({ description: lineDescription, grossAmountCents: amountCents, credits: tuitionCredits })
          .map((item) => ({ ...item, amountCents: item.amountCents * invoiceWeekCount }));

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
              mode: "manual_weekly_recovery",
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
              grossTuitionCents: amountCents * invoiceWeekCount,
              tuitionCredits,
              tuitionCreditsTotalCents: tuitionCreditsTotalCents * invoiceWeekCount,
              netTuitionCents: (amountCents - tuitionCreditsTotalCents) * invoiceWeekCount,
              dedupeKey,
              autopaySuppressed: true,
              autopaySuppressedReason: "director_manual_weekly_recovery",
              noPaymentSubmitted: true,
            },
          });
        }, { maxWait: 10_000, timeout: 30_000 });

        return {
          created: invoice.created ? 1 : 0,
          skipped: invoice.created ? 0 : 1,
          totalCents: invoice.totalCents,
          invoice: { ...invoice.invoice, childId: entry.child.id, familyId: entry.child.familyId },
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
          error: result.reason instanceof Error ? result.reason.message.slice(0, 500) : "Weekly tuition recovery invoice failed.",
        });
      }
    }

    await writeAuditLog(user, {
      centerId: center.id,
      action: failures.length ? "billing.weekly_tuition_recovery.failed" : "billing.weekly_tuition_recovery.completed",
      resource: "Invoice",
      metadata: {
        centerId: center.id,
        billingPeriod,
        created,
        skipped,
        failed: failures.length,
        totalCents,
        autopaySuppressed: true,
      },
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    dryRun,
    centerId: center.id,
    centerName: center.name,
    asOf: safeAsOf.toISOString(),
    billingPeriod,
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

export const POST = withApiLogging("POST", POSTHandler);
