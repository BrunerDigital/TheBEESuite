import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeParentNotificationPreferences } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Only linked parent accounts can update parent preferences." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const guardianId = clean(body.guardianId);
  if (!guardianId) {
    return NextResponse.json({ ok: false, error: "Guardian ID is required." }, { status: 400 });
  }

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    include: {
      family: { select: { id: true, centerId: true } },
    },
  });
  if (!guardian) {
    return NextResponse.json({ ok: false, error: "Guardian not found." }, { status: 404 });
  }
  if (guardian.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "You do not have access to this guardian profile." }, { status: 403 });
  }

  const preferences = normalizeParentNotificationPreferences(body.preferences && typeof body.preferences === "object"
    ? body.preferences as Record<string, unknown>
    : body);
  const customFields =
    guardian.customFields && typeof guardian.customFields === "object" && !Array.isArray(guardian.customFields)
      ? guardian.customFields
      : {};

  const updated = await prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      preferredCommunication:
        preferences.sms && guardian.phone ? "sms" : preferences.email && guardian.email ? "email" : guardian.preferredCommunication,
      customFields: {
        ...customFields,
        notificationPreferences: preferences,
        notificationPreferencesUpdatedAt: new Date().toISOString(),
      },
    },
  });

  await writeAuditLog(user, {
    centerId: guardian.family.centerId,
    action: "parent.notification_preferences.updated",
    resource: "Guardian",
    resourceId: guardian.id,
    metadata: {
      familyId: guardian.family.id,
      preferences,
    },
  });

  return NextResponse.json({
    ok: true,
    guardian: {
      id: updated.id,
      preferredCommunication: updated.preferredCommunication,
      notificationPreferences: preferences,
    },
  });
}
