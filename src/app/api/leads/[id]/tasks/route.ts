import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateOrNull(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Lead tasks are not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const title = clean(body.title);

  if (!title) {
    return NextResponse.json({ ok: false, error: "Task title is required." }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, centerId: true },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (!canAccessCenter(user, lead.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this lead." }, { status: 403 });
  }

  const task = await prisma.task.create({
    data: {
      leadId: lead.id,
      title,
      dueAt: dateOrNull(clean(body.dueAt)),
      status: clean(body.status) || "open",
      assignedTo: clean(body.assignedTo) || user.id,
    },
  });

  await writeAuditLog(user, {
    centerId: lead.centerId,
    action: "lead.task.created",
    resource: "Lead",
    resourceId: lead.id,
    metadata: {
      taskId: task.id,
      dueAt: task.dueAt?.toISOString() || null,
    },
  });

  return NextResponse.json({ ok: true, task }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
