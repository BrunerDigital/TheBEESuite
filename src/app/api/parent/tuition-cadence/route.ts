import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import {
  BIWEEKLY_TUITION_AUTOBILL_CADENCE,
  firstUncoveredTuitionBillingPeriod,
  FOUR_WEEK_TUITION_AUTOBILL_CADENCE,
  normalizeBillingCadence,
  parentTuitionCadenceChangesDisabled,
  WEEKLY_TUITION_AUTOBILL_CADENCE,
} from "@/lib/billing-workflows";
import { getParentPortalFamilyScope } from "@/lib/parent-portal-family-scope";
import { withApiLogging } from "@/lib/request-response-logging";
import { runTuitionMutation, TuitionMutationError } from "@/lib/tuition-mutation";

export const runtime = "nodejs";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!isParentGuardian(user)) return NextResponse.json({ ok: false, error: "Parent or guardian access is required." }, { status: 403 });
  if (appReviewReservedIdentityKind(user.email)) {
    return NextResponse.json(
      { ok: false, error: "Tuition billing changes are disabled in the App Review demo workspace." },
      { status: 403 },
    );
  }

  const body = objectValue(await request.json().catch(() => ({})));
  const childId = typeof body.childId === "string" ? body.childId.trim() : "";
  const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
  const requestedCadence = normalizeBillingCadence(body.billingCadence);
  const cadence = requestedCadence === BIWEEKLY_TUITION_AUTOBILL_CADENCE
    ? BIWEEKLY_TUITION_AUTOBILL_CADENCE
    : requestedCadence === FOUR_WEEK_TUITION_AUTOBILL_CADENCE
    ? FOUR_WEEK_TUITION_AUTOBILL_CADENCE
    : requestedCadence === WEEKLY_TUITION_AUTOBILL_CADENCE
      ? WEEKLY_TUITION_AUTOBILL_CADENCE
      : null;
  if (!childId || !cadence) return NextResponse.json({ ok: false, error: "Child and billing cycle are required." }, { status: 400 });

  const scope = await getParentPortalFamilyScope(user.id, user.tenantId, familyId || null);
  if (!scope.ok) return NextResponse.json({ ok: false, error: "A single linked family is required." }, { status: 403 });
  try {
    return await runTuitionMutation(async (tx) => {
      const child = await tx.child.findFirst({
        where: { id: childId, familyId: scope.familyId },
        select: { id: true, customFields: true, family: { select: { centerId: true } } },
      });
      if (!child?.family.centerId) return NextResponse.json({ ok: false, error: "Child not found for this family." }, { status: 404 });

      const centerId = child.family.centerId;
      const center = await tx.center.findFirst({
        where: { id: centerId, organization: { tenantId: user.tenantId } },
        select: { customFields: true },
      });
      if (!center) return NextResponse.json({ ok: false, error: "School not found for this family." }, { status: 404 });
      if (parentTuitionCadenceChangesDisabled(center.customFields)) {
        return NextResponse.json({ ok: false, error: "Your school manages tuition billing cycles. Contact the school with questions." }, { status: 403 });
      }

      const fields = objectValue(child.customFields);
      if (fields.tuitionBillingEnabled !== true || typeof fields.tuitionPlanId !== "string" || !(Number(fields.tuitionPlanAmountCents) > 0)) {
        return NextResponse.json({ ok: false, error: "The school must first enable a positive weekly tuition assignment for this child." }, { status: 409 });
      }
      const previousCadence = normalizeBillingCadence(fields.tuitionBillingCadence ?? fields.tuitionPlanCadence);
      if (previousCadence === "monthly") {
        return NextResponse.json({
          ok: false,
          error: "Monthly tuition timing is managed by the school and cannot be changed to a weekly cycle from the parent portal.",
        }, { status: 409 });
      }
      const existingInvoices = previousCadence === cadence ? [] : await tx.invoice.findMany({
        where: { billingAccount: { familyId: scope.familyId }, status: { not: "VOID" } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { customFields: true },
      });
      const startsPeriod = previousCadence === cadence && typeof fields.tuitionBillingStartsPeriod === "string"
        ? fields.tuitionBillingStartsPeriod
        : firstUncoveredTuitionBillingPeriod({ invoices: existingInvoices, childId, fallbackDate: new Date() });
      const updatedAt = new Date().toISOString();
      const updatedFields = {
        ...fields,
        tuitionBillingCadence: cadence,
        tuitionBillingDay: 4,
        tuitionBillingStartsPeriod: startsPeriod,
        tuitionBillingCadenceSelectedByParent: true,
        tuitionBillingCadenceUpdatedAt: updatedAt,
        tuitionBillingCadenceUpdatedBy: user.email || user.id,
      } as Prisma.InputJsonObject;
      await tx.child.update({ where: { id: child.id }, data: { customFields: updatedFields } });
      await writeAuditLog(user, {
        centerId,
        action: "billing.tuition_cadence.parent_selected",
        resource: "Child",
        resourceId: child.id,
        metadata: { familyId: scope.familyId, childId: child.id, previousCadence, cadence, startsPeriod },
      }, tx);
      return NextResponse.json({ ok: true, cadence, startsPeriod });
    });
  } catch (error) {
    if (error instanceof TuitionMutationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = withApiLogging("POST", POSTHandler);
