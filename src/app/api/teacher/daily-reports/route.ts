import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { parseOperationalDate } from "@/lib/date-guardrails";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageClassroomTasks(user)) {
    return NextResponse.json({ ok: false, error: "Daily report updates are not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const childId = clean(body.childId);
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
  const accessGuard = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Child",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const parsedDate = parseOperationalDate(body.date, "Daily report date");
  if (!parsedDate.ok) {
    return NextResponse.json({ ok: false, error: parsedDate.error }, { status: parsedDate.status });
  }
  const date = parsedDate.date;
  const meal = clean(body.meal);
  const activity = clean(body.activity);
  const napStart = clean(body.napStart);
  const napEnd = clean(body.napEnd);
  const diaperType = clean(body.diaperType);
  const parsedNapStart = napStart ? parseOperationalDate(napStart, "Nap start") : null;
  if (parsedNapStart && !parsedNapStart.ok) {
    return NextResponse.json({ ok: false, error: parsedNapStart.error }, { status: parsedNapStart.status });
  }
  const parsedNapEnd = napEnd ? parseOperationalDate(napEnd, "Nap end") : null;
  if (parsedNapEnd && !parsedNapEnd.ok) {
    return NextResponse.json({ ok: false, error: parsedNapEnd.error }, { status: parsedNapEnd.status });
  }

  const report = await prisma.dailyReport.create({
    data: {
      childId,
      classroomId: child.classroom?.id ?? null,
      date,
      mood: clean(body.mood) || null,
      teacherNote: clean(body.teacherNote) || null,
      suppliesNeeded: clean(body.suppliesNeeded) || null,
      sentAt: Boolean(body.sendToParent) ? new Date() : null,
      meals: meal
        ? { create: [{ mealType: clean(body.mealType) || "Meal", food: meal, amount: clean(body.mealAmount) || null }] }
        : undefined,
      naps: napStart
        ? { create: [{ startsAt: parsedNapStart?.date ?? date, endsAt: parsedNapEnd?.date ?? null }] }
        : undefined,
      diapers: diaperType
        ? { create: [{ type: diaperType, occurredAt: date, notes: clean(body.diaperNotes) || null }] }
        : undefined,
      activities: activity
        ? { create: [{ title: activity, notes: clean(body.activityNotes) || null }] }
        : undefined,
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
      childId,
      sentToParent: Boolean(body.sendToParent),
    },
  });

  return NextResponse.json({ ok: true, report }, { status: 201 });
}
