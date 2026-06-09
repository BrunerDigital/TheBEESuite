import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { notificationTargetGuard } from "@/lib/notification-guardrails";
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
    return NextResponse.json({ ok: false, error: "Push notifications are not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = clean(body.title);
  const message = clean(body.message);
  const targetUserId = clean(body.userId) || null;
  const priority = clean(body.priority) || "normal";

  if (!title || !message) {
    return NextResponse.json({ ok: false, error: "Title and message are required." }, { status: 400 });
  }
  const targetUser = targetUserId
    ? await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          tenantId: true,
          staffProfile: { select: { centerId: true } },
          guardians: { select: { family: { select: { centerId: true } } } },
          accessGrants: {
            where: { isActive: true },
            select: { centerId: true },
          },
        },
      })
    : null;
  if (targetUserId && !targetUser) {
    return NextResponse.json({ ok: false, error: "Notification target not found." }, { status: 404 });
  }
  const targetCenterIds = targetUser
    ? Array.from(new Set([
        targetUser.staffProfile?.centerId,
        ...targetUser.guardians.map((guardian) => guardian.family.centerId),
        ...targetUser.accessGrants.map((grant) => grant.centerId),
      ].filter((centerId): centerId is string => Boolean(centerId))))
    : [];
  const targetGuard = notificationTargetGuard({
    targetUserId,
    actorUserId: user.id,
    actorTenantId: user.tenantId,
    actorCenterIds: user.centerIds,
    actorHasTenantWideAccess: canAccessAllCenters(user),
    targetTenantId: targetUser?.tenantId,
    targetCenterIds,
  });
  if (!targetGuard.ok) {
    return NextResponse.json({ ok: false, error: targetGuard.error }, { status: targetGuard.status });
  }

  const notification = await prisma.notification.create({
    data: {
      userId: targetUserId,
      title,
      body: message,
      type: "push",
      priority,
    },
  });

  await writeAuditLog(user, {
    centerId: user.primaryCenterId,
    action: "integration.push.queued",
    resource: "Notification",
    resourceId: notification.id,
    metadata: {
      provider: "in_app_notification",
      pushProviderConfigured: Boolean(process.env.PUSH_PROVIDER_KEY),
      targetUserId,
    },
  });

  return NextResponse.json({
    ok: true,
    notification,
    configured: Boolean(process.env.PUSH_PROVIDER_KEY),
    provider: "in_app_notification",
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
