import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashGuardianPin, normalizePin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]),
  );
}

function customFields(value: unknown, updates: Record<string, unknown>) {
  return stripUndefined({
    ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}),
    ...updates,
  }) as Prisma.InputJsonObject;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Only linked parent accounts can finish parent portal setup." }, { status: 403 });
  }

  const limited = checkRateLimit({
    key: `parent-portal-setup:${user.id}:${requestIp(request.headers)}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many setup attempts. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const guardianId = clean(body.guardianId);
  const fullName = clean(body.fullName);
  const phone = clean(body.phone);
  const relation = clean(body.relation) || "Parent/Guardian";
  const preferredCommunication = clean(body.preferredCommunication) || null;
  const pinInput = clean(body.pin);
  const pin = normalizePin(pinInput);

  if (!guardianId) {
    return NextResponse.json({ ok: false, error: "Guardian profile is required." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ ok: false, error: "Your full name is required." }, { status: 400 });
  }
  if (pinInput && !pin) {
    return NextResponse.json({ ok: false, error: "Check-in PIN must be exactly 4 digits." }, { status: 400 });
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
  if (!guardian.checkInPinHash && !pin) {
    return NextResponse.json({ ok: false, error: "A 4 digit check-in PIN is required for sign-in and sign-out." }, { status: 400 });
  }

  const pinSetAt = pin ? new Date() : null;
  const [updated] = await prisma.$transaction([
    prisma.guardian.update({
      where: { id: guardian.id },
      data: {
        fullName,
        phone: phone || null,
        relation,
        preferredCommunication,
        ...(pin
          ? {
              checkInPinHash: hashGuardianPin(guardian.id, pin),
              checkInPinSetAt: pinSetAt,
              checkInPinSetById: user.id,
            }
          : {}),
        customFields: customFields(guardian.customFields, {
          parentPortalSetup: {
            completedAt: new Date().toISOString(),
            completedBy: user.email,
            confirmedContact: true,
            pinReady: Boolean(pin || guardian.checkInPinHash),
          },
        }),
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { name: fullName },
    }),
  ]);

  await writeAuditLog(user, {
    centerId: guardian.family.centerId,
    action: "parent_portal.setup_completed",
    resource: "Guardian",
    resourceId: guardian.id,
    metadata: {
      familyId: guardian.family.id,
      familyName: guardian.family.name,
      phoneUpdated: phone !== (guardian.phone ?? ""),
      pinSet: Boolean(pin),
    },
  });

  return NextResponse.json({
    ok: true,
    guardian: {
      id: updated.id,
      fullName: updated.fullName,
      phone: updated.phone,
      relation: updated.relation,
      preferredCommunication: updated.preferredCommunication,
      pinReady: Boolean(updated.checkInPinHash),
    },
  });
}

export const POST = withApiLogging("POST", POSTHandler);
