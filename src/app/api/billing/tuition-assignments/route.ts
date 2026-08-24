import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canManageBilling, canAccessCenter, getCurrentUser } from "@/lib/auth";
import {
  BIWEEKLY_TUITION_AUTOBILL_CADENCE,
  defaultRecurringBillingPeriod,
  FOUR_WEEK_TUITION_AUTOBILL_CADENCE,
  isVoucherFundedTuitionAmount,
  normalizeBillingCadence,
  normalizeRecurringBillingDay,
  WEEKLY_TUITION_AUTOBILL_CADENCE,
  WEEKLY_TUITION_AUTOBILL_DAY,
} from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";
import { normalizeTuitionAdditionalCharges, normalizeTuitionCredits, totalTuitionAdditionalChargesCents, totalTuitionCreditsCents } from "@/lib/tuition-credits";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type CurrentBillingUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function assertChildAccess(user: CurrentBillingUser, familyId: string, childId: string) {
  if (!familyId || !childId) return { ok: false as const, status: 400, error: "Family and child are required." };
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: {
      id: true,
      familyId: true,
      fullName: true,
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
  return { ok: true as const, child, centerId: child.family.centerId };
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  const familyId = clean(body.familyId);
  const childId = clean(body.childId);
  const enabled = body.enabled !== false && clean(body.enabled).toLowerCase() !== "false";
  const access = await assertChildAccess(user, familyId, childId);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const existingFields = jsonObject(access.child.customFields);
  const description = clean(body.description);
  const tuitionPlanId = clean(body.tuitionPlanId);
  const updatedBy = user.email || user.id;

  if (!enabled) {
    const updated = await prisma.child.update({
      where: { id: childId },
      data: {
        customFields: {
          ...existingFields,
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
    });
    return NextResponse.json({ ok: true, assignment: updated.customFields });
  }

  if (!tuitionPlanId) {
    return NextResponse.json({ ok: false, error: "Tuition plan is required when recurring billing is enabled." }, { status: 400 });
  }

  const plan = await prisma.tuitionPlan.findUnique({ where: { id: tuitionPlanId } });
  if (!plan) return NextResponse.json({ ok: false, error: "Tuition plan not found." }, { status: 404 });
  if (plan.centerId !== access.centerId) {
    return NextResponse.json({ ok: false, error: "Tuition plan belongs to a different school." }, { status: 403 });
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
    return NextResponse.json({ ok: false, error: "The tuition plan and assignment must use the same monthly or weekly rate cadence." }, { status: 400 });
  }
  const billingDay = cadence === "monthly"
    ? normalizeRecurringBillingDay(body.billingDay, cadence)
    : WEEKLY_TUITION_AUTOBILL_DAY;
  const previousCadenceValue = clean(existingFields.tuitionBillingCadence ?? existingFields.tuitionPlanCadence);
  const previousCadence = previousCadenceValue ? normalizeBillingCadence(previousCadenceValue) : null;
  const cadenceChanging = Boolean(previousCadence && previousCadence !== cadence);
  const existingInvoices = cadenceChanging ? await prisma.invoice.findMany({
    where: { billingAccount: { familyId }, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { customFields: true },
  }) : [];
  const hasExistingTuitionCoverage = existingInvoices.some((invoice) => {
    const fields = jsonObject(invoice.customFields);
    return clean(fields.chargeSource) === "tuitionPlan" && clean(fields.childId) === childId;
  });
  if (hasExistingTuitionCoverage) {
    return NextResponse.json({
      ok: false,
      error: "Existing non-void tuition invoice coverage must be reviewed before changing this child's billing cycle.",
    }, { status: 409 });
  }
  const requestedStartPeriod = defaultRecurringBillingPeriod(body.billingStartPeriod, new Date(), cadence);
  const billingStartPeriod = requestedStartPeriod;
  const updatedAt = new Date().toISOString();
  const voucherFunded = isVoucherFundedTuitionAmount(plan.amountCents);
  const tuitionCredits = normalizeTuitionCredits(body.tuitionCredits);
  const tuitionCreditsTotalCents = totalTuitionCreditsCents(tuitionCredits);
  const tuitionAdditionalCharges = normalizeTuitionAdditionalCharges(body.tuitionAdditionalCharges);
  const tuitionAdditionalChargesTotalCents = totalTuitionAdditionalChargesCents(tuitionAdditionalCharges);
  if (voucherFunded && tuitionCreditsTotalCents > 0) {
    return NextResponse.json({ ok: false, error: "Credits cannot be added to a $0 voucher-funded tuition assignment." }, { status: 400 });
  }
  if (voucherFunded && tuitionAdditionalChargesTotalCents > 0) {
    return NextResponse.json({ ok: false, error: "Additional charge lines cannot be added to a $0 voucher-funded tuition assignment." }, { status: 400 });
  }
  const tuitionGrossAmountCents = plan.amountCents + tuitionAdditionalChargesTotalCents;
  const tuitionNetAmountCents = tuitionGrossAmountCents - tuitionCreditsTotalCents;
  if (!voucherFunded && tuitionCreditsTotalCents >= tuitionGrossAmountCents) {
    return NextResponse.json({ ok: false, error: "Credits must be less than the gross recurring tuition rate." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedChild = await tx.child.update({
      where: { id: childId },
      data: {
        customFields: {
          ...existingFields,
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
  });

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
    },
  });

  return NextResponse.json({ ok: true, assignment: updated.customFields });
}

export const POST = withApiLogging("POST", POSTHandler);
