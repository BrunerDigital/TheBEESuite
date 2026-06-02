import { NextRequest, NextResponse } from "next/server";
import { isLatePickup, latestLogMap, normalizeCheckAction, readCenterTimeZone, readLatePickupCutoff, startOfServiceDay, validateNextCheckAction, validateSelectedChildren } from "@/lib/attendance-state";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { writeSystemAuditLog } from "@/lib/audit";
import { normalizePin, verifyGuardianPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const centerId = clean(body.centerId);
  const pin = normalizePin(body.pin);
  const type = normalizeCheckAction(clean(body.type));
  const signatureName = clean(body.signatureName);
  const rawChildIds: unknown[] = Array.isArray(body.childIds) ? body.childIds : [];
  const childIds = Array.from(new Set(rawChildIds.map((item) => clean(item)).filter(Boolean)));
  const ip = requestIp(request.headers);
  const limited = checkRateLimit({ key: `kiosk-check:${centerId}:${ip}`, limit: 18, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many kiosk attempts. Please ask the front desk for help." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  if (!centerId || !pin || !type || !childIds.length) {
    return NextResponse.json({ ok: false, error: "Center, PIN, action, and at least one child are required." }, { status: 400 });
  }
  if (!signatureName) {
    return NextResponse.json({ ok: false, error: "Typed guardian signature is required." }, { status: 400 });
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: { id: true, name: true, crmLocationId: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Kiosk center not found." }, { status: 404 });
  }

  const guardians = await prisma.guardian.findMany({
    where: {
      checkInPinHash: { not: null },
      family: { centerId },
    },
    include: {
      family: {
        select: {
          id: true,
          name: true,
          children: {
            where: { id: { in: childIds } },
            select: {
              id: true,
              fullName: true,
              classroom: { select: { id: true, centerId: true } },
            },
          },
        },
      },
    },
  });
  const guardian = guardians.find((item) => verifyGuardianPin(item.id, pin, item.checkInPinHash));
  if (!guardian) {
    return NextResponse.json({ ok: false, error: "PIN was not recognized for this school." }, { status: 401 });
  }

  const allowedChildren = guardian.family.children.filter((child) => child.classroom?.centerId === centerId || !child.classroom);
  if (!allowedChildren.length) {
    return NextResponse.json({ ok: false, error: "No selected children are linked to this guardian at this school." }, { status: 403 });
  }
  const selectedGuard = validateSelectedChildren({
    requestedChildIds: childIds,
    allowedChildIds: allowedChildren.map((child) => child.id),
  });
  if (!selectedGuard.ok) {
    return NextResponse.json(
      { ok: false, error: selectedGuard.error, unauthorizedChildIds: selectedGuard.unauthorizedChildIds },
      { status: selectedGuard.status },
    );
  }

  const occurredAt = new Date();
  const timeZone = readCenterTimeZone(center.customFields);
  const latePickupCutoff = readLatePickupCutoff(center.customFields);
  const latePickup = type === "check_out" && isLatePickup(occurredAt, timeZone, latePickupCutoff);
  const latestLogs = await prisma.checkInOutLog.findMany({
    where: {
      childId: { in: allowedChildren.map((child) => child.id) },
      centerId,
      occurredAt: { gte: startOfServiceDay(occurredAt, timeZone) },
    },
    orderBy: { occurredAt: "desc" },
    select: { childId: true, type: true, occurredAt: true },
  });
  const latestByChild = latestLogMap(latestLogs);
  for (const child of allowedChildren) {
    const guard = validateNextCheckAction(type, latestByChild.get(child.id)?.type);
    if (!guard.ok) {
      return NextResponse.json(
        { ok: false, error: guard.error, childId: child.id, childName: child.fullName },
        { status: 409 },
      );
    }
  }
  const status = type === "check_in" ? "present" : "checked_out";
  const logs = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const child of allowedChildren) {
      await tx.attendanceRecord.create({
        data: {
          childId: child.id,
          classroomId: child.classroom?.id ?? null,
          date: occurredAt,
          status,
          absenceReason: null,
        },
      });
      created.push(await tx.checkInOutLog.create({
        data: {
          childId: child.id,
          centerId,
          classroomId: child.classroom?.id ?? null,
          guardianId: guardian.id,
          type,
          occurredAt,
          pickupName: guardian.fullName,
          signaturePlaceholder: true,
          verificationStatus: "pin_verified",
          pinVerified: true,
          notes: clean(body.notes) || null,
          metadata: {
            signatureMethod: "typed",
            signatureName,
            signatureCapturedAt: occurredAt.toISOString(),
            latePickup,
            latePickupCutoff,
            timeZone,
          },
        },
      }));
    }
    return created;
  });

  await writeSystemAuditLog({
    tenantId: center.organization.tenantId,
    centerId,
    action: `kiosk.${type}`,
    resource: "CheckInOutLog",
    resourceId: logs[0]?.id ?? null,
    metadata: {
      guardianId: guardian.id,
      familyId: guardian.family.id,
      childIds: allowedChildren.map((child) => child.id),
      count: logs.length,
      signatureAccepted: true,
      signatureMethod: "typed",
      latePickup,
      latePickupCutoff,
      kioskDate: startOfServiceDay(occurredAt, timeZone).toISOString(),
      timeZone,
    },
  });

  return NextResponse.json({
    ok: true,
    center: { id: center.id, name: center.crmLocationId ?? center.name },
    action: type,
    occurredAt,
    latePickup,
    children: allowedChildren.map((child) => ({ id: child.id, fullName: child.fullName })),
    logs,
  }, { status: 201 });
}
