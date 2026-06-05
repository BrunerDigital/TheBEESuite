import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { custodyWarningSummary, hasCustodyWarning } from "@/lib/custody-visibility";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";
import { parseTeacherDailyReportPayload } from "@/lib/teacher-daily-report";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  const child = await prisma.child.findUnique({
    where: { id: dailyReport.childId },
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

  const report = await prisma.dailyReport.create({
    data: {
      childId: dailyReport.childId,
      classroomId: child.classroom?.id ?? null,
      date: dailyReport.date,
      mood: dailyReport.mood,
      teacherNote: dailyReport.teacherNote,
      suppliesNeeded: dailyReport.suppliesNeeded,
      sentAt: dailyReport.sendToParent ? new Date() : null,
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

  await writeAuditLog(user, {
    centerId,
    action: "teacher.daily_report.created",
    resource: "DailyReport",
    resourceId: report.id,
    metadata: {
      childId: dailyReport.childId,
      sentToParent: dailyReport.sendToParent,
      entries: {
        meals: dailyReport.meals.length,
        naps: dailyReport.naps.length,
        diapers: dailyReport.diapers.length,
        activities: dailyReport.activities.length,
      },
      custodyWarning: hasCustodyWarning(child.family),
    },
  });

  return NextResponse.json({ ok: true, report, custodyWarning: custodyWarningSummary(child.family) }, { status: 201 });
}
