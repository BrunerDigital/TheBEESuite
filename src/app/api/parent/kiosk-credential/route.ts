import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { buildGuardianKioskCredential } from "@/lib/kiosk-credentials";
import { hashGuardianPin, normalizePin } from "@/lib/kiosk";
import { notifyOperationsRecordChange } from "@/lib/operations-notifications";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function centerNamesFor(centerIds: string[]) {
  if (!centerIds.length) return new Map<string, string>();
  const centers = await prisma.center.findMany({
    where: { id: { in: centerIds } },
    select: { id: true, name: true, crmLocationId: true },
  });
  return new Map(centers.map((center) => [center.id, center.crmLocationId ?? center.name]));
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Only linked parents and guardians can manage kiosk credentials here." }, { status: 403 });
  }

  const guardians = await prisma.guardian.findMany({
    where: { userId: user.id },
    orderBy: { fullName: "asc" },
    include: {
      family: { select: { id: true, name: true, centerId: true } },
    },
  });
  const centerNameById = await centerNamesFor(guardians.map((guardian) => guardian.family.centerId ?? "").filter(Boolean));

  return NextResponse.json({
    ok: true,
    credentials: guardians.map((guardian) => buildGuardianKioskCredential({
      id: guardian.id,
      fullName: guardian.fullName,
      checkInPinSetAt: guardian.checkInPinSetAt,
      checkInPinHash: guardian.checkInPinHash,
      family: {
        id: guardian.family.id,
        name: guardian.family.name,
        centerId: guardian.family.centerId,
        centerName: guardian.family.centerId ? centerNameById.get(guardian.family.centerId) ?? null : null,
      },
    })),
  });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Only linked parents and guardians can manage kiosk credentials here." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const guardianId = clean(body.guardianId);
  const pin = normalizePin(body.pin);
  if (!guardianId || !pin) {
    return NextResponse.json({ ok: false, error: "Guardian ID and a 4 digit PIN are required." }, { status: 400 });
  }
  const limited = checkRateLimit({
    key: `parent-kiosk-credential:${user.id}:${requestIp(request.headers)}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many kiosk PIN updates. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, userId: user.id },
    include: {
      family: { select: { id: true, name: true, centerId: true } },
    },
  });
  if (!guardian) {
    return NextResponse.json({ ok: false, error: "Guardian profile is not linked to this account." }, { status: 404 });
  }

  const pinSetAt = new Date();
  const checkInPinHash = hashGuardianPin(guardian.id, pin);
  const updated = await prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      checkInPinHash,
      checkInPinSetAt: pinSetAt,
      checkInPinSetById: user.id,
    },
    include: {
      family: { select: { id: true, name: true, centerId: true } },
    },
  });
  const centerNameById = await centerNamesFor(updated.family.centerId ? [updated.family.centerId] : []);

  await writeAuditLog(user, {
    centerId: updated.family.centerId,
    action: "parent.guardian_pin.set",
    resource: "Guardian",
    resourceId: updated.id,
    metadata: {
      familyId: updated.family.id,
      familyName: updated.family.name,
      source: "parent_portal",
    },
  });

  await notifyOperationsRecordChange({
    actor: user,
    entity: "guardian",
    mode: "updated",
    resourceId: updated.id,
    centerId: updated.family.centerId,
  }).catch(() => 0);

  return NextResponse.json({
    ok: true,
    credential: buildGuardianKioskCredential({
      id: updated.id,
      fullName: updated.fullName,
      checkInPinSetAt: updated.checkInPinSetAt,
      checkInPinHash: updated.checkInPinHash,
      family: {
        id: updated.family.id,
        name: updated.family.name,
        centerId: updated.family.centerId,
        centerName: updated.family.centerId ? centerNameById.get(updated.family.centerId) ?? null : null,
      },
    }),
  });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
