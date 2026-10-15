import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canManageBilling, canAccessCenter, getCurrentUser } from "@/lib/auth";
import {
  addWeeksToBillingPeriod,
  BIWEEKLY_TUITION_AUTOBILL_CADENCE,
  defaultRecurringBillingPeriod,
  FOUR_WEEK_TUITION_AUTOBILL_CADENCE,
  isVoucherFundedTuitionAmount,
  normalizeBillingCadence,
  normalizeRecurringBillingDay,
  WEEKLY_TUITION_AUTOBILL_CADENCE,
  WEEKLY_TUITION_AUTOBILL_DAY,
} from "@/lib/billing-workflows";
import { lockTuitionCenter, runTuitionMutation, saveTuitionPlanInTransaction, TuitionMutationError, tuitionMutationFailure } from "@/lib/tuition-mutation";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { archivedTuitionAssignmentAllowed } from "@/lib/tuition-plan-archive";
import { normalizeTuitionAdditionalCharges, normalizeTuitionCredits, totalTuitionAdditionalChargesCents, totalTuitionCreditsCents } from "@/lib/tuition-credits";
import { childTuitionEligibilityError } from "@/lib/prospective-family-billing";
import { biweeklyCoveragePeriodBeforeRemovingDelay, resolveTuitionInvoiceDelay } from "@/lib/tuition-invoice-timing";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type CurrentBillingUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function assertChildAccess(tx: Prisma.TransactionClient, user: CurrentBillingUser, familyId: string, childId: string) {
  if (!familyId || !childId) return { ok: false as const, status: 400, error: "Family and child are required." };
  // Match recurring invoice creation's lock order. Family and child locks also
  // serialize transfers, enrollment closeout, and simultaneous assignment edits.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Family" WHERE "id" = ${familyId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Child" WHERE "id" = ${childId} FOR UPDATE`);
  const child = await tx.child.findUnique({
    where: { id: childId },
    select: {
      id: true,
      familyId: true,
      fullName: true,
      enrollmentStatus: true,
      classroomId: true,
      customFields: true,
      family: { select: { centerId: true, name: true } },
    },
  });
  if (!child || child.familyId !== familyId) {
    return { ok: false as const, status: 404, error: "Child not found for this family." };
  }
  if (!child.family.centerId || !canAccessCenter(user, child.family.centerId)) {
    return { ok: false as const, status: 403, error: "You do not have access to this family." };
  }
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BillingAccount" WHERE "familyId" = ${familyId} FOR UPDATE`);
  const center = await lockTuitionCenter(tx, user, child.family.centerId);
  return { ok: true as const, child, centerId: child.family.centerId, center };
}

async function POSTHandler(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  try {
    const result = await runTuitionMutation((tx) => saveAssignment(tx, user, body));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TuitionMutationError) {
      return NextResponse.json({ ok: false, error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    }
    throw error;
  }
}

async function saveAssignment(tx: Prisma.TransactionClient, user: CurrentBillingUser, body: Record<string, unknown>) {
  const familyId = clean(body.familyId);
  const childId = clean(body.childId);
  const enabled = body.enabled !== false && clean(body.enabled).toLowerCase() !== "false";
  const access = await assertChildAccess(tx, user, familyId, childId);
  if (!access.ok) tuitionMutationFailure(access.status, access.error);

  const existingFields = jsonObject(access.child.customFields);
  const priorHistory = Array.isArray(existingFields.tuitionAssignmentHistory)
    ? existingFields.tuitionAssignmentHistory.map(jsonObject)
    : [];
  const priorSnapshot = clean(existingFields.tuitionPlanId) && Number.isInteger(existingFields.tuitionNetAmountCents)
    ? {
        tuitionPlanId: existingFields.tuitionPlanId,
        tuitionNetAmountCents: existingFields.tuitionNetAmountCents,
        tuitionFundingType: existingFields.tuitionFundingType,
        tuitionBillingEnabled: existingFields.tuitionBillingEnabled,
        tuitionBillingDisabledReason: existingFields.tuitionBillingDisabledReason,
        tuitionBillingCadence: existingFields.tuitionBillingCadence,
        tuitionBillingDay: existingFields.tuitionBillingDay,
        tuitionBillingStartsPeriod: existingFields.tuitionBillingStartsPeriod,
        tuitionBillingInvoiceDelayWeeks: existingFields.tuitionBillingInvoiceDelayWeeks,
      }
    : null;
  const tuitionAssignmentHistory = priorSnapshot
    ? [...priorHistory.filter((item) => JSON.stringify(item) !== JSON.stringify(priorSnapshot)), priorSnapshot].slice(-50)
    : priorHistory.slice(-50);
  const description = clean(body.description);
  const tuitionPlanDraft = body.tuitionPlanDraft === undefined ? null : jsonObject(body.tuitionPlanDraft);
  if (tuitionPlanDraft && !enabled) tuitionMutationFailure(400, "A rate can only be saved together with an enabled tuition assignment.");
  const updatedBy = user.email || user.id;

  if (!enabled) {
    const updated = await tx.child.update({
      where: { id: childId },
      data: {
        customFields: {
          ...existingFields,
          tuitionAssignmentHistory,
          tuitionBillingEnabled: false,
          tuitionBillingUpdatedAt: new Date().toISOString(),
          tuitionBillingUpdatedBy: updatedBy,
        } as Prisma.InputJsonObject,
      },
      select: { id: true, fullName: true, customFields: true },
    });
    await writeAuditLog(user, {
      centerId: access.centerId,
      action: "billing.tuition_assignment.disabled",
      resource: "Child",
      resourceId: childId,
      metadata: { familyId, childId },
    }, tx);
    return { ok: true, assignment: updated.customFields };
  }

  const childEligibilityError = childTuitionEligibilityError(access.child);
  if (childEligibilityError) {
    tuitionMutationFailure(409, childEligibilityError);
  }

  const rateSave = tuitionPlanDraft
    ? await saveTuitionPlanInTransaction(tx, user, tuitionPlanDraft, { versionAssigned: true, requiredCenterId: access.centerId })
    : null;
  const tuitionPlanId = rateSave?.record.id || clean(body.tuitionPlanId);
  if (!tuitionPlanId) {
    tuitionMutationFailure(400, "Tuition plan is required when recurring billing is enabled.");
  }

  if (!rateSave) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TuitionPlan" WHERE "id" = ${tuitionPlanId} FOR UPDATE`);
  const plan = rateSave?.record || await tx.tuitionPlan.findUnique({ where: { id: tuitionPlanId } });
  if (!plan) tuitionMutationFailure(404, "Tuition plan not found.");
  if (plan.centerId !== access.centerId) {
    tuitionMutationFailure(403, "Tuition plan belongs to a different school.");
  }
  const planCenter = access.center;
  if (!planCenter || !archivedTuitionAssignmentAllowed(planCenter.customFields, plan.id, existingFields.tuitionPlanId)) {
    tuitionMutationFailure(409, "This tuition rate is archived. Restore it or choose an active rate for a new assignment.");
  }
  const planCadence = normalizeBillingCadence(plan.cadence);
  const requestedCadence = clean(body.billingCadence)
    ? normalizeBillingCadence(body.billingCadence)
    : planCadence;
  const cadence = requestedCadence === BIWEEKLY_TUITION_AUTOBILL_CADENCE
    ? BIWEEKLY_TUITION_AUTOBILL_CADENCE
    : requestedCadence === FOUR_WEEK_TUITION_AUTOBILL_CADENCE
    ? FOUR_WEEK_TUITION_AUTOBILL_CADENCE
    : requestedCadence === "monthly"
      ? "monthly"
      : WEEKLY_TUITION_AUTOBILL_CADENCE;
  if ((planCadence === "monthly" && cadence !== "monthly") || (planCadence !== "monthly" && cadence === "monthly")) {
    tuitionMutationFailure(400, "The tuition plan and assignment must use the same monthly or weekly rate cadence.");
  }
  const billingDay = cadence === "monthly"
    ? normalizeRecurringBillingDay(body.billingDay, cadence)
    : WEEKLY_TUITION_AUTOBILL_DAY;
  const previousCadenceValue = clean(existingFields.tuitionBillingCadence ?? existingFields.tuitionPlanCadence);
  const previousCadence = previousCadenceValue ? normalizeBillingCadence(previousCadenceValue) : null;
  const timing = resolveTuitionInvoiceDelay({
    requested: body.invoiceDelayWeeks, cadence, previousCadence,
    previousDelay: existingFields.tuitionBillingInvoiceDelayWeeks,
  });
  if (!timing.ok) tuitionMutationFailure(400, timing.error);
  const invoiceDelayWeeks = timing.delayWeeks;
  const previousTiming = resolveTuitionInvoiceDelay({
    requested: undefined, cadence: previousCadence, previousCadence,
    previousDelay: existingFields.tuitionBillingInvoiceDelayWeeks,
  });
  const timingChanging = previousTiming.ok && invoiceDelayWeeks !== previousTiming.delayWeeks;
  const timingChangeReason = clean(body.timingChangeReason);
  if (timingChanging && timingChangeReason.length < 5) {
    tuitionMutationFailure(400, "Enter a reason for changing invoice timing.");
  }
  const cadenceChanging = Boolean(previousCadence && previousCadence !== cadence);
  const asOf = new Date();
  const reviewTimingCoverage = !cadenceChanging && timingChanging && cadence === "biweekly" && invoiceDelayWeeks === 0;
  const savedStartPeriod = clean(existingFields.tuitionBillingStartsPeriod);
  if (reviewTimingCoverage && (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(savedStartPeriod)
    || addWeeksToBillingPeriod(savedStartPeriod, 0) !== savedStartPeriod)) {
    tuitionMutationFailure(409, "Review the saved biweekly coverage start week before changing invoice timing.");
  }
  if (cadenceChanging || reviewTimingCoverage) {
    // Protect coverage evidence even from non-serializable invoice void/edit
    // writers. Account/family locks above also serialize invoice/account inserts.
    // Legacy invoice edits lock Invoice before BillingAccount; NOWAIT makes this
    // request back off instead of deadlocking that writer while holding account.
    await tx.$queryRaw(Prisma.sql`
      SELECT "Invoice"."id" FROM "Invoice"
      JOIN "BillingAccount" ON "BillingAccount"."id" = "Invoice"."billingAccountId"
      WHERE "BillingAccount"."familyId" = ${familyId}
        AND "Invoice"."status" <> 'VOID'
        AND "Invoice"."customFields"->>'chargeSource' = 'tuitionPlan'
        AND "Invoice"."customFields"->>'childId' = ${childId}
      FOR UPDATE OF "Invoice" NOWAIT
    `);
  }
  const existingInvoices = cadenceChanging || reviewTimingCoverage ? await tx.invoice.findMany({
    where: {
      billingAccount: { familyId }, status: { not: "VOID" },
      AND: [
        { customFields: { path: ["chargeSource"], equals: "tuitionPlan" } },
        { customFields: { path: ["childId"], equals: childId } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { customFields: true },
  }) : [];
  const hasExistingTuitionCoverage = existingInvoices.some((invoice) => {
    const fields = jsonObject(invoice.customFields);
    return clean(fields.chargeSource) === "tuitionPlan" && clean(fields.childId) === childId;
  });
  if (cadenceChanging && hasExistingTuitionCoverage) {
    tuitionMutationFailure(409, "Existing non-void tuition invoice coverage must be reviewed before changing this child's billing cycle.");
  }
  const coveredPeriods = existingInvoices.flatMap((invoice) => {
    const fields = jsonObject(invoice.customFields);
    const coversBiweeklyCycle = clean(fields.chargeSource) === "tuitionPlan" && clean(fields.childId) === childId
      && (fields.mode === "recurring" || fields.mode === "manual_weekly_recovery" || fields.countsTowardRecurringCoverage === true)
      && fields.billingPeriod === fields.coverageStartsPeriod
      && fields.invoiceWeekCount === 2;
    return coversBiweeklyCycle && typeof fields.billingPeriod === "string" ? [fields.billingPeriod] : [];
  });
  const coveragePeriodAtRisk = reviewTimingCoverage
    ? biweeklyCoveragePeriodBeforeRemovingDelay(savedStartPeriod, asOf, coveredPeriods)
    : null;
  if (coveragePeriodAtRisk) {
    tuitionMutationFailure(409, `Review unbilled tuition coverage for ${coveragePeriodAtRisk} before returning to standard invoice timing. Keep the delay until its two-week invoice exists.`);
  }
  const requestedStartPeriod = defaultRecurringBillingPeriod(body.billingStartPeriod, asOf, cadence);
  const billingStartPeriod = requestedStartPeriod;
  if (timingChanging && !cadenceChanging && clean(existingFields.tuitionBillingStartsPeriod)
    && billingStartPeriod !== existingFields.tuitionBillingStartsPeriod) {
    tuitionMutationFailure(409, "Keep the saved coverage start week when changing invoice timing. Review existing tuition coverage before moving the start week.");
  }
  const updatedAt = new Date().toISOString();
  const voucherFunded = isVoucherFundedTuitionAmount(plan.amountCents);
  const tuitionCredits = normalizeTuitionCredits(body.tuitionCredits);
  const tuitionCreditsTotalCents = totalTuitionCreditsCents(tuitionCredits);
  const tuitionAdditionalCharges = normalizeTuitionAdditionalCharges(body.tuitionAdditionalCharges);
  const tuitionAdditionalChargesTotalCents = totalTuitionAdditionalChargesCents(tuitionAdditionalCharges);
  if (voucherFunded && tuitionCreditsTotalCents > 0) {
    tuitionMutationFailure(400, "Credits cannot be added to a $0 voucher-funded tuition assignment.");
  }
  if (voucherFunded && tuitionAdditionalChargesTotalCents > 0) {
    tuitionMutationFailure(400, "Additional charge lines cannot be added to a $0 voucher-funded tuition assignment.");
  }
  const tuitionGrossAmountCents = plan.amountCents + tuitionAdditionalChargesTotalCents;
  const tuitionNetAmountCents = tuitionGrossAmountCents - tuitionCreditsTotalCents;
  if (!voucherFunded && tuitionCreditsTotalCents >= tuitionGrossAmountCents) {
    tuitionMutationFailure(400, "Credits must be less than the gross recurring tuition rate.");
  }

  const updated = await (async () => {
    const updatedChild = await tx.child.update({
      where: { id: childId },
      data: {
        customFields: {
          ...existingFields,
          tuitionAssignmentHistory,
          tuitionBillingEnabled: true,
          tuitionPlanId: plan.id,
          tuitionPlanName: plan.name,
          tuitionPlanAgeGroup: plan.ageGroup,
          tuitionPlanCadence: cadence,
          tuitionBillingCadence: cadence,
          tuitionPlanAmountCents: plan.amountCents,
          tuitionAdditionalCharges,
          tuitionAdditionalChargesTotalCents,
          tuitionCredits,
          tuitionCreditsTotalCents,
          tuitionGrossAmountCents,
          tuitionNetAmountCents,
          tuitionFundingType: voucherFunded ? "voucher" : "family",
          tuitionAutobillEligible: !voucherFunded,
          tuitionBillingDay: billingDay,
          tuitionBillingStartsPeriod: billingStartPeriod,
          tuitionBillingInvoiceDelayWeeks: invoiceDelayWeeks,
          tuitionBillingDescription: description || plan.name,
          tuitionBillingUpdatedAt: updatedAt,
          tuitionBillingUpdatedBy: updatedBy,
        } as Prisma.InputJsonObject,
      },
      select: { id: true, fullName: true, customFields: true },
    });

    if (voucherFunded) {
      await tx.billingAccount.upsert({
        where: { familyId },
        update: {},
        create: {
          familyId,
          balanceCents: 0,
          autopayPlaceholder: false,
        },
      });
      return updatedChild;
    }

    const billingAccount = await tx.billingAccount.findUnique({
      where: { familyId },
      select: { customFields: true },
    });
    const accountFields = jsonObject(billingAccount?.customFields);
    const accountCustomFields = {
      ...accountFields,
      tuitionAutobillEnabled: true,
      tuitionAutobillCadence: cadence,
      tuitionAutobillBillingDay: billingDay,
      tuitionAutobillStartsPeriod: billingStartPeriod,
      tuitionBillingInvoiceDelayWeeks: invoiceDelayWeeks,
      tuitionAutobillPlanId: plan.id,
      tuitionAutobillPlanName: plan.name,
      tuitionAutobillAmountCents: plan.amountCents,
      tuitionAutobillUpdatedAt: updatedAt,
      tuitionAutobillUpdatedBy: updatedBy,
    } as Prisma.InputJsonObject;

    await tx.billingAccount.upsert({
      where: { familyId },
      update: { customFields: accountCustomFields },
      create: {
        familyId,
        balanceCents: 0,
        autopayPlaceholder: false,
        customFields: accountCustomFields,
      },
    });

    return updatedChild;
  })();

  await writeAuditLog(user, {
    centerId: access.centerId,
    action: "billing.tuition_assignment.enabled",
    resource: "Child",
    resourceId: childId,
    metadata: {
      familyId,
      childId,
      tuitionPlanId: plan.id,
      amountCents: plan.amountCents,
      tuitionCredits,
      tuitionCreditsTotalCents,
      tuitionAdditionalCharges,
      tuitionAdditionalChargesTotalCents,
      tuitionGrossAmountCents,
      tuitionNetAmountCents,
      fundingType: voucherFunded ? "voucher" : "family",
      invoicesScheduled: !voucherFunded,
      cadence,
      billingDay,
      billingStartPeriod,
      invoiceDelayWeeks,
      previousInvoiceDelayWeeks: previousTiming.ok ? previousTiming.delayWeeks : 0,
      timingChangeReason: timingChanging ? timingChangeReason : null,
      existingInvoicesUnchanged: true,
    },
  }, tx);

  if (rateSave) {
    await writeAuditLog(user, {
      centerId: access.centerId,
      action: `operations.tuitionPlan.${rateSave.rateMode}`,
      resource: "tuitionPlan",
      resourceId: rateSave.record.id,
      metadata: { mode: rateSave.rateMode },
    }, tx);
  }
  return { ok: true, assignment: updated.customFields, ...(rateSave || {}) };
}

export const POST = withApiLogging("POST", POSTHandler);
