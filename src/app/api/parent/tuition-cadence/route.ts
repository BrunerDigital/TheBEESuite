import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import {
  defaultRecurringBillingPeriod,
  FOUR_WEEK_TUITION_AUTOBILL_CADENCE,
  normalizeBillingCadence,
  WEEKLY_TUITION_AUTOBILL_CADENCE,
} from "@/lib/billing-workflows";
import { getParentPortalFamilyScope } from "@/lib/parent-portal-family-scope";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!isParentGuardian(user)) return NextResponse.json({ ok: false, error: "Parent or guardian access is required." }, { status: 403 });

  const body = objectValue(await request.json().catch(() => ({})));
  const childId = typeof body.childId === "string" ? body.childId.trim() : "";
  const requestedCadence = normalizeBillingCadence(body.billingCadence);
  const cadence = requestedCadence === FOUR_WEEK_TUITION_AUTOBILL_CADENCE
    ? FOUR_WEEK_TUITION_AUTOBILL_CADENCE
    : requestedCadence === WEEKLY_TUITION_AUTOBILL_CADENCE
      ? WEEKLY_TUITION_AUTOBILL_CADENCE
      : null;
  if (!childId || !cadence) return NextResponse.json({ ok: false, error: "Child and billing cycle are required." }, { status: 400 });

  const scope = await getParentPortalFamilyScope(user.id);
  if (!scope.ok) return NextResponse.json({ ok: false, error: "A single linked family is required." }, { status: 403 });
  const child = await prisma.child.findFirst({
    where: { id: childId, familyId: scope.familyId },
    select: { id: true, fullName: true, customFields: true, family: { select: { centerId: true } } },
  });
  if (!child?.family.centerId) return NextResponse.json({ ok: false, error: "Child not found for this family." }, { status: 404 });

  const fields = objectValue(child.customFields);
  if (fields.tuitionBillingEnabled !== true || typeof fields.tuitionPlanId !== "string" || !(Number(fields.tuitionPlanAmountCents) > 0)) {
    return NextResponse.json({ ok: false, error: "The school must first enable a positive weekly tuition assignment for this child." }, { status: 409 });
  }
  const previousCadence = normalizeBillingCadence(fields.tuitionBillingCadence ?? fields.tuitionPlanCadence);
  const startsPeriod = previousCadence === cadence && typeof fields.tuitionBillingStartsPeriod === "string"
    ? fields.tuitionBillingStartsPeriod
    : defaultRecurringBillingPeriod(null, new Date(), cadence);
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
  await prisma.child.update({ where: { id: child.id }, data: { customFields: updatedFields } });
  await writeAuditLog(user, {
    centerId: child.family.centerId,
    action: "billing.tuition_cadence.parent_selected",
    resource: "Child",
    resourceId: child.id,
    metadata: { familyId: scope.familyId, childId: child.id, previousCadence, cadence, startsPeriod },
  });
  return NextResponse.json({ ok: true, cadence, startsPeriod });
}

export const POST = withApiLogging("POST", POSTHandler);
