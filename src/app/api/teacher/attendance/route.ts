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
    return NextResponse.json({ ok: false, error: "Attendance updates are not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const childId = clean(body.childId);
  const status = clean(body.status) || "present";
  const logType = clean(body.logType);
  const pickupName = clean(body.pickupName);
  const absenceReason = clean(body.absenceReason);
  const date = parseDate(clean(body.date));

  if (!childId) {
    return NextResponse.json({ ok: false, error: "Child ID is required." }, { status: 400 });
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

  const record = await prisma.attendanceRecord.create({
    data: {
      childId,
      classroomId: child.classroom?.id ?? null,
      date,
      status,
      absenceReason: absenceReason || null,
    },
  });

  const checkLog = logType
    ? await prisma.checkInOutLog.create({
        data: {
          childId,
          centerId,
          classroomId: child.classroom?.id ?? null,
          type: logType,
          occurredAt: date,
          pickupName: pickupName || null,
          signaturePlaceholder: Boolean(body.signaturePlaceholder),
          verificationStatus: clean(body.verificationStatus) || "staff_verified",
        },
      })
    : null;

  await writeAuditLog(user, {
    centerId,
    action: "teacher.attendance.created",
    resource: "AttendanceRecord",
    resourceId: record.id,
    metadata: {
      childId,
      status,
      checkLogId: checkLog?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true, record, checkLog }, { status: 201 });
}
