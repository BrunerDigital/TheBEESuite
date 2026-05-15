import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { sendSms } from "@/lib/integrations";
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
    return NextResponse.json({ ok: false, error: "SMS sending is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const to = clean(body.to);
  const message = clean(body.message);
  const centerId = clean(body.centerId) || user.primaryCenterId;

  if (!to || !message) {
    return NextResponse.json({ ok: false, error: "Recipient phone and message are required." }, { status: 400 });
  }
  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const result = await sendSms({ to, body: message });

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: result.ok ? "SMS sent" : result.configured ? "SMS failed" : "SMS queued as configuration task",
      body: result.ok
        ? `Message sent to ${to}.`
        : result.error || "Twilio credentials are required before this SMS can be delivered.",
      type: "integration",
      priority: result.ok ? "normal" : "high",
    },
  });

  await writeAuditLog(user, {
    centerId,
    action: result.ok ? "integration.sms.sent" : "integration.sms.not_sent",
    resource: "Integration",
    metadata: {
      provider: result.provider,
      configured: result.configured,
      recipientLast4: to.slice(-4),
      providerId: result.id ?? null,
      error: result.error ?? null,
    },
  });

  return NextResponse.json({ ok: result.ok, configured: result.configured, provider: result.provider, id: result.id, error: result.error });
}
