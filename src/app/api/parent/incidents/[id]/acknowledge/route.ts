import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAcknowledgeIncident } from "@/lib/portal-guardrails";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function POSTHandler(_request: Request, context: RouteContext) {
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
  const guard = canAcknowledgeIncident({ isLinkedGuardian: isGuardian });
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

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
      acknowledgedByGuardianUserId: user.id,
    },
  });

  return NextResponse.json({ ok: true, incident: updated });
}

export const POST = withApiLogging("POST", POSTHandler);
