import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leadScore, normalizeLeadStage } from "@/lib/crm";
import { canAccessAllCenters, canAccessCenter, canManageCrmLeads, getCurrentUser, type CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

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

  if (!canAccessAllCenters(user)) {
    if (!user.primaryCenterId) throw new ApiError("No assigned center found for this account.", 403);
    return user.primaryCenterId;
  }

  const fallback = await prisma.center.findFirst({
    where: { status: { not: "closed" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!fallback) throw new Error("No center exists for lead creation.");
  return fallback.id;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const centerId = searchParams.get("centerId") ?? undefined;
  const stage = searchParams.get("stage") ?? undefined;

  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  if (!canAccessAllCenters(user) && !user.centerIds.length) {
    return NextResponse.json({ ok: false, error: "No assigned center found for this account." }, { status: 403 });
  }

  const leads = await prisma.lead.findMany({
    where: {
      ...(centerId
        ? { centerId }
        : !canAccessAllCenters(user)
          ? { centerId: { in: user.centerIds } }
          : {}),
      ...(stage ? { stage: normalizeLeadStage(stage) } : {}),
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

export async function POST(request: NextRequest) {
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

  if (!familyName) {
    return NextResponse.json(
      { ok: false, errors: { familyName: "Family or parent name is required." } },
      { status: 400 },
    );
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
      stage: normalizeLeadStage(clean(body.stage)),
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
