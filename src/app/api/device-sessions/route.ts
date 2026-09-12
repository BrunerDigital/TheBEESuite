import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { teamDeviceSessionWhere } from "@/lib/team-permissions-scope";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  const authorizedSessionWhere = teamDeviceSessionWhere({
    tenantId: user.tenantId, tenantWide: canAccessAllCenters(user), visibleCenterIds: user.centerIds, at: now,
  });
  const deviceSession = await prisma.deviceSession.findFirst({
    where: { AND: [{ id: sessionId }, authorizedSessionWhere] },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!deviceSession) {
    return NextResponse.json({ ok: false, error: "Device session was not found." }, { status: 404 });
  }
  if (deviceSession.revokedAt) return NextResponse.json({ ok: true, revokedAt: deviceSession.revokedAt.toISOString() });

  const revoked = await prisma.$transaction(async (tx) => {
    const changed = await tx.deviceSession.updateMany({
      where: { AND: [{ id: deviceSession.id, revokedAt: null }, authorizedSessionWhere] },
      data: { revokedAt: now, revokedById: user.id },
    });
    if (changed.count !== 1) return false;
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
    }, tx);
    return true;
  });

  if (!revoked) return NextResponse.json({ ok: false, error: "The session or its access changed. Refresh the list before trying again." }, { status: 409 });

  return NextResponse.json({ ok: true, revokedAt: now.toISOString() });
}

export const POST = withApiLogging("POST", POSTHandler);
