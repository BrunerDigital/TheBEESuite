import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { defaultNotificationPreferenceChannels } from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";
import {
  formDataToRecord,
  phoneMatchKey,
  twilioSmsConsentAction,
  type TwilioSmsConsentAction,
  twilioWebhookUrl,
  twimlResponse,
  validateTwilioSignatureAgainstConfiguredTokens,
} from "@/lib/twilio-messaging";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const parentSmsNotificationTypes = ["messages", "billing", "documents", "incidents", "classroom", "enrollment"] as const;
const parentSmsOptInNotificationTypes = ["messages"] as const;

type GuardianSmsConsentTarget = {
  id: string;
  userId: string | null;
  email: string | null;
  phone: string | null;
  customFields: unknown;
};

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function smsConsentCustomFields(value: unknown, action: TwilioSmsConsentAction) {
  const customFields = objectRecord(value);
  const preferences = objectRecord(customFields.notificationPreferences);
  return {
    ...customFields,
    notificationPreferences: {
      ...preferences,
      sms: action === "opt_in",
    },
    notificationPreferencesUpdatedAt: new Date().toISOString(),
  };
}

async function applyGuardianSmsConsent({
  tenantId,
  guardian,
  action,
}: {
  tenantId: string;
  guardian: GuardianSmsConsentTarget;
  action: TwilioSmsConsentAction;
}) {
  const smsEnabled = action === "opt_in";
  const types = smsEnabled ? parentSmsOptInNotificationTypes : parentSmsNotificationTypes;
  await Promise.all(
    guardian.userId
      ? types.map((type) => {
          const defaults = defaultNotificationPreferenceChannels(type);
          return prisma.notificationPreference.upsert({
            where: { tenantId_userId_type: { tenantId, userId: guardian.userId!, type } },
            update: { smsEnabled },
            create: {
              tenantId,
              userId: guardian.userId,
              type,
              emailEnabled: defaults.emailEnabled,
              smsEnabled,
              pushEnabled: defaults.pushEnabled,
            },
          });
        })
      : [],
  );

  await prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      preferredCommunication: smsEnabled ? "sms" : guardian.email ? "email" : guardian.phone ? "phone" : null,
      customFields: smsConsentCustomFields(guardian.customFields, action),
    },
  });
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
  if (messageSid) {
    const existing = await prisma.integrationDelivery.findUnique({
      where: { provider_providerMessageId: { provider: "twilio", providerMessageId: messageSid } },
      select: { id: true },
    });
    if (existing) return twimlResponse();
  }

  const from = clean(params.From);
  const to = clean(params.To);
  const body = clean(params.Body) || (Number(params.NumMedia || 0) > 0 ? "[SMS media message]" : "");
  const fromKey = phoneMatchKey(from);
  if (!fromKey || !body) return twimlResponse();

  const candidates = await prisma.guardian.findMany({
    where: {
      phone: { contains: fromKey.slice(-4) },
    },
    take: 50,
    include: {
      user: { select: { id: true, tenantId: true } },
      family: { select: { id: true, name: true, centerId: true } },
    },
  });
  const guardian = candidates.find((candidate) => phoneMatchKey(candidate.phone) === fromKey);
  if (!guardian) return twimlResponse();

  const center = guardian.family.centerId
    ? await prisma.center.findUnique({
        where: { id: guardian.family.centerId },
        select: {
          id: true,
          organization: { select: { tenantId: true } },
        },
      })
    : null;
  const tenantId = center?.organization.tenantId ?? guardian.user?.tenantId;
  if (!tenantId) return twimlResponse();

  const consentAction = twilioSmsConsentAction(body);
  if (consentAction) {
    await applyGuardianSmsConsent({
      tenantId,
      guardian,
      action: consentAction,
    });

    await prisma.integrationDelivery.create({
      data: {
        tenantId,
        centerId: guardian.family.centerId,
        provider: "twilio",
        providerMessageId: messageSid || null,
        purpose: consentAction === "opt_in" ? "sms_opt_in" : "sms_opt_out",
        direction: "inbound",
        sender: from,
        recipient: to,
        status: "delivered",
        attempts: 0,
        payload: params,
        lastResult: { ok: true, messageSid: messageSid || null, consentAction },
        deliveredAt: new Date(),
      },
    });

    await writeSystemAuditLog({
      tenantId,
      centerId: guardian.family.centerId,
      action: consentAction === "opt_in" ? "twilio.sms.opt_in" : "twilio.sms.opt_out",
      resource: "Guardian",
      resourceId: guardian.id,
      metadata: {
        providerMessageId: messageSid || null,
        familyId: guardian.family.id,
        guardianId: guardian.id,
        userId: guardian.userId,
        fromLast4: from.slice(-4),
        toLast4: to.slice(-4),
      },
    });

    return twimlResponse();
  }

  const created = await prisma.message.create({
    data: {
      familyId: guardian.family.id,
      senderId: guardian.userId,
      subject: "SMS reply",
      body,
      channel: "sms_inbound",
      priority: "normal",
      sentiment: "neutral",
    },
  });

  await prisma.integrationDelivery.create({
    data: {
      tenantId,
      centerId: guardian.family.centerId,
      messageId: created.id,
      provider: "twilio",
      providerMessageId: messageSid || null,
      purpose: "sms_inbound",
      direction: "inbound",
      sender: from,
      recipient: to,
      status: "delivered",
      attempts: 0,
      payload: params,
      lastResult: { ok: true, messageSid: messageSid || null },
      deliveredAt: new Date(),
    },
  });

  if (guardian.family.centerId) {
    const directors = await getCenterLeadershipUsers({
      centerId: guardian.family.centerId,
      roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
    });
    await Promise.all(
      directors.map((director) =>
        prisma.notification.create({
          data: {
            userId: director.id,
            title: "Incoming parent SMS",
            body: `${guardian.family.name}: ${body}`,
            type: "message",
            priority: "normal",
          },
        }),
      ),
    );
  }

  await writeSystemAuditLog({
    tenantId,
    centerId: guardian.family.centerId,
    action: "twilio.sms.inbound",
    resource: "Message",
    resourceId: created.id,
    metadata: {
      providerMessageId: messageSid || null,
      familyId: guardian.family.id,
      guardianId: guardian.id,
      fromLast4: from.slice(-4),
      toLast4: to.slice(-4),
    },
  });

  return twimlResponse();
}

export const POST = withApiLogging("POST", POSTHandler);
