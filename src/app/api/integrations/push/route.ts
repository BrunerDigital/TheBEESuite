import { NextRequest, NextResponse } from "next/server";
import { canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
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
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Push notifications are not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const title = clean(body.title);
  const message = clean(body.message);
  const targetUserId = clean(body.userId) || null;
  const priority = clean(body.priority) || "normal";

  if (!title || !message) {
    return NextResponse.json({ ok: false, error: "Title and message are required." }, { status: 400 });
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
