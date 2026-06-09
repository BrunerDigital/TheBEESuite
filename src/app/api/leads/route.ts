import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { leadScore, parseLeadStage } from "@/lib/crm";
import { canAccessCenter, canManageCrmLeads, canViewCrmLeads, getCurrentUser, getLeadScopeWhere, type CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function resolveCenterId(user: CurrentUser, locationId?: string) {
  const requested = clean(locationId);
  if (requested) {
    const center = await prisma.center.findFirst({
      where: {
        status: { not: "closed" },
        OR: [
          { id: requested },
          { crmLocationId: requested },
          { locationId: requested },
          { name: requested },
        ],
      },
      select: { id: true },
    });
    if (center) {
      if (!canAccessCenter(user, center.id)) {
        throw new ApiError("You do not have access to this center.", 403);
      }
      return center.id;
    }
  }

  const fallback = await prisma.center.findFirst({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!fallback) throw new ApiError("No assigned center found for this account.", 403);
  return fallback.id;
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canViewCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Lead access is not allowed for this role." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const centerId = searchParams.get("centerId") ?? undefined;
  const stage = searchParams.get("stage") ?? undefined;
  const parsedStage = stage ? parseLeadStage(stage) : undefined;

  if (stage && !parsedStage) {
    return NextResponse.json({ ok: false, error: "Pipeline stage filter is invalid." }, { status: 400 });
  }

  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const visibleCenters = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    select: { id: true },
  });
  const visibleCenterIds = visibleCenters.map((center) => center.id);

  if (!visibleCenterIds.length) {
    return NextResponse.json({ ok: false, error: "No assigned center found for this account." }, { status: 403 });
  }
  if (centerId && !visibleCenterIds.includes(centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const leads = await prisma.lead.findMany({
    where: {
      centerId: centerId ?? { in: visibleCenterIds },
      status: { notIn: ["closed", "merged"] },
      ...(parsedStage ? { stage: parsedStage } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 250,
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

  return NextResponse.json({ ok: true, leads });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Lead creation is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const familyName = clean(body.familyName || body.parentName);
  const email = normalizeEmail(body.email);
  const phone = clean(body.phone);
  const program = clean(body.programInterest || body.program);
  const locationId = clean(body.locationId || body.crmLocationId || body.centerId);
  const requestedStage = clean(body.stage);
  const stage = requestedStage ? parseLeadStage(requestedStage) : undefined;

  if (!familyName) {
    return NextResponse.json(
      { ok: false, errors: { familyName: "Family or parent name is required." } },
      { status: 400 },
    );
  }
  if (requestedStage && !stage) {
    return NextResponse.json({ ok: false, errors: { stage: "Pipeline stage is invalid." } }, { status: 400 });
  }

  let centerId: string;
  try {
    centerId = await resolveCenterId(user, locationId);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
  const [parentFirstName, ...parentLastNameParts] = familyName.split(/\s+/);

  const lead = await prisma.lead.create({
    data: {
      centerId,
      familyName,
      parentFirstName,
      parentLastName: parentLastNameParts.join(" ") || null,
      email: email || null,
      phone: phone || null,
      childName: clean(body.childName) || null,
      leadSource: clean(body.leadSource) || "Manual CRM Entry",
      programInterest: program || null,
      ageGroupInterest: clean(body.ageGroupInterest) || program || null,
      desiredStartDate: clean(body.desiredStartDate)
        ? new Date(clean(body.desiredStartDate))
        : null,
      stage: stage || EnrollmentStage.NEW_INQUIRY,
      score: leadScore({ email, phone, program, locationId }),
      status: "open",
      customFields: {
        intakeType: "manual_crm_entry",
        locationId,
      },
      tasks: {
        create: [{ title: `Follow up with ${familyName}`, status: "open" }],
      },
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

  await writeAuditLog(user, {
    centerId,
    action: "lead.created",
    resource: "Lead",
    resourceId: lead.id,
    metadata: {
      source: "manual_crm_entry",
      stage: lead.stage,
      emailProvided: Boolean(lead.email),
      programInterest: lead.programInterest,
    },
  });

  return NextResponse.json({ ok: true, lead }, { status: 201 });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
