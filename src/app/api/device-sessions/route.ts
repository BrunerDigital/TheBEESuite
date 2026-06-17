import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageOperations, getCurrentUser, type CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

type TargetUserAccess = {
  staffProfile: { centerId: string | null } | null;
  accessGrants: Array<{
    centerId: string | null;
    ownerGroup: { centers: Array<{ id: string }> } | null;
  }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function targetUserIsVisibleToActor(actor: CurrentUser, targetUser: TargetUserAccess) {
  if (canAccessAllCenters(actor)) return true;
  const visibleCenterIds = new Set(actor.centerIds);
  if (targetUser.staffProfile?.centerId && visibleCenterIds.has(targetUser.staffProfile.centerId)) return true;
  return targetUser.accessGrants.some((grant) => {
    if (grant.centerId && visibleCenterIds.has(grant.centerId)) return true;
    return grant.ownerGroup?.centers.some((center) => visibleCenterIds.has(center.id)) ?? false;
  });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication is required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action);

  if (action === "heartbeat") {
    return NextResponse.json({
      ok: true,
      serverNow: new Date().toISOString(),
      deviceSessionId: user.deviceSessionId,
    });
  }

  if (action !== "revoke") {
    return NextResponse.json({ ok: false, error: "Unsupported device session action." }, { status: 400 });
  }

  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "You do not have permission to revoke device sessions." }, { status: 403 });
  }

  const sessionId = clean(body.sessionId);
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Device session id is required." }, { status: 400 });
  }
  if (sessionId === user.deviceSessionId) {
    return NextResponse.json({ ok: false, error: "Use Sign out to end your current device session." }, { status: 400 });
  }

  const now = new Date();
  const deviceSession = await prisma.deviceSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          staffProfile: { select: { centerId: true } },
          accessGrants: {
            where: {
              isActive: true,
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
            },
            select: {
              centerId: true,
              ownerGroup: {
                select: {
                  centers: { select: { id: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!deviceSession || !targetUserIsVisibleToActor(user, deviceSession.user)) {
    return NextResponse.json({ ok: false, error: "Device session was not found." }, { status: 404 });
  }

  await prisma.deviceSession.updateMany({
    where: { id: deviceSession.id, revokedAt: null },
    data: {
      revokedAt: now,
      revokedById: user.id,
    },
  });

  await writeAuditLog(user, {
    action: "device_session.revoked",
    resource: "DeviceSession",
    resourceId: deviceSession.id,
    metadata: {
      targetUserId: deviceSession.user.id,
      targetEmail: deviceSession.user.email,
      appMode: deviceSession.appMode,
      deviceType: deviceSession.deviceType,
      label: deviceSession.label,
    },
  });

  return NextResponse.json({ ok: true, revokedAt: now.toISOString() });
}

export const POST = withApiLogging("POST", POSTHandler);
