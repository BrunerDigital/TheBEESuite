import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseLeadStage } from "@/lib/crm";
import { canAccessCenter, canManageCrmLeads, canViewCrmLeads, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function hasField(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canViewCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Lead access is not allowed for this role." }, { status: 403 });
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
  const body = (await request.json()) as Record<string, unknown>;
  const requestedStage = clean(body.stage);
  const stage = requestedStage ? parseLeadStage(requestedStage) : undefined;
  const status = clean(body.status);

  if (requestedStage && !stage) {
    return NextResponse.json({ ok: false, errors: { stage: "Pipeline stage is invalid." } }, { status: 400 });
  }

  const existing = await prisma.lead.findUnique({
    where: { id },
    select: {
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
      status: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (!canAccessCenter(user, existing.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this lead." }, { status: 403 });
  }

  const data: Prisma.LeadUpdateInput = {};
  const fieldChanges: string[] = [];

  if (stage && stage !== existing.stage) {
    data.stage = stage;
    fieldChanges.push("stage");
  }

  if (status && status !== existing.status) {
    data.status = status;
    fieldChanges.push("status");
  }

  if (hasField(body, "familyName") || hasField(body, "parentName")) {
    const familyName = clean(body.familyName || body.parentName);
    if (!familyName) {
      return NextResponse.json({ ok: false, errors: { familyName: "Family or parent name is required." } }, { status: 400 });
    }
    const [parentFirstName, ...parentLastNameParts] = familyName.split(/\s+/);
    data.familyName = familyName;
    data.parentFirstName = parentFirstName;
    data.parentLastName = parentLastNameParts.join(" ") || null;
    fieldChanges.push("familyName");
  }

  if (hasField(body, "email")) {
    data.email = normalizeEmail(body.email) || null;
    fieldChanges.push("email");
  }

  if (hasField(body, "phone")) {
    data.phone = clean(body.phone) || null;
    fieldChanges.push("phone");
  }

  if (hasField(body, "childName")) {
    data.childName = clean(body.childName) || null;
    fieldChanges.push("childName");
  }

  if (hasField(body, "leadSource")) {
    data.leadSource = clean(body.leadSource) || null;
    fieldChanges.push("leadSource");
  }

  if (hasField(body, "programInterest") || hasField(body, "program")) {
    data.programInterest = clean(body.programInterest || body.program) || null;
    fieldChanges.push("programInterest");
  }

  if (hasField(body, "ageGroupInterest")) {
    data.ageGroupInterest = clean(body.ageGroupInterest) || null;
    fieldChanges.push("ageGroupInterest");
  }

  if (hasField(body, "desiredStartDate")) {
    const desiredStartDate = clean(body.desiredStartDate);
    if (desiredStartDate) {
      const parsed = new Date(desiredStartDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ ok: false, errors: { desiredStartDate: "Desired start date is invalid." } }, { status: 400 });
      }
      data.desiredStartDate = parsed;
    } else {
      data.desiredStartDate = null;
    }
    fieldChanges.push("desiredStartDate");
  }

  if (!fieldChanges.length) {
    return NextResponse.json({ ok: false, error: "No lead updates were provided." }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id },
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

  await prisma.note.create({
    data: {
      userId: user.id,
      leadId: lead.id,
      body: fieldChanges.includes("stage")
        ? `Pipeline stage changed from ${existing.stage} to ${lead.stage}.`
        : `Lead details updated: ${fieldChanges.join(", ")}.`,
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
        familyName: existing.familyName,
        email: existing.email,
        phone: existing.phone,
        childName: existing.childName,
        leadSource: existing.leadSource,
        ageGroupInterest: existing.ageGroupInterest,
        desiredStartDate: existing.desiredStartDate,
        programInterest: existing.programInterest,
      },
      after: {
        stage: lead.stage,
        status: lead.status,
        familyName: lead.familyName,
        email: lead.email,
        phone: lead.phone,
        childName: lead.childName,
        leadSource: lead.leadSource,
        ageGroupInterest: lead.ageGroupInterest,
        desiredStartDate: lead.desiredStartDate,
        programInterest: lead.programInterest,
      },
      fields: fieldChanges,
    },
  });

  return NextResponse.json({ ok: true, lead });
}
