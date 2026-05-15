import { NextResponse } from "next/server";
import { canAccessAllCenters, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const incident = await prisma.incidentReport.findUnique({
    where: { id },
    include: {
      child: {
        include: {
          family: {
            include: { guardians: { select: { userId: true } } },
          },
        },
      },
      classroom: { select: { centerId: true } },
    },
  });

  if (!incident) {
    return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });
  }

  const centerId = incident.classroom?.centerId ?? incident.child.family.centerId;
  const isGuardian = incident.child.family.guardians.some((guardian) => guardian.userId === user.id);
  const hasCenterAccess = canAccessAllCenters(user) || Boolean(centerId && user.centerIds.includes(centerId));

  if (!isGuardian && !hasCenterAccess) {
    return NextResponse.json({ ok: false, error: "You do not have access to this incident." }, { status: 403 });
  }

  const updated = await prisma.incidentReport.update({
    where: { id },
    data: {
      parentAcknowledgedAt: new Date(),
      parentNotified: true,
    },
  });

  await writeAuditLog(user, {
    centerId,
    action: "incident.parent_acknowledged",
    resource: "IncidentReport",
    resourceId: id,
    metadata: {
      childId: incident.childId,
      familyId: incident.child.familyId,
    },
  });

  return NextResponse.json({ ok: true, incident: updated });
}
