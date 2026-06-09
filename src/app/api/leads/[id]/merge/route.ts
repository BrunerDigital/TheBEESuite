import { EnrollmentStage, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fillBlank<T>(primary: T | null | undefined, duplicate: T | null | undefined) {
  return primary ? undefined : duplicate || null;
}

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Lead merge is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const duplicateLeadId = clean(body.duplicateLeadId);

  if (!duplicateLeadId || duplicateLeadId === id) {
    return NextResponse.json({ ok: false, error: "Choose a different duplicate lead to merge." }, { status: 400 });
  }

  const [primary, duplicate] = await Promise.all([
    prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        centerId: true,
        familyName: true,
        email: true,
        phone: true,
        childName: true,
        leadSource: true,
        ageGroupInterest: true,
        desiredStartDate: true,
        programInterest: true,
        stage: true,
        score: true,
        status: true,
      },
    }),
    prisma.lead.findUnique({
      where: { id: duplicateLeadId },
      select: {
        id: true,
        centerId: true,
        familyName: true,
        email: true,
        phone: true,
        childName: true,
        leadSource: true,
        ageGroupInterest: true,
        desiredStartDate: true,
        programInterest: true,
        stage: true,
        score: true,
        status: true,
      },
    }),
  ]);

  if (!primary || !duplicate) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }
  if (!canAccessCenter(user, primary.centerId) || !canAccessCenter(user, duplicate.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to one of these leads." }, { status: 403 });
  }
  if (primary.centerId !== duplicate.centerId) {
    return NextResponse.json(
      { ok: false, error: "Leads can only be merged when they belong to the same school." },
      { status: 400 },
    );
  }
  if (duplicate.status === "merged") {
    return NextResponse.json({ ok: false, error: "This duplicate lead has already been merged." }, { status: 400 });
  }
  if (primary.status === "merged") {
    return NextResponse.json({ ok: false, error: "Merged leads cannot be used as the primary record." }, { status: 400 });
  }

  const data: Prisma.LeadUpdateInput = {
    email: fillBlank(primary.email, duplicate.email),
    phone: fillBlank(primary.phone, duplicate.phone),
    childName: fillBlank(primary.childName, duplicate.childName),
    leadSource: fillBlank(primary.leadSource, duplicate.leadSource),
    ageGroupInterest: fillBlank(primary.ageGroupInterest, duplicate.ageGroupInterest),
    desiredStartDate: fillBlank(primary.desiredStartDate, duplicate.desiredStartDate),
    programInterest: fillBlank(primary.programInterest, duplicate.programInterest),
    score: Math.max(primary.score, duplicate.score),
  };

  Object.keys(data).forEach((key) => {
    if (data[key as keyof typeof data] === undefined) {
      delete data[key as keyof typeof data];
    }
  });

  const lead = await prisma.$transaction(async (tx) => {
    const updatedPrimary = await tx.lead.update({
      where: { id: primary.id },
      data,
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

    await tx.note.updateMany({ where: { leadId: duplicate.id }, data: { leadId: primary.id } });
    await tx.task.updateMany({ where: { leadId: duplicate.id }, data: { leadId: primary.id } });
    await tx.tour.updateMany({ where: { leadId: duplicate.id }, data: { leadId: primary.id } });

    await tx.lead.update({
      where: { id: duplicate.id },
      data: {
        status: "merged",
        stage: EnrollmentStage.LOST_NOT_A_FIT,
      },
    });

    await tx.note.create({
      data: {
        leadId: primary.id,
        userId: user.id,
        body: `Merged duplicate lead "${duplicate.familyName}" into this lead. Duplicate record is archived as merged.`,
      },
    });

    return updatedPrimary;
  });

  await writeAuditLog(user, {
    centerId: primary.centerId,
    action: "lead.merged",
    resource: "Lead",
    resourceId: primary.id,
    metadata: {
      primaryLeadId: primary.id,
      duplicateLeadId: duplicate.id,
      duplicateStage: duplicate.stage,
      duplicateStatus: duplicate.status,
      scoreBefore: primary.score,
      scoreAfter: lead.score,
    },
  });

  return NextResponse.json({ ok: true, lead, mergedLeadId: duplicate.id });
}

export const POST = withApiLogging("POST", POSTHandler);
