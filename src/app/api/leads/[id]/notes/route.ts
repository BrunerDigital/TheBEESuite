import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Lead notes are not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const noteBody = clean(body.body);

  if (!noteBody) {
    return NextResponse.json({ ok: false, error: "Note body is required." }, { status: 400 });
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

  const note = await prisma.note.create({
    data: {
      leadId: lead.id,
      userId: user.id,
      body: noteBody,
      restricted: Boolean(body.restricted),
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  await writeAuditLog(user, {
    centerId: lead.centerId,
    action: "lead.note.created",
    resource: "Lead",
    resourceId: lead.id,
    metadata: {
      noteId: note.id,
      restricted: note.restricted,
    },
  });

  return NextResponse.json({ ok: true, note }, { status: 201 });
}
