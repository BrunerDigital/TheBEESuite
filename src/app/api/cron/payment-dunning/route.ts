import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import {
  PAYMENT_DUNNING_MAX_ATTEMPTS,
  PAYMENT_DUNNING_NOTIFICATION_RETENTION_DAYS,
  nextPaymentDunningAt,
  paymentDunningCopy,
  paymentDunningDedupeKey,
  paymentDunningFailureMessage,
  paymentDunningSummary,
} from "@/lib/payment-dunning";
import { notificationExpiresAt } from "@/lib/notification-policy";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const tenantDunningRoles = [UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER, UserRole.BILLING_ADMIN];
const centerDunningRoles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN];

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function objectFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function stringFromJson(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateFromJson(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
}

function pushMapValue(map: Map<string, string[]>, key: string | null | undefined, value: string) {
  if (!key) return;
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function centerLabel(center: { name: string; crmLocationId: string | null }) {
  return center.crmLocationId ?? center.name;
}

function activeGuardianUserIds(guardians: Array<{ userId: string | null; user: { isActive: boolean } | null }>) {
  return guardians
    .filter((guardian) => guardian.userId && guardian.user?.isActive)
    .map((guardian) => guardian.userId)
    .filter((userId): userId is string => typeof userId === "string");
}

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const asOfParam = request.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const now = Number.isNaN(asOf.getTime()) ? new Date() : asOf;

  const failedPayments = await prisma.payment.findMany({
    where: { status: PaymentStatus.FAILED },
    orderBy: { id: "asc" },
    take: 500,
    select: {
      id: true,
      amountCents: true,
      status: true,
      provider: true,
      customFields: true,
      billingAccount: {
        select: {
          id: true,
          family: {
            select: {
              id: true,
              name: true,
              centerId: true,
              guardians: {
                where: { userId: { not: null } },
                select: { userId: true, user: { select: { isActive: true } } },
              },
            },
          },
        },
      },
    },
  });

  const invoiceIds = uniqueIds(
    failedPayments.map((payment) => stringFromJson(objectFromJson(payment.customFields).invoiceId)),
  );
  const centerIds = uniqueIds(failedPayments.map((payment) => payment.billingAccount.family.centerId));

  const [invoices, centers] = await Promise.all([
    invoiceIds.length
      ? prisma.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, number: true, status: true },
          take: 500,
        })
      : [],
    centerIds.length
      ? prisma.center.findMany({
          where: { id: { in: centerIds }, status: { not: "closed" } },
          select: {
            id: true,
            name: true,
            crmLocationId: true,
            organization: { select: { tenantId: true } },
          },
          take: 500,
        })
      : [],
  ]);
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const tenantIds = uniqueIds(centers.map((center) => center.organization.tenantId));

  const [platformOwners, tenantUsers, staffScopedUsers, grantScopedUsers] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: UserRole.PLATFORM_OWNER },
      select: { id: true },
      take: 100,
    }),
    prisma.user.findMany({
      where: { isActive: true, tenantId: { in: tenantIds }, role: { in: tenantDunningRoles } },
      select: { id: true, tenantId: true },
      take: 500,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: centerDunningRoles },
        staffProfile: { is: { centerId: { in: centerIds } } },
      },
      select: { id: true, staffProfile: { select: { centerId: true } } },
      take: 1000,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        accessGrants: { some: { isActive: true, centerId: { in: centerIds }, role: { in: centerDunningRoles } } },
      },
      select: {
        id: true,
        accessGrants: {
          where: { isActive: true, centerId: { in: centerIds }, role: { in: centerDunningRoles } },
          select: { centerId: true },
        },
      },
      take: 1000,
    }),
  ]);

  const platformOwnerIds = platformOwners.map((user) => user.id);
  const usersByTenant = new Map<string, string[]>();
  for (const user of tenantUsers) {
    pushMapValue(usersByTenant, user.tenantId, user.id);
  }

  const usersByCenter = new Map<string, string[]>();
  for (const user of staffScopedUsers) {
    pushMapValue(usersByCenter, user.staffProfile?.centerId, user.id);
  }
  for (const user of grantScopedUsers) {
    for (const grant of user.accessGrants) {
      pushMapValue(usersByCenter, grant.centerId, user.id);
    }
  }

  const notificationData: Prisma.NotificationCreateManyInput[] = [];
  const localDedupeKeys = new Set<string>();
  const notificationRetentionDate = notificationExpiresAt(now, PAYMENT_DUNNING_NOTIFICATION_RETENTION_DAYS);
  let eligible = 0;
  let waiting = 0;
  let maxed = 0;
  let resolved = 0;
  let paused = 0;
  let familyMessagesCreated = 0;
  let paymentsUpdated = 0;

  for (const payment of failedPayments) {
    const fields = objectFromJson(payment.customFields);
    const invoiceId = stringFromJson(fields.invoiceId);
    const invoice = invoiceId ? invoicesById.get(invoiceId) : null;
    const summary = paymentDunningSummary({
      paymentStatus: payment.status,
      customFields: fields,
      failedAt:
        dateFromJson(fields.dunningLastAttemptAt) ??
        dateFromJson(fields.stripeEventCreatedAt) ??
        dateFromJson(fields.failedAt) ??
        now,
      relatedInvoiceStatus: invoice?.status ?? null,
      now,
    });

    if (summary.status === "not_needed") {
      resolved += 1;
      continue;
    }
    if (summary.status === "paused") {
      paused += 1;
      continue;
    }
    if (summary.status === "waiting") {
      waiting += 1;
      continue;
    }
    if (summary.status === "maxed") {
      maxed += 1;
      continue;
    }

    eligible += 1;
    const attemptNumber = summary.attemptCount + 1;
    const nextAttemptAt = nextPaymentDunningAt(now, attemptNumber);
    const family = payment.billingAccount.family;
    const center = family.centerId ? centersById.get(family.centerId) : null;
    const guardianIds = activeGuardianUserIds(family.guardians);
    const staffRecipientIds = center
      ? uniqueIds([
          ...platformOwnerIds,
          ...(usersByTenant.get(center.organization.tenantId) ?? []),
          ...(usersByCenter.get(center.id) ?? []),
        ])
      : platformOwnerIds;
    const copy = paymentDunningCopy({
      familyName: family.name,
      centerLabel: center ? centerLabel(center) : null,
      invoiceNumber: invoice?.number ?? null,
      amountCents: payment.amountCents,
      attemptNumber,
      nextAttemptAt,
      failureMessage: paymentDunningFailureMessage(fields),
    });

    for (const userId of staffRecipientIds) {
      const dedupeKey = paymentDunningDedupeKey({
        paymentId: payment.id,
        attemptNumber,
        recipient: "staff",
        userId,
      });
      if (!dedupeKey || localDedupeKeys.has(dedupeKey)) continue;
      localDedupeKeys.add(dedupeKey);
      notificationData.push({
        userId,
        title: copy.staffTitle,
        body: copy.staffBody,
        type: "payment_dunning",
        priority: attemptNumber >= PAYMENT_DUNNING_MAX_ATTEMPTS ? "urgent" : "high",
        dedupeKey,
        expiresAt: notificationRetentionDate,
      });
    }

    for (const userId of guardianIds) {
      const dedupeKey = paymentDunningDedupeKey({
        paymentId: payment.id,
        attemptNumber,
        recipient: "guardian",
        userId,
      });
      if (!dedupeKey || localDedupeKeys.has(dedupeKey)) continue;
      localDedupeKeys.add(dedupeKey);
      notificationData.push({
        userId,
        title: copy.guardianTitle,
        body: copy.guardianBody,
        type: "payment_dunning",
        priority: "high",
        dedupeKey,
        expiresAt: notificationRetentionDate,
      });
    }

    let familyMessageId = typeof fields.dunningMessageId === "string" ? fields.dunningMessageId : null;
    if (!dryRun) {
      const existingMessage = await prisma.message.findFirst({
        where: {
          familyId: family.id,
          channel: "billing_dunning",
          subject: copy.guardianSubject,
        },
        select: { id: true },
      });
      if (existingMessage) {
        familyMessageId = existingMessage.id;
      } else {
        const message = await prisma.message.create({
          data: {
            familyId: family.id,
            subject: copy.guardianSubject,
            body: copy.guardianBody,
            channel: "billing_dunning",
            priority: "high",
            sentiment: "payment_follow_up",
          },
          select: { id: true },
        });
        familyMessageId = message.id;
        familyMessagesCreated += 1;
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          customFields: {
            ...fields,
            dunningStatus: nextAttemptAt ? "sent" : "maxed",
            dunningAttemptCount: attemptNumber,
            dunningLastAttemptAt: now.toISOString(),
            dunningNextAttemptAt: nextAttemptAt?.toISOString() ?? null,
            dunningMessageId: familyMessageId,
            dunningStaffRecipientCount: staffRecipientIds.length,
            dunningGuardianRecipientCount: guardianIds.length,
          } satisfies Prisma.InputJsonObject,
        },
      });
      paymentsUpdated += 1;
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

  if (!dryRun && pendingNotificationData.length) {
    const created = await prisma.notification.createMany({ data: pendingNotificationData, skipDuplicates: true });
    notificationsCreated = created.count;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    asOf: now,
    paymentsChecked: failedPayments.length,
    eligible,
    waiting,
    paused,
    maxed,
    resolved,
    paymentsUpdated,
    familyMessagesCreated,
    familyMessagesWouldCreate: dryRun ? eligible : 0,
    notificationsCreated,
    notificationsWouldCreate: dryRun ? pendingNotificationData.length : 0,
    notificationsSkipped: existingNotifications.length,
  });
}

export const GET = withApiLogging("GET", GETHandler);
