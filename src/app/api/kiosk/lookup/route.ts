import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { centerServiceDayWindow, latestLogMap } from "@/lib/attendance-state";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { normalizeGuardianQrToken, normalizePin, parseGuardianQrToken, verifyGuardianPin, verifyGuardianQrToken } from "@/lib/kiosk";
import { buildKioskTuitionBalanceSummary, buildKioskTuitionBalanceWarning } from "@/lib/kiosk-billing-reminders";
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
          billingAccount: {
            select: {
              balanceCents: true,
              invoices: {
                where: { status: PaymentStatus.OPEN, totalCents: { gt: 0 } },
                orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
                take: 1,
                select: { number: true, totalCents: true, dueDate: true },
              },
            },
          },
          children: {
            where: currentlyEnrolledChildWhere(),
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
          billingAccount: {
            select: {
              balanceCents: true,
              invoices: {
                where: { status: PaymentStatus.OPEN, totalCents: { gt: 0 } },
                orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
                take: 1,
                select: { number: true, totalCents: true, dueDate: true },
              },
            },
          },
          children: {
            where: currentlyEnrolledChildWhere(),
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
  const limited = await checkPersistentRateLimit({ key: `kiosk-lookup:${centerId}:${ip}`, limit: 12, windowMs: 60_000 });
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
    select: { id: true, name: true, crmLocationId: true, city: true, state: true, postalCode: true, timezone: true, customFields: true },
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

  const visibleChildren = guardian.family.children.filter((child) => child.classroom?.centerId === centerId);
  const childIds = visibleChildren.map((child) => child.id);
  const serviceDay = centerServiceDayWindow(new Date(), center);
  const latestLogs = childIds.length
    ? await prisma.checkInOutLog.findMany({
        where: { childId: { in: childIds }, occurredAt: { gte: serviceDay.start, lt: serviceDay.end } },
        orderBy: { occurredAt: "desc" },
        select: { childId: true, type: true, occurredAt: true },
      })
    : [];
  const latestByChild = latestLogMap(latestLogs);
  const tuitionBalanceWarning = buildKioskTuitionBalanceWarning({
    balanceCents: guardian.family.billingAccount?.balanceCents,
    nextOpenInvoice: guardian.family.billingAccount?.invoices[0] ?? null,
  });
  const billingSummary = buildKioskTuitionBalanceSummary({
    balanceCents: guardian.family.billingAccount?.balanceCents,
    nextOpenInvoice: guardian.family.billingAccount?.invoices[0] ?? null,
    paymentUrl: "/parent-portal#billing",
  });
  const warnings = [
    ...(guardian.family.custodyNotes
      ? [{
          type: "protected_pickup_note",
          message: "A protected pickup note is on file. Please ask the front desk to verify before checkout.",
        }]
      : []),
    ...(tuitionBalanceWarning ? [tuitionBalanceWarning] : []),
  ];

  return NextResponse.json({
    ok: true,
    center: { id: center.id, name: center.name, crmLocationId: center.crmLocationId },
    guardian: { id: guardian.id, fullName: guardian.fullName, relation: guardian.relation },
    family: { id: guardian.family.id, name: guardian.family.name },
    billing: billingSummary,
    verification: { method: verificationMethod },
    warnings,
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
