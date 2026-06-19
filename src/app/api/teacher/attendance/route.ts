import { NextRequest, NextResponse } from "next/server";
import { normalizeCheckAction, readCenterTimeZone, startOfServiceDay, validateNextCheckAction } from "@/lib/attendance-state";
import { canAccessAllCenters, canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { custodyWarningSummary, hasCustodyWarning } from "@/lib/custody-visibility";
import { parseOperationalDate } from "@/lib/date-guardrails";
import { sendCheckoutDailyReportEmail } from "@/lib/daily-report-email";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const ATTENDANCE_STATUSES = new Set(["present", "absent", "checked_out"]);

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageClassroomTasks(user)) {
    return NextResponse.json({ ok: false, error: "Attendance updates are not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const childId = clean(body.childId);
  const requestedLogType = clean(body.logType);
  const logType = requestedLogType ? normalizeCheckAction(requestedLogType) : null;
  const requestedStatus = clean(body.status) || "present";
  const pickupName = clean(body.pickupName);
  const absenceReason = clean(body.absenceReason);
  const parsedDate = parseOperationalDate(body.date, "Attendance date");
  if (!parsedDate.ok) {
    return NextResponse.json({ ok: false, error: parsedDate.error }, { status: parsedDate.status });
  }
  const date = parsedDate.date;

  if (!childId) {
    return NextResponse.json({ ok: false, error: "Child ID is required." }, { status: 400 });
  }
  if (requestedLogType && !logType) {
    return NextResponse.json({ ok: false, error: "Check log type must be check_in or check_out." }, { status: 400 });
  }
  if (!ATTENDANCE_STATUSES.has(requestedStatus)) {
    return NextResponse.json({ ok: false, error: "Attendance status must be present, absent, or checked_out." }, { status: 400 });
  }

  const child = await prisma.child.findUnique({
    where: { id: childId },
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

  const center = centerId
    ? await prisma.center.findUnique({ where: { id: centerId }, select: { name: true, email: true, customFields: true } })
    : null;
  const timeZone = readCenterTimeZone(center?.customFields);
  const serviceDayStart = startOfServiceDay(date, timeZone);
  const serviceDayEnd = new Date(serviceDayStart.getTime() + 24 * 60 * 60 * 1000);
  if (logType) {
    const latestLog = await prisma.checkInOutLog.findFirst({
      where: {
        childId,
        ...(centerId ? { centerId } : {}),
        occurredAt: { gte: serviceDayStart, lt: serviceDayEnd },
      },
      orderBy: { occurredAt: "desc" },
      select: { type: true },
    });
    const guard = validateNextCheckAction(logType, latestLog?.type);
    if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: 409 });
  }

  const status = logType === "check_in" ? "present" : logType === "check_out" ? "checked_out" : requestedStatus;
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

  let dailyReportEmail = null;
  if (logType === "check_out") {
    try {
      dailyReportEmail = await sendCheckoutDailyReportEmail({
        childId,
        tenantId: user.tenantId,
        centerId,
        centerName: center?.name ?? null,
        centerEmail: center?.email ?? null,
        serviceDayStart,
        serviceDayEnd,
        checkedOutAt: date,
        timeZone,
      });
    } catch (error) {
      dailyReportEmail = {
        attempted: false,
        reason: "provider_failed",
        reportId: null,
        recipients: [],
        configured: false,
        provider: "sendgrid",
        providerMessageId: null,
        error: error instanceof Error ? error.message : "Daily report email could not be sent.",
        deliveryRecorded: false,
        deliveryRecordError: null,
      };
    }
  }

  await writeAuditLog(user, {
    centerId,
    action: "teacher.attendance.created",
    resource: "AttendanceRecord",
    resourceId: record.id,
    metadata: {
      childId,
      status,
      checkLogId: checkLog?.id ?? null,
      dailyReportEmail,
      custodyWarning: hasCustodyWarning(child.family),
    },
  });

  return NextResponse.json({ ok: true, record, checkLog, dailyReportEmail, custodyWarning: custodyWarningSummary(child.family) }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
