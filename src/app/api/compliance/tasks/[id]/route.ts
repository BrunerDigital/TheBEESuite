import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { complianceTaskStatuses } from "@/lib/compliance-workflows";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function taskStatus(value: unknown) {
  const next = clean(value).toLowerCase().replaceAll(" ", "_");
  return complianceTaskStatuses.includes(next as (typeof complianceTaskStatuses)[number])
    ? next
    : "open";
}

async function PATCHHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Compliance task updates are not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const task = await prisma.complianceTask.findUnique({
    where: { id },
    select: { id: true, centerId: true, status: true, title: true },
  });
  if (!task) {
    return NextResponse.json({ ok: false, error: "Compliance task not found." }, { status: 404 });
  }

  const accessGuard = centerScopedAccessGuard({
    centerId: task.centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: canAccessCenter(user, task.centerId),
    resourceLabel: "Compliance task",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = taskStatus(body.status);
  const updated = await prisma.complianceTask.update({
    where: { id },
    data: {
      status,
      completedAt: status === "completed" ? new Date() : null,
      notes: clean(body.notes) || undefined,
    },
    include: {
      center: { select: { name: true, crmLocationId: true } },
      assignedTo: { select: { name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  await writeAuditLog(user, {
    centerId: task.centerId,
    action: "compliance.task.updated",
    resource: "ComplianceTask",
    resourceId: task.id,
    metadata: {
      previousStatus: task.status,
      status,
      title: task.title,
    },
  });

  return NextResponse.json({ ok: true, task: updated });
}

export const PATCH = withApiLogging("PATCH", PATCHHandler);
