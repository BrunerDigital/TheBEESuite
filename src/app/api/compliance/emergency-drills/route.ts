import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmergencyDrillInput } from "@/lib/compliance-workflows";
import { parseOperationalDate } from "@/lib/date-guardrails";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalDate(value: unknown, fieldLabel: string) {
  if (!clean(value)) return { ok: true as const, date: null };
  const parsed = parseOperationalDate(value, fieldLabel);
  return parsed.ok ? { ok: true as const, date: parsed.date } : parsed;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Emergency drill logs are not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = normalizeEmergencyDrillInput(body);
  if (!input.centerId) {
    return NextResponse.json({ ok: false, error: "Center is required." }, { status: 400 });
  }

  const center = await prisma.center.findUnique({
    where: { id: input.centerId },
    select: { id: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }
  const accessGuard = centerScopedAccessGuard({
    centerId: center.id,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: canAccessCenter(user, center.id),
    resourceLabel: "Center",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const conductedAt = parseOperationalDate(body.conductedAt, "Drill date and time");
  if (!conductedAt.ok) {
    return NextResponse.json({ ok: false, error: conductedAt.error }, { status: conductedAt.status });
  }
  const nextDueAt = optionalDate(body.nextDueAt, "Next drill due date");
  if (!nextDueAt.ok) {
    return NextResponse.json({ ok: false, error: nextDueAt.error }, { status: nextDueAt.status });
  }

  const drillLog = await prisma.emergencyDrillLog.create({
    data: {
      centerId: center.id,
      drillType: input.drillType,
      conductedAt: conductedAt.date,
      durationMinutes: input.durationMinutes,
      participants: input.participants,
      outcome: input.outcome,
      notes: input.notes,
      nextDueAt: nextDueAt.date,
      createdById: user.id,
    },
    include: {
      center: { select: { name: true, crmLocationId: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "compliance.emergency_drill.created",
    resource: "EmergencyDrillLog",
    resourceId: drillLog.id,
    metadata: {
      drillType: drillLog.drillType,
      conductedAt: drillLog.conductedAt.toISOString(),
      outcome: drillLog.outcome,
      nextDueAt: drillLog.nextDueAt?.toISOString() ?? null,
    },
  });

  return NextResponse.json({ ok: true, drillLog }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
