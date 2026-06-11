import { NextRequest, NextResponse } from "next/server";
import { latestLogMap, readCenterTimeZone, startOfServiceDay } from "@/lib/attendance-state";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { normalizeGuardianQrToken, normalizePin, parseGuardianQrToken, verifyGuardianPin, verifyGuardianQrToken } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function findGuardianByPin(centerId: string, pin: string) {
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
            where: { enrollmentStatus: { not: "withdrawn" } },
            orderBy: { fullName: "asc" },
            select: {
              id: true,
              fullName: true,
              preferredName: true,
              ageGroup: true,
              classroom: { select: { id: true, name: true, centerId: true } },
            },
          },
        },
      },
    },
  });
  return guardians.find((item) => verifyGuardianPin(item.id, pin, item.checkInPinHash)) ?? null;
}

async function findGuardianByQrToken(centerId: string, qrToken: string) {
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
            where: { enrollmentStatus: { not: "withdrawn" } },
            orderBy: { fullName: "asc" },
            select: {
              id: true,
              fullName: true,
              preferredName: true,
              ageGroup: true,
              classroom: { select: { id: true, name: true, centerId: true } },
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
  const body = await request.json().catch(() => ({}));
  const centerId = clean(body.centerId);
  const pin = normalizePin(body.pin);
  const qrToken = normalizeGuardianQrToken(body.qrToken);
  const ip = requestIp(request.headers);
  const limited = checkRateLimit({ key: `kiosk-lookup:${centerId}:${ip}`, limit: 12, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many kiosk attempts. Please ask the front desk for help." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  if (!centerId || (!pin && !qrToken)) {
    return NextResponse.json({ ok: false, error: "Center and a PIN or QR code are required." }, { status: 400 });
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: { id: true, name: true, crmLocationId: true, customFields: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Kiosk center not found." }, { status: 404 });
  }

  const verificationMethod = qrToken ? "qr" : "pin";
  const guardian = qrToken
    ? await findGuardianByQrToken(centerId, qrToken)
    : await findGuardianByPin(centerId, pin);
  if (!guardian) {
    return NextResponse.json(
      { ok: false, error: verificationMethod === "qr" ? "QR code was not recognized for this school." : "PIN was not recognized for this school." },
      { status: 401 },
    );
  }

  const visibleChildren = guardian.family.children.filter((child) => child.classroom?.centerId === centerId || !child.classroom);
  const childIds = visibleChildren.map((child) => child.id);
  const timeZone = readCenterTimeZone(center.customFields);
  const serviceDayStart = startOfServiceDay(new Date(), timeZone);
  const serviceDayEnd = new Date(serviceDayStart.getTime() + 24 * 60 * 60 * 1000);
  const latestLogs = childIds.length
    ? await prisma.checkInOutLog.findMany({
        where: { childId: { in: childIds }, occurredAt: { gte: serviceDayStart, lt: serviceDayEnd } },
        orderBy: { occurredAt: "desc" },
        select: { childId: true, type: true, occurredAt: true },
      })
    : [];
  const latestByChild = latestLogMap(latestLogs);

  return NextResponse.json({
    ok: true,
    center: { id: center.id, name: center.name, crmLocationId: center.crmLocationId },
    guardian: { id: guardian.id, fullName: guardian.fullName, relation: guardian.relation },
    family: { id: guardian.family.id, name: guardian.family.name },
    verification: { method: verificationMethod },
    warnings: guardian.family.custodyNotes
      ? [{
          type: "protected_pickup_note",
          message: "A protected pickup note is on file. Please ask the front desk to verify before checkout.",
        }]
      : [],
    children: visibleChildren.map((child) => {
      const latest = latestByChild.get(child.id);
      return {
        id: child.id,
        fullName: child.fullName,
        preferredName: child.preferredName,
        ageGroup: child.ageGroup,
        classroom: child.classroom ? { id: child.classroom.id, name: child.classroom.name } : null,
        lastAction: latest ? { type: latest.type, occurredAt: latest.occurredAt } : null,
      };
    }),
  });
}

export const POST = withApiLogging("POST", POSTHandler);
