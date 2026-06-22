import { NextRequest, NextResponse } from "next/server";
import { centerServiceDayWindow, isLatePickup, latestLogMap, normalizeCheckAction, readLatePickupCutoff, validateNextCheckAction, validateSelectedChildren } from "@/lib/attendance-state";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { writeSystemAuditLog } from "@/lib/audit";
import { normalizeGuardianQrToken, normalizePin, parseGuardianQrToken, verifyGuardianPin, verifyGuardianQrToken } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import { sendCheckoutDailyReportEmail } from "@/lib/daily-report-email";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function findGuardianByPin(centerId: string, pin: string, childIds: string[]) {
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
          custodyNotes: true,
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
  return guardians.find((item) => verifyGuardianPin(item.id, pin, item.checkInPinHash)) ?? null;
}

async function findGuardianByQrToken(centerId: string, qrToken: string, childIds: string[]) {
  const parsed = parseGuardianQrToken(qrToken);
  if (!parsed || parsed.centerId !== centerId) return null;

  const guardian = await prisma.guardian.findFirst({
    where: {
      id: parsed.guardianId,
      checkInPinHash: { not: null },
      family: { centerId },
    },
    include: {
      family: {
        select: {
          id: true,
          name: true,
          custodyNotes: true,
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

  if (!guardian) return null;
  return verifyGuardianQrToken({
    token: qrToken,
    centerId,
    guardianId: guardian.id,
    checkInPinSetAt: guardian.checkInPinSetAt,
    checkInPinHash: guardian.checkInPinHash,
  }) ? guardian : null;
}

async function POSTHandler(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const centerId = clean(body.centerId);
  const pin = normalizePin(body.pin);
  const qrToken = normalizeGuardianQrToken(body.qrToken);
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

  if (!centerId || (!pin && !qrToken) || !type || !childIds.length) {
    return NextResponse.json({ ok: false, error: "Center, PIN or QR code, action, and at least one child are required." }, { status: 400 });
  }
  if (!signatureName) {
    return NextResponse.json({ ok: false, error: "Typed guardian signature is required." }, { status: 400 });
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: { id: true, name: true, email: true, crmLocationId: true, city: true, state: true, postalCode: true, timezone: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Kiosk center not found." }, { status: 404 });
  }

  const verificationMethod = qrToken ? "qr" : "pin";
  const guardian = qrToken
    ? await findGuardianByQrToken(centerId, qrToken, childIds)
    : await findGuardianByPin(centerId, pin, childIds);
  if (!guardian) {
    return NextResponse.json(
      { ok: false, error: verificationMethod === "qr" ? "QR code was not recognized for this school." : "PIN was not recognized for this school." },
      { status: 401 },
    );
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
  const serviceDay = centerServiceDayWindow(occurredAt, center);
  const timeZone = serviceDay.timeZone;
  const latePickupCutoff = readLatePickupCutoff(center.customFields);
  const latePickup = type === "check_out" && isLatePickup(occurredAt, timeZone, latePickupCutoff);
  const pickupAuthorizationWarning = Boolean(guardian.family.custodyNotes);
  const latestLogs = await prisma.checkInOutLog.findMany({
    where: {
      childId: { in: allowedChildren.map((child) => child.id) },
      centerId,
      occurredAt: { gte: serviceDay.start, lt: serviceDay.end },
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
      const attendanceData = {
        childId: child.id,
        classroomId: child.classroom?.id ?? null,
        date: occurredAt,
        status,
        absenceReason: null,
        sourceSystem: "kiosk",
        externalId: `kiosk-attendance:${child.id}:${serviceDay.start.toISOString()}`,
        metadata: {
          centerId,
          serviceDay: serviceDay.start.toISOString(),
          lastKioskAction: type,
          lastKioskActionAt: occurredAt.toISOString(),
          verificationMethod,
          latePickup,
          pickupAuthorizationWarning,
          timeZone,
        },
      };
      const existingAttendance = await tx.attendanceRecord.findFirst({
        where: {
          childId: child.id,
          date: { gte: serviceDay.start, lt: serviceDay.end },
        },
        select: { id: true },
      });
      if (existingAttendance) {
        await tx.attendanceRecord.update({
          where: { id: existingAttendance.id },
          data: attendanceData,
        });
      } else {
        await tx.attendanceRecord.create({ data: attendanceData });
      }
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
          verificationStatus: verificationMethod === "qr" ? "qr_verified" : "pin_verified",
          pinVerified: verificationMethod === "pin",
          notes: clean(body.notes) || null,
          sourceSystem: "kiosk",
          externalId: `kiosk:${type}:${child.id}:${occurredAt.toISOString()}`,
          metadata: {
            verificationMethod,
            qrVerified: verificationMethod === "qr",
            pinVerified: verificationMethod === "pin",
            signatureMethod: "typed",
            signatureName,
            signatureCapturedAt: occurredAt.toISOString(),
            latePickup,
            latePickupCutoff,
            pickupAuthorizationWarning,
            timeZone,
          },
        },
      }));
    }
    return created;
  });

  const dailyReportEmails = type === "check_out"
    ? await Promise.all(
        allowedChildren.map(async (child) => {
          try {
            const email = await sendCheckoutDailyReportEmail({
              childId: child.id,
              tenantId: center.organization.tenantId,
              centerId,
              centerName: center.name,
              centerEmail: center.email,
              serviceDayStart: serviceDay.start,
              serviceDayEnd: serviceDay.end,
              checkedOutAt: occurredAt,
              timeZone,
            });
            return { childId: child.id, childName: child.fullName, ...email };
          } catch (error) {
            return {
              childId: child.id,
              childName: child.fullName,
              attempted: false,
              reason: "provider_failed" as const,
              reportId: null,
              recipients: [],
              configured: false,
              provider: "sendgrid" as const,
              providerMessageId: null,
              error: error instanceof Error ? error.message : "Daily report email could not be sent.",
              deliveryRecorded: false,
              deliveryRecordError: null,
            };
          }
        }),
      )
    : [];

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
      verificationMethod,
      latePickup,
      latePickupCutoff,
      pickupAuthorizationWarning,
      kioskDate: serviceDay.start.toISOString(),
      timeZone,
      dailyReportEmails,
    },
  });

  return NextResponse.json({
    ok: true,
    center: { id: center.id, name: center.crmLocationId ?? center.name },
    action: type,
    verification: { method: verificationMethod },
    occurredAt,
    latePickup,
    pickupAuthorizationWarning,
    children: allowedChildren.map((child) => ({ id: child.id, fullName: child.fullName })),
    dailyReportEmails,
    logs,
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
