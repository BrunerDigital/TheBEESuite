import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formDataToRecord,
  twilioDeliveryStatus,
  twilioWebhookUrl,
  validateTwilioSignatureAgainstConfiguredTokens,
} from "@/lib/twilio-messaging";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const form = await request.formData();
  const params = formDataToRecord(form);
  const signatureMatch = await validateTwilioSignatureAgainstConfiguredTokens({
    signature: request.headers.get("x-twilio-signature"),
    url: twilioWebhookUrl(request),
    params,
  });
  if (!signatureMatch.matched) {
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

export const POST = withApiLogging("POST", POSTHandler);
