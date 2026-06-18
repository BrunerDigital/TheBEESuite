import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createGuardianQrToken, hashGuardianPin, normalizePin } from "@/lib/kiosk";
import { notifyOperationsRecordChange } from "@/lib/operations-notifications";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "PIN setup is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const guardianId = clean(body.guardianId);
  const pin = normalizePin(body.pin);
  if (!guardianId || !pin) {
    return NextResponse.json({ ok: false, error: "Guardian ID and a 4 digit PIN are required." }, { status: 400 });
  }

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: {
      family: { select: { id: true, name: true, centerId: true } },
    },
  });

  if (!guardian) {
    return NextResponse.json({ ok: false, error: "Guardian not found." }, { status: 404 });
  }
  const accessGuard = centerScopedAccessGuard({
    centerId: guardian.family.centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(guardian.family.centerId && user.centerIds.includes(guardian.family.centerId)),
    resourceLabel: "Guardian",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const pinSetAt = new Date();
  const checkInPinHash = hashGuardianPin(guardian.id, pin);
  await prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      checkInPinHash,
      checkInPinSetAt: pinSetAt,
      checkInPinSetById: user.id,
    },
  });

  await writeAuditLog(user, {
    centerId: guardian.family.centerId,
    action: "guardian.pin.set",
    resource: "Guardian",
    resourceId: guardian.id,
    metadata: {
      familyId: guardian.family.id,
      familyName: guardian.family.name,
    },
  });

  await notifyOperationsRecordChange({
    actor: user,
    entity: "guardian",
    mode: "updated",
    resourceId: guardian.id,
    centerId: guardian.family.centerId,
  }).catch(() => 0);

  return NextResponse.json({
    ok: true,
    guardian: {
      id: guardian.id,
      fullName: guardian.fullName,
      familyName: guardian.family.name,
      pinSetAt: pinSetAt.toISOString(),
      qrToken: createGuardianQrToken({
        centerId: guardian.family.centerId,
        guardianId: guardian.id,
        checkInPinSetAt: pinSetAt,
        checkInPinHash,
      }),
    },
  });
}

export const POST = withApiLogging("POST", POSTHandler);
