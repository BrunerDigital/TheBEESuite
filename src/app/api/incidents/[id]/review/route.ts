import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function reviewStatus(value: unknown) {
  const next = clean(value);
  return ["pending", "reviewed", "needs_follow_up", "closed"].includes(next) ? next : "reviewed";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Incident review is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const incident = await prisma.incidentReport.findUnique({
    where: { id },
    include: {
      child: { select: { familyId: true, family: { select: { centerId: true } } } },
      classroom: { select: { centerId: true } },
    },
  });
  if (!incident) {
    return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });
  }

  const centerId = incident.classroom?.centerId ?? incident.child.family.centerId;
  const accessGuard = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Incident",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = reviewStatus(body.adminReviewStatus);
  const followUpTask = clean(body.followUpTask);
  const parentNotified = body.parentNotified === undefined ? incident.parentNotified : Boolean(body.parentNotified);
  const existingTasks = Array.isArray(incident.followUpTasks)
    ? incident.followUpTasks.filter((item): item is string => typeof item === "string")
    : [];

  const updated = await prisma.incidentReport.update({
    where: { id },
    data: {
      adminReviewStatus: status,
      parentNotified,
      followUpTasks: followUpTask ? [...existingTasks, followUpTask] : existingTasks,
    },
  });
  const complianceTask = followUpTask && centerId
    ? await prisma.complianceTask.create({
        data: {
          centerId,
          title: followUpTask,
          category: "incident",
          priority: status === "needs_follow_up" ? "high" : "normal",
          status: "open",
          createdById: user.id,
          relatedResourceType: "IncidentReport",
          relatedResourceId: id,
          notes: `Incident follow-up for ${incident.type} on ${incident.occurredAt.toISOString().slice(0, 10)}.`,
        },
      })
    : null;

  await writeAuditLog(user, {
    centerId,
    action: "incident.admin_review.updated",
    resource: "IncidentReport",
    resourceId: id,
    metadata: {
      childId: incident.childId,
      familyId: incident.child.familyId,
      adminReviewStatus: status,
      parentNotified,
      followUpTaskAdded: Boolean(followUpTask),
      complianceTaskId: complianceTask?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true, incident: updated, complianceTask });
}
