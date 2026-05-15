import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeLeadStage } from "@/lib/crm";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          locationId: true,
          city: true,
          state: true,
          email: true,
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      tasks: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 25,
      },
      tours: {
        orderBy: { startsAt: "desc" },
        take: 10,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (!canAccessCenter(user, lead.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this lead." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, lead });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Pipeline updates are not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const stage = normalizeLeadStage(clean(body.stage));
  const status = clean(body.status);

  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { centerId: true, stage: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (!canAccessCenter(user, existing.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this lead." }, { status: 403 });
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      stage,
      ...(status ? { status } : {}),
    },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          locationId: true,
          city: true,
          state: true,
        },
      },
    },
  });

  await prisma.note.create({
    data: {
      userId: user.id,
      leadId: lead.id,
      body:
        existing.stage === stage
          ? `Lead status updated${status ? ` to ${status}` : ""}.`
          : `Pipeline stage changed from ${existing.stage} to ${stage}.`,
    },
  });

  await writeAuditLog(user, {
    centerId: lead.centerId,
    action: "lead.updated",
    resource: "Lead",
    resourceId: lead.id,
    metadata: {
      before: {
        stage: existing.stage,
        status: existing.status,
      },
      after: {
        stage: lead.stage,
        status: lead.status,
      },
    },
  });

  return NextResponse.json({ ok: true, lead });
}
