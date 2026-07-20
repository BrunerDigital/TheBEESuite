import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  processSendGridEventBatch,
  type NormalizedSendGridEvent,
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

  let events: unknown[];
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Expected an event array.");
    events = parsed;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid SendGrid event payload." }, { status: 400 });
  }

  let updated = 0;
  const summary = await processSendGridEventBatch(events, {
    processOnce: async (event: NormalizedSendGridEvent) => {
      try {
        const matched = await prisma.$transaction(async (tx) => {
          await tx.sendGridEventReceipt.create({
            data: {
              eventId: event.eventId,
              providerMessageId: event.messageIds[0],
              eventType: event.eventType,
              occurredAt: event.occurredAt,
            },
          });
          const statusGuard = event.status === "accepted"
            ? { notIn: ["delivered", "failed"] }
            : event.status === "delivered"
              ? { not: "failed" }
              : undefined;
          const result = await tx.integrationDelivery.updateMany({
            where: {
              provider: "sendgrid",
              providerMessageId: { in: event.messageIds },
              ...(statusGuard ? { status: statusGuard } : {}),
            },
            data: {
              status: event.status,
              lastResult: {
                ok: event.status !== "failed",
                event: event.eventType,
                eventId: event.eventId,
                occurredAt: event.occurredAt?.toISOString() ?? null,
                failureKind: event.failureKind,
              },
              lastError: event.status === "failed" ? `SendGrid ${event.failureKind || "delivery"} event.` : null,
              nextAttemptAt: null,
              deliveredAt: event.status === "delivered" ? event.occurredAt ?? new Date() : null,
            },
          });
          await tx.sendGridEventReceipt.update({
            where: { eventId: event.eventId },
            data: { matchedDeliveries: result.count },
          });
          return result.count;
        });
        updated += matched;
        return "processed" as const;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate" as const;
        throw error;
      }
    },
  });

  return new Response(JSON.stringify({ ok: true, ...summary, updated }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const POST = withApiLogging("POST", POSTHandler);
