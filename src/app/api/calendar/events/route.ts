import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeCalendarEventInput } from "@/lib/calendar-events";
import { parseOperationalDate } from "@/lib/date-guardrails";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addDefaultEnd(startsAt: Date, allDay: boolean) {
  const endsAt = new Date(startsAt);
  if (allDay) {
    endsAt.setUTCDate(endsAt.getUTCDate() + 1);
    return endsAt;
  }
  endsAt.setHours(endsAt.getHours() + 1);
  return endsAt;
}

function optionalDate(value: unknown, fieldLabel: string) {
  if (!clean(value)) return { ok: true as const, date: null };
  const parsed = parseOperationalDate(value, fieldLabel);
  return parsed.ok ? { ok: true as const, date: parsed.date } : parsed;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Calendar event management is not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const centerId = clean(body.centerId);
  const input = normalizeCalendarEventInput(body);

  if (!centerId || !input.title) {
    return NextResponse.json({ ok: false, error: "Center and title are required." }, { status: 400 });
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, organization: { tenantId: user.tenantId } },
    select: { id: true, name: true, crmLocationId: true, timezone: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }

  const accessGuard = centerScopedAccessGuard({
    centerId: center.id,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: canAccessCenter(user, center.id),
    resourceLabel: "Center",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const startsAt = parseOperationalDate(body.startsAt, "Event start");
  if (!startsAt.ok || !startsAt.provided) {
    return NextResponse.json({ ok: false, error: startsAt.ok ? "Event start is required." : startsAt.error }, { status: startsAt.ok ? 400 : startsAt.status });
  }

  const explicitEnd = optionalDate(body.endsAt ?? body.endAt, "Event end");
  if (!explicitEnd.ok) {
    return NextResponse.json({ ok: false, error: explicitEnd.error }, { status: explicitEnd.status });
  }
  let endsAt = explicitEnd.date ?? addDefaultEnd(startsAt.date, input.allDay);
  if (endsAt <= startsAt.date) {
    if (input.allDay) {
      endsAt = addDefaultEnd(startsAt.date, true);
    } else {
      return NextResponse.json({ ok: false, error: "Event end must be after the start time." }, { status: 400 });
    }
  }

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: user.tenantId,
      centerId: center.id,
      title: input.title,
      eventType: input.eventType,
      startsAt: startsAt.date,
      endsAt,
      allDay: input.allDay,
      timeZone: input.timeZone || center.timezone,
      status: input.status,
      visibility: input.visibility,
      recurrenceRule: input.recurrenceRule,
      recurrenceEndAt: input.recurrenceUntil,
      closureReason: input.closureReason,
      source: "manual",
      notes: input.notes,
      createdById: user.id,
    },
    include: {
      center: { select: { id: true, name: true, crmLocationId: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "calendar.event.created",
    resource: "CalendarEvent",
    resourceId: event.id,
    metadata: {
      eventType: event.eventType,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      allDay: event.allDay,
      recurrenceRule: event.recurrenceRule ?? null,
      visibility: event.visibility,
    },
  });

  return NextResponse.json({ ok: true, event }, { status: 201 });
}
