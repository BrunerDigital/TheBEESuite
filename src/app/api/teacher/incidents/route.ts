import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageChildInClassroom, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { custodyWarningSummary, hasCustodyWarning } from "@/lib/custody-visibility";
import { parseOperationalDate } from "@/lib/date-guardrails";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";
import { normalizeTeacherIncidentPayload } from "@/lib/teacher-incident";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageClassroomTasks(user)) {
    return NextResponse.json({ ok: false, error: "Incident creation is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const parsedIncident = normalizeTeacherIncidentPayload(body);
  if (!parsedIncident.ok) {
    return NextResponse.json({ ok: false, error: parsedIncident.error }, { status: parsedIncident.status });
  }
  const incidentInput = parsedIncident.incident;
  const occurredAt = parseOperationalDate(incidentInput.occurredAt, "Incident time");
  if (!occurredAt.ok) {
    return NextResponse.json({ ok: false, error: occurredAt.error }, { status: occurredAt.status });
  }

  const child = await prisma.child.findUnique({
    where: { id: incidentInput.childId },
    include: {
      classroom: { select: { id: true, centerId: true } },
      family: { select: { centerId: true, custodyNotes: true } },
    },
  });

  if (!child) {
    return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
  }

  const centerId = child.classroom?.centerId ?? child.family.centerId;
  const accessGuard = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Child",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }
  if (!canManageChildInClassroom(user, child.classroom?.id)) {
    return NextResponse.json({ ok: false, error: "Child is outside your assigned classroom." }, { status: 403 });
  }

  const incident = await prisma.incidentReport.create({
    data: {
      childId: incidentInput.childId,
      classroomId: child.classroom?.id ?? null,
      staffMember: user.name,
      occurredAt: occurredAt.date,
      type: incidentInput.type,
      description: incidentInput.description,
      actionTaken: incidentInput.actionTaken,
      parentNotified: incidentInput.parentNotified,
      photoAttachmentPlaceholder: incidentInput.photoAttachmentPlaceholder,
      adminReviewStatus: "pending",
      followUpTasks: incidentInput.followUpTask ? [incidentInput.followUpTask] : [],
    },
  });

  const directors = centerId
    ? await getCenterLeadershipUsers({
        centerId,
        roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
      })
    : [];

  await Promise.all(
    directors.map((director) =>
      prisma.notification.create({
        data: {
          userId: director.id,
          title: `Incident needs review: ${incidentInput.type}`,
          body: `${child.fullName}: ${incidentInput.description}`,
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
      childId: incidentInput.childId,
      parentNotified: incident.parentNotified,
      requiresReview: true,
      custodyWarning: hasCustodyWarning(child.family),
    },
  });

  return NextResponse.json({ ok: true, incident, custodyWarning: custodyWarningSummary(child.family) }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
