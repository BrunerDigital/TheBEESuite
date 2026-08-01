import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

async function POSTHandler() {
  const session = await getSession();
  if (session?.deviceSessionId) {
    const now = new Date();
    await prisma.$transaction([
      prisma.webPushDelivery.updateMany({
        where: {
          subscription: {
            deviceSessionId: session.deviceSessionId,
            userId: session.userId,
          },
          status: { in: ["pending", "processing", "retry"] },
        },
        data: {
          status: "cancelled",
          failedAt: now,
          errorCode: "device_session_logout",
        },
      }),
      prisma.webPushSubscription.updateMany({
        where: {
          deviceSessionId: session.deviceSessionId,
          userId: session.userId,
          isActive: true,
        },
        data: {
          isActive: false,
          lastSeenAt: now,
        },
      }),
      prisma.deviceSession.updateMany({
        where: {
          id: session.deviceSessionId,
          userId: session.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedById: session.userId,
        },
      }),
    ]).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export const POST = withApiLogging("POST", POSTHandler);
