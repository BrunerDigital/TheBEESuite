import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendGridDeliveryStatus,
  sendGridMessageIdCandidates,
  type SendGridEvent,
  verifySendGridEventSignature,
} from "@/lib/sendgrid-events";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

async function POSTHandler(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("x-twilio-email-event-webhook-signature");
  const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp");
  if (!verifySendGridEventSignature({
    payload,
    signature,
    timestamp,
    verificationKey: process.env.SENDGRID_EVENT_WEBHOOK_VERIFICATION_KEY,
  })) {
    return NextResponse.json({ ok: false, error: "Invalid SendGrid signature." }, { status: 403 });
  }

  let events: SendGridEvent[];
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Expected an event array.");
    events = parsed as SendGridEvent[];
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid SendGrid event payload." }, { status: 400 });
  }

  let updated = 0;
  for (const event of events) {
    const status = sendGridDeliveryStatus(event.event ?? "");
    const ids = sendGridMessageIdCandidates(event.sg_message_id ?? "");
    if (!status || !ids.length) continue;
    const now = new Date();
    const result = await prisma.integrationDelivery.updateMany({
      where: { provider: "sendgrid", providerMessageId: { in: ids } },
      data: {
        status,
        lastResult: {
          ok: status !== "failed",
          event: event.event ?? null,
          sgEventId: event.sg_event_id ?? null,
          sgMessageId: event.sg_message_id ?? null,
          timestamp: event.timestamp ?? null,
          response: event.response ?? null,
          reason: event.reason ?? null,
        },
        lastError: status === "failed" ? event.reason || event.response || event.event || "SendGrid delivery failed." : null,
        nextAttemptAt: null,
        deliveredAt: status === "delivered" ? now : null,
      },
    });
    updated += result.count;
  }

  return new Response(JSON.stringify({ ok: true, received: events.length, updated }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const POST = withApiLogging("POST", POSTHandler);
