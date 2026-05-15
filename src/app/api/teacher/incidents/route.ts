import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageClassroomTasks(user)) {
    return NextResponse.json({ ok: false, error: "Incident creation is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const childId = clean(body.childId);
  const type = clean(body.type);
  const description = clean(body.description);
  const actionTaken = clean(body.actionTaken);

  if (!childId || !type || !description || !actionTaken) {
    return NextResponse.json({ ok: false, error: "Child, type, description, and action taken are required." }, { status: 400 });
  }

  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      classroom: { select: { id: true, centerId: true } },
      family: { select: { centerId: true } },
    },
  });

  if (!child) {
    return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
  }

  const centerId = child.classroom?.centerId ?? child.family.centerId;
  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this child." }, { status: 403 });
  }

  const incident = await prisma.incidentReport.create({
    data: {
      childId,
      classroomId: child.classroom?.id ?? null,
      staffMember: user.name,
      occurredAt: parseDate(clean(body.occurredAt)),
      type,
      description,
      actionTaken,
      parentNotified: Boolean(body.parentNotified),
      photoAttachmentPlaceholder: Boolean(body.photoAttachmentPlaceholder),
      adminReviewStatus: "pending",
      followUpTasks: clean(body.followUpTask) ? [clean(body.followUpTask)] : [],
    },
  });

  const directors = centerId
    ? await prisma.staffProfile.findMany({
        where: {
          centerId,
          user: { isActive: true, role: { in: ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"] } },
        },
        select: { userId: true },
      })
    : [];

  await Promise.all(
    directors.map((director) =>
      prisma.notification.create({
        data: {
          userId: director.userId,
          title: `Incident needs review: ${type}`,
          body: `${child.fullName}: ${description}`,
          type: "incident",
          priority: "high",
        },
      }),
    ),
  );

  await writeAuditLog(user, {
    centerId,
    action: "teacher.incident.created",
    resource: "IncidentReport",
    resourceId: incident.id,
    metadata: {
      childId,
      parentNotified: incident.parentNotified,
      requiresReview: true,
    },
  });

  return NextResponse.json({ ok: true, incident }, { status: 201 });
}
