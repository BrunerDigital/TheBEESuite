import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { notificationPreferenceTypes } from "@/lib/message-templates";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function validPreferenceType(value: unknown) {
  const next = clean(value);
  return notificationPreferenceTypes.some((item) => item.type === next) ? next : "";
}

function validRole(value: unknown) {
  const next = clean(value);
  return Object.values(UserRole).includes(next as UserRole) ? next as UserRole : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const preferences = await prisma.notificationPreference.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { userId: user.id },
        { role: user.role },
      ],
    },
    orderBy: [{ userId: "desc" }, { type: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    types: notificationPreferenceTypes,
    preferences,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const type = validPreferenceType(body.type);
  const target = clean(body.target) || "user";
  const role = target === "role" ? validRole(body.role) : null;
  const targetUserId = target === "user" ? clean(body.userId) || user.id : null;

  if (!type) {
    return NextResponse.json({ ok: false, error: "A valid preference type is required." }, { status: 400 });
  }
  if (target === "role" && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Only school leadership can update role defaults." }, { status: 403 });
  }
  if (target === "role" && !role) {
    return NextResponse.json({ ok: false, error: "A valid role is required." }, { status: 400 });
  }
  if (targetUserId !== user.id && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Only school leadership can update another user's preferences." }, { status: 403 });
  }

  const data = {
    tenantId: user.tenantId,
    userId: target === "user" ? targetUserId : null,
    role: target === "role" ? role : null,
    type,
    emailEnabled: bool(body.emailEnabled, true),
    smsEnabled: bool(body.smsEnabled, false),
    pushEnabled: bool(body.pushEnabled, true),
  };

  const preference = target === "role"
    ? await prisma.notificationPreference.upsert({
        where: { tenantId_role_type: { tenantId: user.tenantId, role: role!, type } },
        update: data,
        create: data,
      })
    : await prisma.notificationPreference.upsert({
        where: { tenantId_userId_type: { tenantId: user.tenantId, userId: targetUserId!, type } },
        update: data,
        create: data,
      });

  await writeAuditLog(user, {
    centerId: user.primaryCenterId,
    action: "notification.preference.updated",
    resource: "NotificationPreference",
    resourceId: preference.id,
    metadata: {
      type,
      target,
      role,
      targetUserId,
      channels: {
        email: preference.emailEnabled,
        sms: preference.smsEnabled,
        push: preference.pushEnabled,
      },
    },
  });

  return NextResponse.json({ ok: true, preference });
}
