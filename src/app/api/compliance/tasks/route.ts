import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeComplianceTaskInput } from "@/lib/compliance-workflows";
import { parseOperationalDate } from "@/lib/date-guardrails";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalDate(value: unknown, fieldLabel: string) {
  if (!clean(value)) return { ok: true as const, date: null };
  const parsed = parseOperationalDate(value, fieldLabel);
  return parsed.ok ? { ok: true as const, date: parsed.date } : parsed;
}

async function validateAssignee(input: { assignedToId: string | null; centerId: string; tenantId: string }) {
  if (!input.assignedToId) return { ok: true as const };
  const assignee = await prisma.user.findFirst({
    where: {
      id: input.assignedToId,
      tenantId: input.tenantId,
      isActive: true,
      OR: [
        { staffProfile: { centerId: input.centerId } },
        { accessGrants: { some: { isActive: true, centerId: input.centerId } } },
      ],
    },
    select: { id: true },
  });
  if (!assignee) {
    return { ok: false as const, status: 400, error: "Assigned user is not available for this center." };
  }
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Compliance task assignment is not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = normalizeComplianceTaskInput(body);
  if (!input.centerId || !input.title) {
    return NextResponse.json({ ok: false, error: "Center and title are required." }, { status: 400 });
  }

  const center = await prisma.center.findUnique({
    where: { id: input.centerId },
    select: { id: true, name: true, crmLocationId: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }
  const accessGuard = centerScopedAccessGuard({
    centerId: center.id,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: canAccessCenter(user, center.id),
    resourceLabel: "Center",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const assigneeGuard = await validateAssignee({ assignedToId: input.assignedToId, centerId: center.id, tenantId: user.tenantId });
  if (!assigneeGuard.ok) {
    return NextResponse.json({ ok: false, error: assigneeGuard.error }, { status: assigneeGuard.status });
  }
  const dueAt = optionalDate(body.dueAt, "Task due date");
  if (!dueAt.ok) {
    return NextResponse.json({ ok: false, error: dueAt.error }, { status: dueAt.status });
  }
  const reminderAt = optionalDate(body.reminderAt, "Reminder date");
  if (!reminderAt.ok) {
    return NextResponse.json({ ok: false, error: reminderAt.error }, { status: reminderAt.status });
  }

  const task = await prisma.complianceTask.create({
    data: {
      centerId: center.id,
      title: input.title,
      category: input.category,
      priority: input.priority,
      status: input.status,
      dueAt: dueAt.date,
      reminderAt: reminderAt.date,
      assignedToId: input.assignedToId,
      createdById: user.id,
      relatedResourceType: input.relatedResourceType,
      relatedResourceId: input.relatedResourceId,
      notes: input.notes,
      completedAt: input.status === "completed" ? new Date() : null,
    },
    include: {
      center: { select: { name: true, crmLocationId: true } },
      assignedTo: { select: { name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  if (task.assignedToId) {
    await prisma.notification.create({
      data: {
        userId: task.assignedToId,
        title: `Compliance task: ${task.title}`,
        body: `${center.crmLocationId ?? center.name}${task.dueAt ? ` · due ${task.dueAt.toISOString().slice(0, 10)}` : ""}`,
        type: "compliance",
        priority: task.priority,
      },
    });
  }

  await writeAuditLog(user, {
    centerId: center.id,
    action: "compliance.task.created",
    resource: "ComplianceTask",
    resourceId: task.id,
    metadata: {
      title: task.title,
      category: task.category,
      priority: task.priority,
      status: task.status,
      assignedToId: task.assignedToId,
      dueAt: task.dueAt?.toISOString() ?? null,
      reminderAt: task.reminderAt?.toISOString() ?? null,
    },
  });

  return NextResponse.json({ ok: true, task }, { status: 201 });
}
