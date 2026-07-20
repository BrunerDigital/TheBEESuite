import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageChildInClassroom, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { custodyWarningSummary, hasCustodyWarning } from "@/lib/custody-visibility";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";
import { parseTeacherDailyReportPayload } from "@/lib/teacher-daily-report";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageClassroomTasks(user)) {
    return NextResponse.json({ ok: false, error: "Daily report updates are not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const parsedPayload = parseTeacherDailyReportPayload(body);
  if (!parsedPayload.ok) {
    return NextResponse.json({ ok: false, error: parsedPayload.error }, { status: parsedPayload.status });
  }
  const dailyReport = parsedPayload.report;
  const clientActionId = typeof body.clientActionId === "string" ? body.clientActionId.trim().slice(0, 100) || null : null;

  const children = await prisma.child.findMany({
    where: { id: { in: dailyReport.childIds }, ...currentlyEnrolledChildWhere() },
    include: {
      classroom: { select: { id: true, centerId: true } },
      family: { select: { centerId: true, custodyNotes: true } },
    },
  });

  if (children.length !== dailyReport.childIds.length) {
    return NextResponse.json({ ok: false, error: "One or more children were not found." }, { status: 404 });
  }

  if (clientActionId) {
    const existingReports = await prisma.dailyReport.findMany({
      where: { childId: { in: dailyReport.childIds }, clientActionId },
      include: { child: { select: { fullName: true } }, _count: { select: { meals: true, naps: true, diapers: true, activities: true } } },
    });
    if (existingReports.length === dailyReport.childIds.length) {
      return NextResponse.json({ ok: true, report: existingReports[0], reports: existingReports, reportCount: existingReports.length, replayed: true }, { status: 200 });
    }
  }

  const hasTenantWideAccess = canAccessAllCenters(user);
  const childById = new Map(children.map((child) => [child.id, child]));
  for (const childId of dailyReport.childIds) {
    const child = childById.get(childId);
    if (!child) {
      return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
    }
    const centerId = child.classroom?.centerId ?? child.family.centerId ?? null;
    const accessGuard = centerScopedAccessGuard({
      centerId,
      hasTenantWideAccess,
      hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
      resourceLabel: "Child",
    });
    if (!accessGuard.ok) {
      return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
    }
    if (!canManageChildInClassroom(user, child.classroom?.id)) {
      return NextResponse.json({ ok: false, error: "Child is outside your assigned classroom." }, { status: 403 });
    }
  }

  const sentAt = dailyReport.sendToParent ? new Date() : null;
  const reports = await prisma.$transaction(
    dailyReport.childIds.map((childId) => {
      const child = childById.get(childId);
      return prisma.dailyReport.create({
        data: {
          childId,
          classroomId: child?.classroom?.id ?? null,
          date: dailyReport.date,
          mood: dailyReport.mood,
          teacherNote: dailyReport.teacherNote,
          suppliesNeeded: dailyReport.suppliesNeeded,
          sentAt,
          clientActionId,
          meals: dailyReport.meals.length ? { create: dailyReport.meals } : undefined,
          naps: dailyReport.naps.length ? { create: dailyReport.naps } : undefined,
          diapers: dailyReport.diapers.length ? { create: dailyReport.diapers } : undefined,
          activities: dailyReport.activities.length ? { create: dailyReport.activities } : undefined,
        },
        include: {
          child: { select: { fullName: true } },
          _count: { select: { meals: true, naps: true, diapers: true, activities: true } },
        },
      });
    }),
  );

  await Promise.all(
    reports.map((report) => {
      const child = childById.get(report.childId);
      const centerId = child?.classroom?.centerId ?? child?.family.centerId ?? null;
      return writeAuditLog(user, {
        centerId,
        action: "teacher.daily_report.created",
        resource: "DailyReport",
        resourceId: report.id,
        metadata: {
          childId: report.childId,
          batchSize: reports.length,
          sentToParent: dailyReport.sendToParent,
          entries: {
            meals: dailyReport.meals.length,
            naps: dailyReport.naps.length,
            diapers: dailyReport.diapers.length,
            activities: dailyReport.activities.length,
          },
          noNap: dailyReport.noNap,
          custodyWarning: hasCustodyWarning(child?.family),
        },
      });
    }),
  );

  const report = reports[0];
  const primaryChild = childById.get(report.childId);

  return NextResponse.json({
    ok: true,
    report,
    reports,
    reportCount: reports.length,
    custodyWarning: custodyWarningSummary(primaryChild?.family),
    custodyWarnings: reports.map((item) => {
      const child = childById.get(item.childId);
      return {
        childId: item.childId,
        childName: item.child.fullName,
        warning: custodyWarningSummary(child?.family),
      };
    }).filter((item) => item.warning),
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
