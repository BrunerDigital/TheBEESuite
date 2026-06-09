import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStage } from "@prisma/client";
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

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Tour scheduling is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const startsAt = parseDate(clean(body.startsAt));
  const notes = clean(body.notes);

  if (!startsAt) {
    return NextResponse.json({ ok: false, error: "A valid tour date and time is required." }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      centerId: true,
      stage: true,
      familyName: true,
      email: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (!canAccessCenter(user, lead.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this lead." }, { status: 403 });
  }

  const tour = await prisma.tour.create({
    data: {
      centerId: lead.centerId,
      leadId: lead.id,
      startsAt,
      status: clean(body.status) || "scheduled",
      notes: notes || null,
    },
  });

  const shouldMoveStage =
    lead.stage === EnrollmentStage.NEW_INQUIRY || lead.stage === EnrollmentStage.CONTACTED;

  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: shouldMoveStage ? { stage: EnrollmentStage.TOUR_SCHEDULED } : {},
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
      leadId: lead.id,
      userId: user.id,
      body: `Tour scheduled for ${startsAt.toLocaleString("en-US")}.${notes ? ` Notes: ${notes}` : ""}`,
    },
  });

  await writeAuditLog(user, {
    centerId: lead.centerId,
    action: "lead.tour.scheduled",
    resource: "Lead",
    resourceId: lead.id,
    metadata: {
      tourId: tour.id,
      startsAt: startsAt.toISOString(),
      previousStage: lead.stage,
      stage: updatedLead.stage,
    },
  });

  return NextResponse.json({ ok: true, tour, lead: updatedLead }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
