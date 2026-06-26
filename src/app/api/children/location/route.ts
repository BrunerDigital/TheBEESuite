import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { childLocationStatusForTarget, validateChildLocationTarget } from "@/lib/child-location";
import { custodyWarningSummary, hasCustodyWarning } from "@/lib/custody-visibility";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageClassroomTasks(user)) {
    return NextResponse.json({ ok: false, error: "Child location updates are not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const childId = clean(body.childId);
  const reason = clean(body.reason).slice(0, 180);
  const target = validateChildLocationTarget({
    classroomId: body.classroomId,
    areaName: body.areaName,
  });

  if (!childId) {
    return NextResponse.json({ ok: false, error: "Child ID is required." }, { status: 400 });
  }
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: target.status });
  }

  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      classroom: { select: { id: true, name: true, centerId: true } },
      family: { select: { centerId: true, custodyNotes: true } },
      liveLocation: {
        select: {
          currentClassroomId: true,
          areaName: true,
          status: true,
          movedAt: true,
        },
      },
    },
  });
  if (!child) {
    return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
  }

  const assignedCenterId = child.classroom?.centerId ?? child.family.centerId;
  const destinationClassroom = target.classroomId
    ? await prisma.classroom.findUnique({
        where: { id: target.classroomId },
        select: { id: true, name: true, centerId: true },
      })
    : null;

  if (target.classroomId && !destinationClassroom) {
    return NextResponse.json({ ok: false, error: "Destination classroom not found." }, { status: 404 });
  }

  const centerId = destinationClassroom?.centerId ?? assignedCenterId;
  const accessGuard = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Child location",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  if (assignedCenterId && centerId && assignedCenterId !== centerId) {
    return NextResponse.json(
      { ok: false, error: "Children can only be transitioned within their assigned school." },
      { status: 409 },
    );
  }

  const fromClassroomId = child.liveLocation?.areaName
    ? null
    : child.liveLocation?.currentClassroomId ?? child.classroom?.id ?? null;
  const fromAreaName = child.liveLocation?.areaName ?? null;
  const nextStatus = childLocationStatusForTarget({
    classroomId: destinationClassroom?.id ?? null,
    areaName: target.areaName,
  });
  const movedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const liveLocation = await tx.childLiveLocation.upsert({
      where: { childId },
      update: {
        centerId,
        currentClassroomId: destinationClassroom?.id ?? null,
        areaName: target.areaName,
        status: nextStatus,
        reason: reason || null,
        movedAt,
        movedById: user.id,
      },
      create: {
        childId,
        centerId,
        currentClassroomId: destinationClassroom?.id ?? null,
        areaName: target.areaName,
        status: nextStatus,
        reason: reason || null,
        movedAt,
        movedById: user.id,
      },
      include: {
        currentClassroom: { select: { id: true, name: true } },
        movedBy: { select: { id: true, name: true } },
      },
    });

    const transition = await tx.childLocationTransition.create({
      data: {
        childId,
        centerId,
        fromClassroomId,
        fromAreaName,
        toClassroomId: destinationClassroom?.id ?? null,
        toAreaName: target.areaName,
        reason: reason || null,
        movedAt,
        movedById: user.id,
      },
    });

    return { liveLocation, transition };
  });

  await writeAuditLog(user, {
    centerId,
    action: "child.location.transitioned",
    resource: "ChildLiveLocation",
    resourceId: result.liveLocation.id,
    metadata: {
      childId,
      assignedClassroomId: child.classroom?.id ?? null,
      fromClassroomId,
      fromAreaName,
      toClassroomId: destinationClassroom?.id ?? null,
      toAreaName: target.areaName,
      transitionId: result.transition.id,
      reason: reason || null,
      childClassroomUnchanged: true,
      custodyWarning: hasCustodyWarning(child.family),
    },
  });

  return NextResponse.json({
    ok: true,
    child: {
      id: child.id,
      fullName: child.fullName,
      assignedClassroom: child.classroom,
    },
    liveLocation: result.liveLocation,
    custodyWarning: custodyWarningSummary(child.family),
  }, { status: 200 });
}

export const POST = withApiLogging("POST", POSTHandler);
