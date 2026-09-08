import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { defaultNotificationPreferenceChannels } from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";
import {
  parseTwilioWebhookParams,
  isTwilioWebhookReceiptUniqueConflict,
  phoneMatchKey,
  twilioSmsConsentAction,
  type TwilioSmsConsentAction,
  twilioWebhookUrl,
  twimlResponse,
  validateTwilioSignatureAgainstConfiguredTokens,
} from "@/lib/twilio-messaging";
import { resolveTwilioInboundGuardian } from "@/lib/twilio-inbound-scope";

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
  tx,
  tenantId,
  guardian,
  action,
}: {
  tx: Prisma.TransactionClient;
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
          return tx.notificationPreference.upsert({
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

  await tx.guardian.update({
    where: { id: guardian.id },
    data: {
      preferredCommunication: smsEnabled ? "sms" : guardian.email ? "email" : guardian.phone ? "phone" : null,
      customFields: smsConsentCustomFields(guardian.customFields, action),
    },
  });
}

async function POSTHandler(request: NextRequest) {
  const params = await parseTwilioWebhookParams(request);
  if (!params) {
    return NextResponse.json({ ok: false, error: "Invalid Twilio webhook payload." }, { status: 400 });
  }
  const signatureMatch = await validateTwilioSignatureAgainstConfiguredTokens({
    signature: request.headers.get("x-twilio-signature"),
    url: twilioWebhookUrl(request),
    params,
  });
  if (!signatureMatch.matched) {
    return NextResponse.json({ ok: false, error: "Invalid Twilio signature." }, { status: 403 });
  }

  const messageSid = clean(params.MessageSid);
  if (!messageSid) return twimlResponse();
  const existing = await prisma.integrationDelivery.findUnique({
    where: { provider_providerMessageId: { provider: "twilio", providerMessageId: messageSid } },
    select: { id: true },
  });
  if (existing) return twimlResponse();

  const from = clean(params.From);
  const to = clean(params.To);
  const body = clean(params.Body) || (Number(params.NumMedia || 0) > 0 ? "[SMS media message]" : "");
  const fromKey = phoneMatchKey(from);
  if (!fromKey || !body) return twimlResponse();

  const signatureTenantCenterIds = signatureMatch.tenantId
    ? (await prisma.center.findMany({
        where: { organization: { tenantId: signatureMatch.tenantId } },
        select: { id: true },
      })).map((center) => center.id)
    : [];

  const candidates = await prisma.guardian.findMany({
    where: {
      phone: { contains: fromKey.slice(-4) },
      ...(signatureMatch.tenantId
        ? {
            OR: [
              { family: { centerId: { in: signatureTenantCenterIds.length ? signatureTenantCenterIds : ["__no_authorized_center__"] } } },
              { user: { tenantId: signatureMatch.tenantId } },
            ],
          }
        : {}),
    },
    take: 50,
    include: {
      user: { select: { id: true, tenantId: true } },
      family: {
        select: {
          id: true,
          name: true,
          centerId: true,
        },
      },
    },
  });
  const candidateCenterIds = Array.from(new Set(candidates.map((candidate) => candidate.family.centerId).filter((value): value is string => Boolean(value))));
  const candidateCenters = candidateCenterIds.length
    ? await prisma.center.findMany({
        where: { id: { in: candidateCenterIds } },
        select: { id: true, organization: { select: { tenantId: true } } },
      })
    : [];
  const tenantByCenterId = new Map(candidateCenters.map((center) => [center.id, center.organization.tenantId]));
  const resolvedGuardian = resolveTwilioInboundGuardian({
    candidates: candidates.map((candidate) => ({
      ...candidate,
      family: {
        ...candidate.family,
        tenantId: candidate.family.centerId ? tenantByCenterId.get(candidate.family.centerId) ?? null : null,
      },
    })),
    fromPhoneKey: fromKey,
    signatureTenantId: signatureMatch.tenantId,
  });
  if (!resolvedGuardian) return twimlResponse();
  const guardian = resolvedGuardian.candidate;
  const tenantId = resolvedGuardian.tenantId;

  const consentAction = twilioSmsConsentAction(body);
  let createdMessageId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const delivery = await tx.integrationDelivery.create({
        data: {
          tenantId,
          centerId: guardian.family.centerId,
          provider: "twilio",
          providerMessageId: messageSid,
          purpose: consentAction === "opt_in" ? "sms_opt_in" : consentAction === "opt_out" ? "sms_opt_out" : "sms_inbound",
          direction: "inbound",
          sender: from,
          recipient: to,
          status: "processing",
          attempts: 0,
          payload: params,
          lastResult: { ok: true, messageSid, consentAction },
        },
      });

      if (consentAction) {
        await applyGuardianSmsConsent({
          tx,
          tenantId,
          guardian,
          action: consentAction,
        });
      } else {
        const created = await tx.message.create({
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
        createdMessageId = created.id;

        if (guardian.family.centerId) {
          const directors = await getCenterLeadershipUsers({
            centerId: guardian.family.centerId,
            roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
            client: tx,
          });
          await Promise.all(
            directors.map((director) =>
              tx.notification.create({
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
      }

      await tx.integrationDelivery.update({
        where: { id: delivery.id },
        data: {
          messageId: createdMessageId,
          status: "delivered",
          deliveredAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (isTwilioWebhookReceiptUniqueConflict(error)) return twimlResponse();
    throw error;
  }

  if (consentAction) {

    await writeSystemAuditLog({
      tenantId,
      centerId: guardian.family.centerId,
      action: consentAction === "opt_in" ? "twilio.sms.opt_in" : "twilio.sms.opt_out",
      resource: "Guardian",
      resourceId: guardian.id,
      metadata: {
        providerMessageId: messageSid,
        familyId: guardian.family.id,
        guardianId: guardian.id,
        userId: guardian.userId,
        fromLast4: from.slice(-4),
        toLast4: to.slice(-4),
      },
    });

    return twimlResponse();
  }

  await writeSystemAuditLog({
    tenantId,
    centerId: guardian.family.centerId,
    action: "twilio.sms.inbound",
    resource: "Message",
    resourceId: createdMessageId!,
    metadata: {
      providerMessageId: messageSid,
      familyId: guardian.family.id,
      guardianId: guardian.id,
      fromLast4: from.slice(-4),
      toLast4: to.slice(-4),
    },
  });

  return twimlResponse();
}

export const POST = withApiLogging("POST", POSTHandler);
