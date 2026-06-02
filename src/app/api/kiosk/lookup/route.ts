import { NextRequest, NextResponse } from "next/server";
import { latestLogMap, readCenterTimeZone, startOfServiceDay } from "@/lib/attendance-state";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { normalizePin, verifyGuardianPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const centerId = clean(body.centerId);
  const pin = normalizePin(body.pin);
  const ip = requestIp(request.headers);
  const limited = checkRateLimit({ key: `kiosk-lookup:${centerId}:${ip}`, limit: 12, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many PIN attempts. Please ask the front desk for help." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  if (!centerId || !pin) {
    return NextResponse.json({ ok: false, error: "Center and 4 digit PIN are required." }, { status: 400 });
  }

  const center = await prisma.center.findFirst({
    where: { id: centerId, status: { not: "closed" } },
    select: { id: true, name: true, crmLocationId: true, customFields: true },
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

  const guardian = guardians.find((item) => verifyGuardianPin(item.id, pin, item.checkInPinHash));
  if (!guardian) {
    return NextResponse.json({ ok: false, error: "PIN was not recognized for this school." }, { status: 401 });
  }

  const visibleChildren = guardian.family.children.filter((child) => child.classroom?.centerId === centerId || !child.classroom);
  const childIds = visibleChildren.map((child) => child.id);
  const timeZone = readCenterTimeZone(center.customFields);
  const latestLogs = childIds.length
    ? await prisma.checkInOutLog.findMany({
        where: { childId: { in: childIds }, occurredAt: { gte: startOfServiceDay(new Date(), timeZone) } },
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
