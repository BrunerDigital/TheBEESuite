import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canManageBilling, canAccessCenter, getCurrentUser } from "@/lib/auth";
import { normalizeBillingDay, normalizeBillingPeriod } from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";

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

export async function POST(request: NextRequest) {
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
  const billingDay = normalizeBillingDay(body.billingDay);
  const billingStartPeriod = normalizeBillingPeriod(body.billingStartPeriod, new Date());
  const description = clean(body.description);
  const tuitionPlanId = clean(body.tuitionPlanId);

  if (!enabled) {
    const updated = await prisma.child.update({
      where: { id: childId },
      data: {
        customFields: {
          ...existingFields,
          tuitionBillingEnabled: false,
          tuitionBillingUpdatedAt: new Date().toISOString(),
          tuitionBillingUpdatedBy: user.email,
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

  const updated = await prisma.child.update({
    where: { id: childId },
    data: {
      customFields: {
        ...existingFields,
        tuitionBillingEnabled: true,
        tuitionPlanId: plan.id,
        tuitionPlanName: plan.name,
        tuitionPlanAgeGroup: plan.ageGroup,
        tuitionPlanCadence: plan.cadence,
        tuitionPlanAmountCents: plan.amountCents,
        tuitionBillingDay: billingDay,
        tuitionBillingStartsPeriod: billingStartPeriod,
        tuitionBillingDescription: description || plan.name,
        tuitionBillingUpdatedAt: new Date().toISOString(),
        tuitionBillingUpdatedBy: user.email,
      } as Prisma.InputJsonObject,
    },
    select: { id: true, fullName: true, customFields: true },
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
      billingDay,
      billingStartPeriod,
    },
  });

  return NextResponse.json({ ok: true, assignment: updated.customFields });
}
