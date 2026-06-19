import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import {
  deliverNotificationExternalChannels,
  type NotificationDeliveryRecipient,
} from "@/lib/notification-delivery";
import { notificationDedupeKey, notificationExpiresAt } from "@/lib/notification-policy";
import type { NotificationPreferenceRecord } from "@/lib/notification-preferences";
import { paymentMethodManagementSummary } from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import { uniqueEmails } from "@/lib/integrations";
import { twilioStatusCallbackUrl, uniqueSmsRecipients } from "@/lib/twilio-messaging";
import {
  isTuitionInvoiceLike,
  tuitionPaymentReminderCopy,
  tuitionPaymentReminderDecision,
  tuitionPaymentReminderDedupeKey,
  tuitionPaymentReminderDeliveryDedupeKey,
  tuitionPaymentReminderSettingsFromCustomFields,
  tuitionPaymentReminderWindow,
  TUITION_PAYMENT_REMINDER_NOTIFICATION_RETENTION_DAYS,
  type TuitionPaymentReminderPhase,
} from "@/lib/tuition-payment-reminders";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type ReminderEvent = {
  invoiceId: string;
  phase: TuitionPaymentReminderPhase;
  bucket: string;
  tenantId: string;
  centerId: string;
  familyId: string;
  title: string;
  body: string;
  priority: "normal" | "high";
  guardianUserIds: string[];
  deliveryRecipients: NotificationDeliveryRecipient[];
  deliveryDedupeKey: string;
  deliveryChannelDedupeKeys: string[];
  replyTo: string | null;
};

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
}

function centerLabel(center: { name: string; crmLocationId: string | null }) {
  return center.crmLocationId ?? center.name;
}

function activeGuardianUserIds(guardians: Array<{ userId: string | null; user: { isActive: boolean } | null }>) {
  return uniqueIds(
    guardians
      .filter((guardian) => guardian.userId && guardian.user?.isActive)
      .map((guardian) => guardian.userId),
  );
}

function familyDeliveryRecipients(family: {
  billingEmail: string | null;
  guardians: Array<{
    userId: string | null;
    email: string | null;
    phone: string | null;
    preferredCommunication: string | null;
    user: { isActive: boolean } | null;
  }>;
}): NotificationDeliveryRecipient[] {
  return [
    {
      role: UserRole.PARENT_GUARDIAN,
      email: family.billingEmail,
      smsOptIn: false,
    },
    ...family.guardians.map((guardian) => ({
      userId: guardian.user?.isActive ? guardian.userId : null,
      role: UserRole.PARENT_GUARDIAN,
      email: guardian.email,
      phone: guardian.phone,
      smsOptIn: guardian.preferredCommunication === "sms",
    })),
  ];
}

function eventDeliveryChannelDedupeKeys(eventDedupeKey: string, recipients: NotificationDeliveryRecipient[]) {
  const emails = uniqueEmails(
    recipients
      .filter((recipient) => recipient.emailOptIn !== false)
      .map((recipient) => recipient.email ?? ""),
  );
  const phones = uniqueSmsRecipients(
    recipients
      .filter((recipient) => recipient.smsOptIn !== false)
      .map((recipient) => recipient.phone ?? ""),
  );
  return [
    ...(emails.length ? [notificationDedupeKey([eventDedupeKey, "email"])] : []),
    ...phones.map((phone) => notificationDedupeKey([eventDedupeKey, "sms", phone])),
  ].filter((key): key is string => Boolean(key));
}

function preferenceBuckets(rows: Array<NotificationPreferenceRecord & { tenantId: string }>) {
  const buckets = new Map<string, NotificationPreferenceRecord[]>();
  for (const row of rows) {
    const values = buckets.get(row.tenantId) ?? [];
    values.push({
      id: row.id,
      userId: row.userId,
      role: row.role,
      type: row.type,
      emailEnabled: row.emailEnabled,
      smsEnabled: row.smsEnabled,
      pushEnabled: row.pushEnabled,
    });
    buckets.set(row.tenantId, values);
  }
  return buckets;
}

function hasActiveAutopay(account: {
  autopayPlaceholder: boolean;
  customFields: unknown;
}) {
  const summary = paymentMethodManagementSummary({
    autopayPlaceholder: account.autopayPlaceholder,
    customFields: account.customFields,
  });
  return summary.autopayStatus === "enabled" && summary.hasStripeCustomer && summary.hasSavedPaymentMethod;
}

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const asOfParam = request.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const now = Number.isNaN(asOf.getTime()) ? new Date() : asOf;
  const { createdStart, createdEnd, pastDueStart, pastDueEnd } = tuitionPaymentReminderWindow(now);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: PaymentStatus.OPEN,
      totalCents: { gt: 0 },
      billingAccount: { family: { is: { centerId: { not: null } } } },
      OR: [
        { createdAt: { gte: createdStart, lte: createdEnd } },
        { dueDate: { gte: pastDueStart, lt: pastDueEnd } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    take: 1000,
    select: {
      id: true,
      number: true,
      status: true,
      dueDate: true,
      totalCents: true,
      customFields: true,
      createdAt: true,
      items: { select: { description: true } },
      billingAccount: {
        select: {
          balanceCents: true,
          autopayPlaceholder: true,
          customFields: true,
          family: {
            select: {
              id: true,
              name: true,
              billingEmail: true,
              centerId: true,
              guardians: {
                select: {
                  userId: true,
                  email: true,
                  phone: true,
                  preferredCommunication: true,
                  user: { select: { isActive: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const centerIds = uniqueIds(invoices.map((invoice) => invoice.billingAccount.family.centerId));
  const centers = centerIds.length
    ? await prisma.center.findMany({
        where: { id: { in: centerIds }, status: { not: "closed" } },
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          email: true,
          customFields: true,
          organization: { select: { tenantId: true } },
        },
        take: 1000,
      })
    : [];
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const notificationRetentionDate = notificationExpiresAt(now, TUITION_PAYMENT_REMINDER_NOTIFICATION_RETENTION_DAYS);

  const events: ReminderEvent[] = [];
  let nonTuitionSkipped = 0;
  let settingsSkipped = 0;
  let autopayReadySkipped = 0;
  let noRecipientSkipped = 0;
  let closedCenterSkipped = 0;

  for (const invoice of invoices) {
    if (!isTuitionInvoiceLike({ customFields: invoice.customFields, items: invoice.items })) {
      nonTuitionSkipped += 1;
      continue;
    }

    const family = invoice.billingAccount.family;
    const center = family.centerId ? centersById.get(family.centerId) : null;
    if (!center) {
      closedCenterSkipped += 1;
      continue;
    }

    const activeAutopay = hasActiveAutopay(invoice.billingAccount);
    const settings = tuitionPaymentReminderSettingsFromCustomFields(center.customFields);
    const decision = tuitionPaymentReminderDecision({
      dueDate: invoice.dueDate,
      invoiceCreatedAt: invoice.createdAt,
      hasActiveAutopay: activeAutopay,
      now,
      settings,
    });
    if (!decision) {
      if (activeAutopay) autopayReadySkipped += 1;
      settingsSkipped += 1;
      continue;
    }

    const guardianUserIds = activeGuardianUserIds(family.guardians);
    const deliveryRecipients = familyDeliveryRecipients(family);
    const hasExternalRecipient = deliveryRecipients.some((recipient) => recipient.email || recipient.phone);
    if (!guardianUserIds.length && !hasExternalRecipient) {
      noRecipientSkipped += 1;
      continue;
    }

    const copy = tuitionPaymentReminderCopy({
      phase: decision.phase,
      familyName: family.name,
      centerName: centerLabel(center),
      invoiceNumber: invoice.number,
      dueDate: invoice.dueDate,
      amountCents: invoice.totalCents,
      balanceCents: invoice.billingAccount.balanceCents,
    });
    const deliveryDedupeKey = tuitionPaymentReminderDeliveryDedupeKey({
      invoiceId: invoice.id,
      phase: decision.phase,
      bucket: decision.bucket,
    });
    if (!deliveryDedupeKey) {
      settingsSkipped += 1;
      continue;
    }

    events.push({
      invoiceId: invoice.id,
      phase: decision.phase,
      bucket: decision.bucket,
      tenantId: center.organization.tenantId,
      centerId: center.id,
      familyId: family.id,
      title: copy.title,
      body: copy.body,
      priority: copy.priority,
      guardianUserIds,
      deliveryRecipients,
      deliveryDedupeKey,
      deliveryChannelDedupeKeys: eventDeliveryChannelDedupeKeys(deliveryDedupeKey, deliveryRecipients),
      replyTo: center.email,
    });
  }

  const notificationData: Prisma.NotificationCreateManyInput[] = [];
  const localDedupeKeys = new Set<string>();
  for (const event of events) {
    for (const userId of event.guardianUserIds) {
      const dedupeKey = tuitionPaymentReminderDedupeKey({
        invoiceId: event.invoiceId,
        phase: event.phase,
        bucket: event.bucket,
        userId,
      });
      if (!dedupeKey || localDedupeKeys.has(dedupeKey)) continue;
      localDedupeKeys.add(dedupeKey);
      notificationData.push({
        userId,
        title: event.title,
        body: event.body,
        type: "billing",
        priority: event.priority,
        dedupeKey,
        expiresAt: notificationRetentionDate,
      });
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
  const existingNotificationKeys = new Set(
    existingNotifications
      .map((notification) => notification.dedupeKey)
      .filter((dedupeKey): dedupeKey is string => typeof dedupeKey === "string" && dedupeKey.length > 0),
  );
  const pendingNotificationData = notificationData.filter(
    (notification) => typeof notification.dedupeKey === "string" && !existingNotificationKeys.has(notification.dedupeKey),
  );

  const allDeliveryChannelDedupeKeys = Array.from(new Set(events.flatMap((event) => event.deliveryChannelDedupeKeys)));
  const existingDeliveries = allDeliveryChannelDedupeKeys.length
    ? await prisma.integrationDelivery.findMany({
        where: {
          dedupeKey: { in: allDeliveryChannelDedupeKeys },
          purpose: { in: ["notification_email", "notification_sms"] },
        },
        select: { dedupeKey: true },
        take: 5000,
      })
    : [];
  const existingDeliveryKeys = new Set(
    existingDeliveries
      .map((delivery) => delivery.dedupeKey)
      .filter((dedupeKey): dedupeKey is string => typeof dedupeKey === "string" && dedupeKey.length > 0),
  );
  const eventsToDeliver = events.filter((event) => (
    event.deliveryChannelDedupeKeys.length > 0 &&
    event.deliveryChannelDedupeKeys.every((key) => !existingDeliveryKeys.has(key))
  ));

  let notificationsCreated = 0;
  if (!dryRun && pendingNotificationData.length) {
    const created = await prisma.notification.createMany({ data: pendingNotificationData, skipDuplicates: true });
    notificationsCreated = created.count;
  }

  const tenantIds = uniqueIds(eventsToDeliver.map((event) => event.tenantId));
  const parentUserIds = uniqueIds(eventsToDeliver.flatMap((event) => event.deliveryRecipients.map((recipient) => recipient.userId)));
  const preferences = tenantIds.length
    ? await prisma.notificationPreference.findMany({
        where: {
          tenantId: { in: tenantIds },
          type: "billing",
          OR: [
            ...(parentUserIds.length ? [{ userId: { in: parentUserIds } }] : []),
            { role: UserRole.PARENT_GUARDIAN },
          ],
        },
        select: {
          tenantId: true,
          userId: true,
          role: true,
          type: true,
          emailEnabled: true,
          smsEnabled: true,
          pushEnabled: true,
        },
      })
    : [];
  const preferencesByTenant = preferenceBuckets(preferences);
  const statusCallbackUrl = twilioStatusCallbackUrl(request);
  let externalDeliveriesAttempted = 0;
  let externalEmailAttempted = 0;
  let externalEmailSent = 0;
  let externalSmsAttempted = 0;
  let externalSmsSent = 0;

  if (!dryRun) {
    for (const event of eventsToDeliver) {
      const delivery = await deliverNotificationExternalChannels({
        tenantId: event.tenantId,
        centerId: event.centerId,
        dedupeKey: event.deliveryDedupeKey,
        type: "billing",
        title: event.title,
        body: event.body,
        recipients: event.deliveryRecipients,
        preferences: preferencesByTenant.get(event.tenantId) ?? [],
        emailRequested: true,
        smsRequested: true,
        replyTo: event.replyTo,
        fromName: "The BEE Suite",
        statusCallbackUrl,
        metadata: {
          familyId: event.familyId,
          invoiceId: event.invoiceId,
          reminderPhase: event.phase,
          reminderBucket: event.bucket,
        },
      });
      externalDeliveriesAttempted += 1;
      externalEmailAttempted += delivery.email.attempted;
      externalEmailSent += delivery.email.sent;
      externalSmsAttempted += delivery.sms.attempted;
      externalSmsSent += delivery.sms.sent;
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    asOf: now.toISOString(),
    createdWindowStart: createdStart.toISOString(),
    createdWindowEnd: createdEnd.toISOString(),
    pastDueWindowStart: pastDueStart.toISOString(),
    pastDueWindowEnd: pastDueEnd.toISOString(),
    invoicesChecked: invoices.length,
    eligibleReminders: events.length,
    nonTuitionSkipped,
    settingsSkipped,
    autopayReadySkipped,
    closedCenterSkipped,
    noRecipientSkipped,
    notificationsCreated,
    notificationsWouldCreate: dryRun ? pendingNotificationData.length : 0,
    notificationsSkipped: existingNotifications.length,
    externalDeliveriesAttempted,
    externalDeliveriesWouldAttempt: dryRun ? eventsToDeliver.length : 0,
    externalEmailAttempted,
    externalEmailSent,
    externalSmsAttempted,
    externalSmsSent,
    externalDeliveriesSkipped: existingDeliveries.length,
  });
}

export const GET = withApiLogging("GET", GETHandler);
