import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canManageOperations, getCurrentUser, type CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { notificationPreferenceTypes } from "@/lib/message-templates";
import { roleLabel } from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
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

function roleOptions() {
  return Object.values(UserRole).map((role) => ({ role, label: roleLabel(role) }));
}

function manageableUserWhere(user: CurrentUser): Prisma.UserWhereInput {
  if (canAccessAllCenters(user)) {
    return { tenantId: user.tenantId, isActive: true };
  }

  const centerId = user.centerIds.length ? { in: user.centerIds } : { in: ["__no_authorized_center__"] };
  return {
    tenantId: user.tenantId,
    isActive: true,
    OR: [
      { id: user.id },
      { staffProfile: { centerId } },
      { accessGrants: { some: { isActive: true, centerId } } },
      { guardians: { some: { family: { centerId } } } },
    ],
  };
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const canManageRoleDefaults = canManageOperations(user);
  const userOptions = canManageRoleDefaults
    ? await prisma.user.findMany({
        where: manageableUserWhere(user),
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 500,
        select: { id: true, name: true, email: true, role: true },
      })
    : [{ id: user.id, name: user.name, email: user.email, role: user.role }];
  const userIds = userOptions.map((item) => item.id);
  const preferences = await prisma.notificationPreference.findMany({
    where: canManageRoleDefaults
      ? {
          tenantId: user.tenantId,
          OR: [
            { userId: { in: userIds.length ? userIds : [user.id] } },
            { role: { in: Object.values(UserRole) } },
          ],
        }
      : {
          tenantId: user.tenantId,
          OR: [
            { userId: user.id },
            { role: user.role },
          ],
        },
    orderBy: [{ userId: "desc" }, { role: "asc" }, { type: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    types: notificationPreferenceTypes,
    preferences,
    userOptions,
    roleOptions: roleOptions(),
    currentUserId: user.id,
    currentRole: user.role,
    canManageRoleDefaults,
  });
}

async function POSTHandler(request: NextRequest) {
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
  if (target !== "user" && target !== "role") {
    return NextResponse.json({ ok: false, error: "Preference target must be user or role." }, { status: 400 });
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
  if (targetUserId && targetUserId !== user.id) {
    const manageableUser = await prisma.user.findFirst({
      where: {
        ...manageableUserWhere(user),
        id: targetUserId,
      },
      select: { id: true },
    });
    if (!manageableUser) {
      return NextResponse.json({ ok: false, error: "That user is not available in your notification preference scope." }, { status: 403 });
    }
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

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
