import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { tuitionPlanArchiveFields, tuitionPlanIsArchived } from "@/lib/tuition-plan-archive";
import { withApiLogging } from "@/lib/request-response-logging";

async function POSTHandler(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) return NextResponse.json({ ok: false, error: "Billing settings are not allowed for this role." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const planId = typeof body?.planId === "string" ? body.planId.trim() : "";
  const centerId = typeof body?.centerId === "string" ? body.centerId.trim() : "";
  if (!planId || !centerId || typeof body?.archived !== "boolean") return NextResponse.json({ ok: false, error: "School, tuition plan and archive state are required." }, { status: 400 });
  if (!canAccessCenter(user, centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 });
  try {
    const found = await prisma.$transaction(async tx => {
      const center = await tx.center.findFirst({ where: { id: centerId, organization: { tenantId: user.tenantId } }, select: { customFields: true } });
      const plan = await tx.tuitionPlan.findFirst({ where: { id: planId, centerId }, select: { id: true } });
      if (!center || !plan) return false;
      const before = tuitionPlanIsArchived(center.customFields, planId);
      if (before === body.archived) return true;
      await tx.center.update({ where: { id: centerId }, data: { customFields: tuitionPlanArchiveFields(center.customFields, planId, body.archived) as Prisma.InputJsonObject } });
      await writeAuditLog(user, { centerId, action: body.archived ? "billing.tuition_plan.archived" : "billing.tuition_plan.restored", resource: "TuitionPlan", resourceId: planId, metadata: { beforeArchived: before, archived: body.archived, preservesAssignments: true } }, tx);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!found) return NextResponse.json({ ok: false, error: "Tuition plan not found for this school and tenant." }, { status: 404 });
    revalidatePath("/billing");
    return NextResponse.json({ ok: true, archived: body.archived });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ ok: false, error: "The school settings changed while saving. Refresh and try again." }, { status: 409 });
    throw error;
  }
}

export const POST = withApiLogging("POST", POSTHandler);
