import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { parseOperationalDate } from "@/lib/date-guardrails";
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
    return NextResponse.json({ ok: false, error: "Medication logs are not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const childId = clean(body.childId);
  const medicationName = clean(body.medicationName);
  const dosage = clean(body.dosage);
  const route = clean(body.route) || null;
  const notes = clean(body.notes) || null;
  const status = clean(body.status) || "administered";
  const parentNotified = Boolean(body.parentNotified);

  if (!childId || !medicationName || !dosage) {
    return NextResponse.json({ ok: false, error: "Child, medication, and dosage are required." }, { status: 400 });
  }
  const administeredAt = parseOperationalDate(body.administeredAt, "Medication administration time");
  if (!administeredAt.ok) {
    return NextResponse.json({ ok: false, error: administeredAt.error }, { status: administeredAt.status });
  }

  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      classroom: { select: { centerId: true } },
      family: { select: { centerId: true } },
    },
  });
  if (!child) {
    return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
  }

  const centerId = child.classroom?.centerId ?? child.family.centerId;
  const accessGuard = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Child",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const medicationLog = await prisma.medicationLog.create({
    data: {
      childId,
      administeredById: user.id,
      medicationName,
      dosage,
      route,
      administeredAt: administeredAt.date,
      notes,
      parentNotified,
      status,
    },
  });

  await writeAuditLog(user, {
    centerId,
    action: "compliance.medication_log.created",
    resource: "MedicationLog",
    resourceId: medicationLog.id,
    metadata: {
      childId,
      medicationName,
      parentNotified,
      status,
    },
  });

  return NextResponse.json({ ok: true, medicationLog }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
