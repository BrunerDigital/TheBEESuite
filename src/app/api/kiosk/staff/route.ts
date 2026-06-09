import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { writeSystemAuditLog } from "@/lib/audit";
import { normalizePin, verifyStaffPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import {
  normalizeStaffClockAction,
  readStaffClockState,
  readStaffKioskPinHash,
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

  if (!centerId || !email || !pin) {
    return NextResponse.json({ ok: false, error: "Center, teacher email, and 4 digit staff code are required." }, { status: 400 });
  }
  if (requestedAction !== "lookup" && !action) {
    return NextResponse.json({ ok: false, error: "Staff kiosk action must be lookup, clock_in, or clock_out." }, { status: 400 });
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: { id: true, name: true, crmLocationId: true, organization: { select: { tenantId: true } } },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Kiosk center not found." }, { status: 404 });
  }

  const staff = await prisma.staffProfile.findFirst({
    where: {
      centerId,
      user: {
        email,
        role: UserRole.TEACHER,
        isActive: true,
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      classroom: { select: { id: true, name: true } },
    },
  });
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Teacher was not found for this school." }, { status: 401 });
  }

  const pinHash = readStaffKioskPinHash(staff.customFields);
  if (!pinHash) {
    return NextResponse.json({ ok: false, error: "This teacher does not have a staff kiosk code yet." }, { status: 403 });
  }
  if (!verifyStaffPin(staff.id, pin, pinHash)) {
    return NextResponse.json({ ok: false, error: "Staff kiosk code was not recognized for this teacher." }, { status: 401 });
  }

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
  const customFields = staffClockFields({
    customFields: staff.customFields,
    action,
    occurredAt,
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
      notes: notes || null,
    },
  });

  return NextResponse.json({
    ok: true,
    center: { id: center.id, name: center.crmLocationId ?? center.name },
    action,
    occurredAt,
    staff: serializeStaff(updated),
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
