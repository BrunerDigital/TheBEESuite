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
  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this child." }, { status: 403 });
  }

  const date = parseDate(clean(body.date));
  const meal = clean(body.meal);
  const activity = clean(body.activity);
  const napStart = clean(body.napStart);
  const napEnd = clean(body.napEnd);
  const diaperType = clean(body.diaperType);

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
        ? { create: [{ startsAt: parseDate(napStart), endsAt: napEnd ? parseDate(napEnd) : null }] }
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
