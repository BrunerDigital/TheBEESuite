import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formDataToRecord,
  twilioDeliveryStatus,
  twilioWebhookUrl,
  validateTwilioSignature,
} from "@/lib/twilio-messaging";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params = formDataToRecord(form);
  const isValid = validateTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN,
    signature: request.headers.get("x-twilio-signature"),
    url: twilioWebhookUrl(request),
    params,
  });
  if (!isValid) {
    return NextResponse.json({ ok: false, error: "Invalid Twilio signature." }, { status: 403 });
  }

  const messageSid = clean(params.MessageSid);
  if (!messageSid) return new Response(null, { status: 204 });

  const providerStatus = clean(params.MessageStatus);
  const status = twilioDeliveryStatus(providerStatus);
  const error = clean(params.ErrorMessage) || clean(params.ErrorCode) || null;
  const now = new Date();

  await prisma.integrationDelivery.updateMany({
    where: {
      provider: "twilio",
      providerMessageId: messageSid,
    },
    data: {
      status,
      lastResult: {
        ok: status !== "failed",
        messageSid,
        messageStatus: providerStatus || null,
        errorCode: clean(params.ErrorCode) || null,
        errorMessage: clean(params.ErrorMessage) || null,
      },
      lastError: error,
      nextAttemptAt: status === "pending" ? undefined : null,
      deliveredAt: status === "delivered" ? now : undefined,
    },
  });

  return new Response(null, { status: 204 });
}
