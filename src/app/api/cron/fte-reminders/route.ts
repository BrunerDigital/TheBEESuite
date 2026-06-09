import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import {
  fteEscalationCopy,
  resolveFteEscalationChannels,
  shouldSendExternalFteEscalation,
  type FteEscalationPreference,
  type FteEscalationRecipient,
} from "@/lib/fte-escalations";
import { fteExternalEscalationWindow, getFteDueState } from "@/lib/fte-report-guardrails";
import { recordCommunicationSmsDeliveryAttempt, recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, sendSms, uniqueEmails } from "@/lib/integrations";
import { notificationDedupeKey, notificationExpiresAt } from "@/lib/notification-policy";
import { prisma } from "@/lib/prisma";
import { twilioStatusCallbackUrl, uniqueSmsRecipients } from "@/lib/twilio-messaging";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const directorRoles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR];

type FteExternalEscalationTarget = {
  centerId: string;
  tenantId: string;
  centerLabel: string;
  userId: string;
};

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function centerName(center: { name: string; crmLocationId: string | null; city: string | null; state: string | null }) {
  return [
    center.crmLocationId ?? center.name,
    [center.city, center.state].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
}

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const now = new Date();
  const dueState = getFteDueState(now);
  const escalationWindow = fteExternalEscalationWindow(now);
  const missingCenters = await prisma.center.findMany({
    where: {
      status: { not: "closed" },
      fteReports: { none: { weekStart: dueState.weekStart } },
    },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      city: true,
      state: true,
      organization: { select: { tenantId: true } },
    },
    take: 500,
  });

  const weekLabel = dueState.weekStart.toISOString().slice(0, 10);
  const centerIds = missingCenters.map((center) => center.id);
  const tenantIds = Array.from(new Set(missingCenters.map((center) => center.organization.tenantId)));
  const [platformOwners, executives, staffDirectors, grantDirectors] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: UserRole.PLATFORM_OWNER },
      select: { id: true, tenantId: true, email: true, role: true, staffProfile: { select: { phone: true } } },
      take: 100,
    }),
    prisma.user.findMany({
      where: { isActive: true, tenantId: { in: tenantIds }, role: { in: [UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER] } },
      select: { id: true, tenantId: true, email: true, role: true, staffProfile: { select: { phone: true } } },
      take: 500,
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: directorRoles }, staffProfile: { is: { centerId: { in: centerIds } } } },
      select: { id: true, tenantId: true, email: true, role: true, staffProfile: { select: { centerId: true, phone: true } } },
      take: 1000,
    }),
    prisma.user.findMany({
      where: { isActive: true, accessGrants: { some: { isActive: true, centerId: { in: centerIds }, role: { in: directorRoles } } } },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        staffProfile: { select: { phone: true } },
        accessGrants: {
          where: { isActive: true, centerId: { in: centerIds }, role: { in: directorRoles } },
          select: { centerId: true },
        },
      },
      take: 1000,
    }),
  ]);

  const allRecipientsById = new Map<string, FteEscalationRecipient>();
  for (const user of [...platformOwners, ...executives, ...staffDirectors, ...grantDirectors]) {
    allRecipientsById.set(user.id, {
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.staffProfile?.phone ?? null,
    });
  }
  const notificationPreferences: FteEscalationPreference[] = await prisma.notificationPreference.findMany({
    where: {
      tenantId: { in: tenantIds },
      type: "fte_reports",
      OR: [
        { userId: { in: Array.from(allRecipientsById.keys()) } },
        { role: { in: [UserRole.PLATFORM_OWNER, UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER, ...directorRoles] } },
      ],
    },
    select: { userId: true, role: true, emailEnabled: true, smsEnabled: true },
    take: 5000,
  });
  const executivesByTenant = new Map<string, string[]>();
  for (const user of executives) {
    const users = executivesByTenant.get(user.tenantId) ?? [];
    users.push(user.id);
    executivesByTenant.set(user.tenantId, users);
  }
  const directorsByCenter = new Map<string, string[]>();
  for (const user of staffDirectors) {
    const centerId = user.staffProfile?.centerId;
    if (!centerId) continue;
    const users = directorsByCenter.get(centerId) ?? [];
    users.push(user.id);
    directorsByCenter.set(centerId, users);
  }
  for (const user of grantDirectors) {
    for (const grant of user.accessGrants) {
      if (!grant.centerId) continue;
      const users = directorsByCenter.get(grant.centerId) ?? [];
      users.push(user.id);
      directorsByCenter.set(grant.centerId, users);
    }
  }

  const notificationData: Prisma.NotificationCreateManyInput[] = [];
  const externalEscalationTargets: FteExternalEscalationTarget[] = [];
  const localDedupeKeys = new Set<string>();
  const localExternalTargetKeys = new Set<string>();
  const expiresAt = notificationExpiresAt(now);

  for (const center of missingCenters) {
    const label = centerName(center);
    const title = `FTE ${dueState.phase === "overdue" ? "overdue" : "due"}: ${label} (${weekLabel})`;
    const body = `${dueState.reminder} Missing report for week of ${weekLabel}.`;
    const recipientIds = Array.from(new Set([
      ...platformOwners.map((user) => user.id),
      ...(executivesByTenant.get(center.organization.tenantId) ?? []),
      ...(directorsByCenter.get(center.id) ?? []),
    ]));

    for (const userId of recipientIds) {
      const dedupeKey = notificationDedupeKey(["fte_due", weekLabel, dueState.phase, center.id, userId]);
      if (!dedupeKey || localDedupeKeys.has(dedupeKey)) continue;
      localDedupeKeys.add(dedupeKey);
      notificationData.push({
        userId,
        title,
        body,
        type: "fte_due",
        priority: dueState.priority,
        dedupeKey,
        expiresAt,
      });
      const externalTargetKey = notificationDedupeKey([
        "fte_external_target",
        weekLabel,
        escalationWindow?.key,
        center.id,
        userId,
      ]);
      if (escalationWindow && externalTargetKey && !localExternalTargetKeys.has(externalTargetKey)) {
        localExternalTargetKeys.add(externalTargetKey);
        externalEscalationTargets.push({
          centerId: center.id,
          tenantId: center.organization.tenantId,
          centerLabel: label,
          userId,
        });
      }
    }
  }

  const notificationDedupeKeys = notificationData
    .map((notification) => notification.dedupeKey)
    .filter((dedupeKey): dedupeKey is string => typeof dedupeKey === "string" && dedupeKey.length > 0);
  const existingNotifications = notificationDedupeKeys.length
    ? await prisma.notification.findMany({
        where: { dedupeKey: { in: notificationDedupeKeys } },
        select: { dedupeKey: true },
        take: 5000,
      })
    : [];
  const existingDedupeKeys = new Set(
    existingNotifications
      .map((notification) => notification.dedupeKey)
      .filter((dedupeKey): dedupeKey is string => typeof dedupeKey === "string" && dedupeKey.length > 0),
  );
  const pendingNotificationData = notificationData.filter(
    (notification) => typeof notification.dedupeKey === "string" && !existingDedupeKeys.has(notification.dedupeKey),
  );
  let notificationsCreated = 0;
  let emailsAttempted = 0;
  let emailsSent = 0;
  let emailsSkipped = 0;
  let smsAttempted = 0;
  let smsSent = 0;
  let smsSkipped = 0;
  const shouldSendExternal = shouldSendExternalFteEscalation(escalationWindow?.key);
  const externalDeliveryKeys = new Set<string>();

  if (shouldSendExternal && escalationWindow) {
    for (const target of externalEscalationTargets) {
      const recipient = allRecipientsById.get(target.userId);
      if (!recipient) continue;
      const channels = resolveFteEscalationChannels(recipient, notificationPreferences);

      if (channels.email && uniqueEmails([recipient.email]).length) {
        const emailKey = notificationDedupeKey([
          "fte_external_email",
          weekLabel,
          escalationWindow.key,
          target.centerId,
          recipient.id,
        ]);
        if (emailKey) externalDeliveryKeys.add(emailKey);
      }

      if (channels.sms) {
        for (const to of uniqueSmsRecipients([recipient.phone])) {
          const smsKey = notificationDedupeKey([
            "fte_external_sms",
            weekLabel,
            escalationWindow.key,
            target.centerId,
            recipient.id,
            to,
          ]);
          if (smsKey) externalDeliveryKeys.add(smsKey);
        }
      }
    }
  }

  const existingExternalDeliveries = externalDeliveryKeys.size
    ? await prisma.integrationDelivery.findMany({
        where: { dedupeKey: { in: Array.from(externalDeliveryKeys) } },
        select: { dedupeKey: true },
      })
    : [];
  const existingExternalDeliveryKeys = new Set(
    existingExternalDeliveries
      .map((delivery) => delivery.dedupeKey)
      .filter((dedupeKey): dedupeKey is string => typeof dedupeKey === "string" && dedupeKey.length > 0),
  );

  if (!dryRun && pendingNotificationData.length) {
    const created = await prisma.notification.createMany({ data: pendingNotificationData, skipDuplicates: true });
    notificationsCreated = created.count;
  }

  if (!dryRun && shouldSendExternal && escalationWindow && externalEscalationTargets.length) {
    const statusCallbackUrl = twilioStatusCallbackUrl(request);
    for (const target of externalEscalationTargets) {
      const recipient = allRecipientsById.get(target.userId);
      if (!recipient) continue;

      const channels = resolveFteEscalationChannels(recipient, notificationPreferences);
      const copy = fteEscalationCopy({
        centerName: target.centerLabel,
        weekLabel,
        phase: dueState.phase,
        reminder: dueState.reminder,
        escalationLabel: escalationWindow.label,
      });

      if (channels.email) {
        const to = uniqueEmails([recipient.email]);
        if (to.length) {
          const emailDedupeKey = notificationDedupeKey([
            "fte_external_email",
            weekLabel,
            escalationWindow.key,
            target.centerId,
            recipient.id,
          ]);
          if (emailDedupeKey && existingExternalDeliveryKeys.has(emailDedupeKey)) {
            emailsSkipped += 1;
          } else {
            emailsAttempted += 1;
            const email = await sendEmail({
              to,
              subject: copy.subject,
              text: copy.body,
              fromName: "The BEE Suite",
              categories: ["fte_reminder_email"],
              customArgs: {
                purpose: "fte_reminder_email",
                centerId: target.centerId,
                weekStart: weekLabel,
                phase: dueState.phase,
                escalationWindow: escalationWindow.key,
                userId: recipient.id,
                dedupeKey: emailDedupeKey ?? undefined,
              },
              tenantId: target.tenantId,
            });
            if (email.ok) emailsSent += 1;
            await recordEmailDeliveryAttempt({
              tenantId: target.tenantId,
              centerId: target.centerId,
              dedupeKey: emailDedupeKey,
              purpose: "fte_reminder_email",
              to,
              subject: copy.subject,
              text: copy.body,
              result: email,
              metadata: {
                weekStart: weekLabel,
                phase: dueState.phase,
                escalationWindow: escalationWindow.key,
                escalationLabel: escalationWindow.label,
                userId: recipient.id,
              },
            });
            if (emailDedupeKey) existingExternalDeliveryKeys.add(emailDedupeKey);
          }
        }
      }

      if (channels.sms) {
        const smsRecipients = uniqueSmsRecipients([recipient.phone]);
        for (const to of smsRecipients) {
          const smsDedupeKey = notificationDedupeKey([
            "fte_external_sms",
            weekLabel,
            escalationWindow.key,
            target.centerId,
            recipient.id,
            to,
          ]);
          if (smsDedupeKey && existingExternalDeliveryKeys.has(smsDedupeKey)) {
            smsSkipped += 1;
            continue;
          }

          smsAttempted += 1;
          const sms = await sendSms({ to, body: copy.sms, statusCallbackUrl, tenantId: target.tenantId });
          if (sms.ok) smsSent += 1;
          await recordCommunicationSmsDeliveryAttempt({
            tenantId: target.tenantId,
            centerId: target.centerId,
            dedupeKey: smsDedupeKey,
            to,
            body: copy.sms,
            statusCallbackUrl,
            result: sms,
            purpose: "fte_reminder_sms",
          });
          if (smsDedupeKey) existingExternalDeliveryKeys.add(smsDedupeKey);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    weekStart: dueState.weekStart,
    dueAt: dueState.dueAt,
    phase: dueState.phase,
    missingCenters: missingCenters.length,
    notificationsCreated,
    notificationsWouldCreate: dryRun ? pendingNotificationData.length : 0,
    notificationsSkipped: existingNotifications.length,
    externalEscalationEnabled: shouldSendExternal,
    externalEscalationWindow: escalationWindow?.key ?? null,
    externalEscalationLabel: escalationWindow?.label ?? null,
    externalEscalationsWouldSend: dryRun
      ? Math.max(0, externalDeliveryKeys.size - existingExternalDeliveries.length)
      : 0,
    externalEscalationsSkipped: dryRun ? existingExternalDeliveries.length : emailsSkipped + smsSkipped,
    emailsAttempted,
    emailsSent,
    emailsSkipped,
    smsAttempted,
    smsSent,
    smsSkipped,
  });
}

export const GET = withApiLogging("GET", GETHandler);
