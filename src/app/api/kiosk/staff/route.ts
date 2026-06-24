import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { writeSystemAuditLog } from "@/lib/audit";
import { readCenterTimeZone } from "@/lib/attendance-state";
import { normalizePin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import {
  normalizeStaffClockAction,
  readStaffClockState,
  resolveStaffKioskCredential,
  staffClockFields,
  validateNextStaffClockAction,
} from "@/lib/staff-kiosk";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeStaff(staff: {
  id: string;
  title: string;
  customFields: unknown;
  user: { name: string; email: string };
  classroom: { id: string; name: string } | null;
}) {
  return {
    id: staff.id,
    name: staff.user.name,
    email: staff.user.email,
    title: staff.title,
    classroom: staff.classroom,
    clock: readStaffClockState(staff.customFields),
  };
}

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const centerId = clean(body.centerId);
  const email = clean(body.email).toLowerCase();
  const pin = normalizePin(body.pin);
  const requestedAction = clean(body.action) || "lookup";
  const notes = clean(body.notes);
  const action = requestedAction === "lookup" ? null : normalizeStaffClockAction(requestedAction);
  const ip = requestIp(request.headers);

  const limited = checkRateLimit({ key: `staff-kiosk:${centerId}:${ip}`, limit: 18, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many staff kiosk attempts. Please ask the front desk for help." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  if (!centerId || !pin) {
    return NextResponse.json({ ok: false, error: "Center and 4 digit staff code are required." }, { status: 400 });
  }
  if (requestedAction !== "lookup" && !action) {
    return NextResponse.json({ ok: false, error: "Staff kiosk action must be lookup, clock_in, or clock_out." }, { status: 400 });
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: { id: true, name: true, crmLocationId: true, city: true, state: true, postalCode: true, timezone: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Kiosk center not found." }, { status: 404 });
  }

  const staffCandidates = await prisma.staffProfile.findMany({
    where: {
      centerId,
      user: {
        isActive: true,
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      classroom: { select: { id: true, name: true } },
    },
  });
  const credential = resolveStaffKioskCredential({ candidates: staffCandidates, pin, email });
  if (!credential.ok) {
    if (credential.status === "ambiguous") {
      return NextResponse.json(
        { ok: false, error: "More than one staff member uses this kiosk code. Enter work email too." },
        { status: 409 },
      );
    }
    if (credential.status === "missing_code") {
      return NextResponse.json(
        { ok: false, error: email ? "This staff member does not have a staff kiosk code yet." : "No active staff with a kiosk code was found for this school." },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: false, error: "Staff kiosk code was not recognized for this school." }, { status: 401 });
  }
  const staff = credential.staff;

  if (!action) {
    return NextResponse.json({
      ok: true,
      center: { id: center.id, name: center.crmLocationId ?? center.name },
      staff: serializeStaff(staff),
    });
  }

  const currentState = readStaffClockState(staff.customFields);
  const guard = validateNextStaffClockAction(action, currentState);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error, staff: serializeStaff(staff) }, { status: 409 });
  }

  const occurredAt = new Date();
  const timeZone = readCenterTimeZone(center);
  const customFields = staffClockFields({
    customFields: staff.customFields,
    action,
    occurredAt,
    timeZone,
    notes,
  });
  const updated = await prisma.staffProfile.update({
    where: { id: staff.id },
    data: { customFields },
    include: {
      user: { select: { id: true, name: true, email: true } },
      classroom: { select: { id: true, name: true } },
    },
  });

  await writeSystemAuditLog({
    tenantId: center.organization.tenantId,
    centerId,
    action: `kiosk.staff.${action}`,
    resource: "StaffProfile",
    resourceId: staff.id,
    metadata: {
      staffUserId: staff.user.id,
      staffEmail: staff.user.email,
      classroomId: staff.classroom?.id ?? null,
      previousStatus: currentState.status,
      occurredAt: occurredAt.toISOString(),
      timeZone,
      notes: notes || null,
    },
  });

  return NextResponse.json({
    ok: true,
    center: { id: center.id, name: center.crmLocationId ?? center.name },
    action,
    occurredAt,
    timeZone,
    staff: serializeStaff(updated),
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
