import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import {
  collectNotificationEmailRecipients,
  deliverNotificationExternalChannels,
  type NotificationDeliveryRecipient,
} from "@/lib/notification-delivery";
import { notificationDedupeKey, notificationExpiresAt } from "@/lib/notification-policy";
import type { NotificationPreferenceRecord } from "@/lib/notification-preferences";
import { paymentMethodManagementSummary } from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import { uniqueEmails } from "@/lib/integrations";
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { credentialEnvValue, getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";
import { isActiveStripeAutopayPayment, isActiveStripeCheckoutPayment } from "@/lib/billing-guardrails";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  parentBalanceNeedsResponsibilityReview,
  parentVisibleBillingBalanceCents,
} from "@/lib/parent-billing-visibility";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import {
  stripeCheckoutReadiness,
  stripeConnectReadinessFromSnapshot,
} from "@/lib/stripe-connect-readiness";
import {
  isCurrentFamilyBalanceReminderEligible,
  tuitionPaymentReminderCopy,
  tuitionPaymentReminderDecision,
  tuitionPaymentReminderDedupeKey,
  tuitionPaymentReminderDeliveryDedupeKey,
  tuitionPaymentReminderSettingsFromCustomFields,
  TUITION_PAYMENT_REMINDER_NOTIFICATION_RETENTION_DAYS,
  TUITION_PAYMENT_REMINDER_VERSION,
  type TuitionPaymentReminderPhase,
} from "@/lib/tuition-payment-reminders";
import { withApiLogging } from "@/lib/request-response-logging";
import { allOpenInvoicesResponsibilitySeparated } from "@/lib/invoice-responsibility-separation";

export const runtime = "nodejs";

const recentReminderLookbackDays = 30;

type ReminderEvent = {
  billingAccountId: string;
  phase: TuitionPaymentReminderPhase;
  bucket: string;
  tenantId: string;
  centerId: string;
  familyId: string;
  title: string;
  body: string;
  priority: "normal";
  guardianUserIds: string[];
  deliveryRecipients: NotificationDeliveryRecipient[];
  deliveryDedupeKey: string;
  emailDedupeKey: string;
  replyTo: string | null;
};

type CenterReminderReadiness = {
  checkoutReady: boolean;
  billingApproved: boolean;
  reason: "ready" | "billing_not_approved" | "checkout_not_ready" | "stripe_status_unavailable";
};

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
}

function centerLabel(center: { name: string; crmLocationId: string | null }) {
  return center.crmLocationId ?? center.name;
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

function hasActiveAutopay(account: { autopayPlaceholder: boolean; customFields: unknown }) {
  const summary = paymentMethodManagementSummary({
    autopayPlaceholder: account.autopayPlaceholder,
    customFields: account.customFields,
  });
  return summary.autopayStatus === "enabled" && summary.hasStripeCustomer && summary.hasSavedPaymentMethod;
}

function selectedFamilyRecipients(family: {
  billingEmail: string | null;
  guardians: Array<{
    userId: string | null;
    email: string | null;
    isBillingContact: boolean;
    user: { isActive: boolean } | null;
  }>;
}) {
  const billingEmails = uniqueEmails([
    family.billingEmail ?? "",
    ...family.guardians.filter((guardian) => guardian.isBillingContact).map((guardian) => guardian.email ?? ""),
  ]);
  const fallbackEmails = uniqueEmails(
    family.guardians
      .filter((guardian) => guardian.user?.isActive)
      .map((guardian) => guardian.email ?? ""),
  );
  const selectedEmails = billingEmails.length ? billingEmails : fallbackEmails;
  const selectedEmailSet = new Set(selectedEmails.map((email) => email.toLowerCase()));
  const selectedGuardians = family.guardians.filter((guardian) => (
    guardian.user?.isActive && (
      guardian.isBillingContact ||
      (guardian.email ? selectedEmailSet.has(guardian.email.toLowerCase()) : false) ||
      (!billingEmails.length && fallbackEmails.length > 0)
    )
  ));
  const guardianUserIds = uniqueIds(selectedGuardians.map((guardian) => guardian.userId));
  const deliveryRecipients: NotificationDeliveryRecipient[] = selectedEmails.map((email) => {
    const guardian = family.guardians.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    return {
      userId: guardian?.user?.isActive ? guardian.userId : null,
      role: UserRole.PARENT_GUARDIAN,
      email,
      smsOptIn: false,
    };
  });
  return { guardianUserIds, deliveryRecipients };
}

async function sendGridConfiguredForTenant(tenantId: string) {
  const credentials = await getTenantIntegrationCredentialMap(tenantId, "sendgrid");
  const tenantApiKey = credentialEnvValue(credentials, "SENDGRID_API_KEY").trim();
  const tenantFrom = credentialEnvValue(credentials, "SENDGRID_FROM_EMAIL").trim();
  const platformApiKey = (process.env.SENDGRID_API_KEY ?? "").trim();
  const platformFrom = (process.env.SENDGRID_FROM_EMAIL ?? "").trim();
  if (process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS === "true") {
    return Boolean(platformApiKey && platformFrom);
  }
  return Boolean((tenantApiKey || platformApiKey) && (tenantFrom || platformFrom));
}

async function centerReminderReadiness(center: {
  name: string;
  customFields: unknown;
  organization: { tenantId: string };
}) : Promise<CenterReminderReadiness> {
  const billingApproval = stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name });
  if (!billingApproval.approved) {
    return { checkoutReady: false, billingApproved: false, reason: "billing_not_approved" };
  }

  const tenantId = center.organization.tenantId;
  const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId }));
  const webhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId }))
    || process.env.STRIPE_REQUIRE_WEBHOOK_FOR_CHECKOUT === "false";
  const checkout = stripeCheckoutReadiness({
    customFields: center.customFields,
    stripeConfigured,
    webhookConfigured,
    allowPlatformOnlyPayments: process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true",
  });
  if (!checkout.canAcceptParentPayments) {
    return { checkoutReady: false, billingApproved: true, reason: "checkout_not_ready" };
  }

  const connectedAccountId = readStripeConnectedAccountId(center.customFields);
  if (connectedAccountId && process.env.STRIPE_REQUIRE_ACTIVE_CONNECTED_ACCOUNT !== "false") {
    const retrieved = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId });
    if (!retrieved.ok || !retrieved.account) {
      return { checkoutReady: false, billingApproved: true, reason: "stripe_status_unavailable" };
    }
    const liveReadiness = stripeConnectReadinessFromSnapshot(retrieved.account);
    if (!liveReadiness.canAcceptParentPayments) {
      return { checkoutReady: false, billingApproved: true, reason: "checkout_not_ready" };
    }
  }

  return { checkoutReady: true, billingApproved: true, reason: "ready" };
}

function familyIdFromDeliveryPayload(payload: unknown) {
  const fields = record(payload);
  if (typeof fields.reminderPhase !== "string") return null;
  const familyId = fields.familyId;
  return typeof familyId === "string" && familyId ? familyId : null;
}

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const asOfParam = request.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  const now = Number.isNaN(asOf.getTime()) ? new Date() : asOf;
  const currentChildWhere = currentlyEnrolledChildWhere();

  const [accounts, withdrawnOrInactivePositiveBalanceAccounts] = await Promise.all([
    prisma.billingAccount.findMany({
      where: {
        balanceCents: { gt: 0 },
        family: {
          is: {
            centerId: { not: null },
            children: { some: currentChildWhere },
          },
        },
      },
      orderBy: { family: { name: "asc" } },
      take: 5000,
      select: {
        id: true,
        balanceCents: true,
        autopayPlaceholder: true,
        customFields: true,
        invoices: {
          where: { status: { in: [PaymentStatus.OPEN, PaymentStatus.PAID, PaymentStatus.VOID] } },
          select: { status: true, totalCents: true, customFields: true, items: { select: { description: true } } },
        },
        ledgerEntries: {
          where: {
            OR: [
              { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
              { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
            ],
          },
          select: { type: true, sourceSystem: true, amountCents: true },
        },
        payments: {
          where: { status: PaymentStatus.DRAFT, provider: "stripe" },
          select: { status: true, provider: true, customFields: true },
        },
        family: {
          select: {
            id: true,
            name: true,
            billingEmail: true,
            centerId: true,
            customFields: true,
            children: {
              select: { enrollmentStatus: true, classroomId: true, customFields: true },
            },
            guardians: {
              select: {
                userId: true,
                email: true,
                isBillingContact: true,
                user: { select: { isActive: true } },
              },
            },
          },
        },
      },
    }),
    prisma.billingAccount.count({
      where: {
        balanceCents: { gt: 0 },
        family: { is: { children: { none: currentChildWhere } } },
      },
    }),
  ]);

  const centerIds = uniqueIds(accounts.map((account) => account.family.centerId));
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
  const centerReadiness = new Map<string, CenterReminderReadiness>();
  await Promise.all(centers.map(async (center) => {
    centerReadiness.set(center.id, await centerReminderReadiness(center));
  }));

  const tenantIds = uniqueIds(centers.map((center) => center.organization.tenantId));
  const sendGridConfiguredByTenant = new Map<string, boolean>();
  await Promise.all(tenantIds.map(async (tenantId) => {
    sendGridConfiguredByTenant.set(tenantId, await sendGridConfiguredForTenant(tenantId));
  }));

  const recentCutoff = new Date(now.getTime() - recentReminderLookbackDays * 86_400_000);
  const recentDeliveries = await prisma.integrationDelivery.findMany({
    where: {
      purpose: "notification_email",
      status: { in: ["accepted", "delivered", "pending"] },
      createdAt: { gte: recentCutoff, lte: now },
    },
    orderBy: { createdAt: "desc" },
    select: { payload: true, createdAt: true },
    take: 5000,
  });
  const latestReminderByFamilyId = new Map<string, Date>();
  for (const delivery of recentDeliveries) {
    const familyId = familyIdFromDeliveryPayload(delivery.payload);
    if (familyId && !latestReminderByFamilyId.has(familyId)) {
      latestReminderByFamilyId.set(familyId, delivery.createdAt);
    }
  }

  const counters = {
    closedCenterSkipped: 0,
    settingsSkipped: 0,
    billingNotApprovedSkipped: 0,
    checkoutNotReadySkipped: 0,
    stripeStatusUnavailableSkipped: 0,
    subsidyResponsibilityReviewSkipped: 0,
    noParentPayableBalanceSkipped: 0,
    activeAutopaySkipped: 0,
    pendingPaymentSkipped: 0,
    recentlyRemindedSkipped: 0,
    noRecipientSkipped: 0,
  };
  const events: ReminderEvent[] = [];
  const eligibleByCenter = new Map<string, { centerName: string; families: number; emailAddresses: number }>();

  for (const account of accounts) {
    const family = account.family;
    const center = family.centerId ? centersById.get(family.centerId) : null;
    if (!center) {
      counters.closedCenterSkipped += 1;
      continue;
    }
    const settings = tuitionPaymentReminderSettingsFromCustomFields(center.customFields);
    if (!settings.enabled) {
      counters.settingsSkipped += 1;
      continue;
    }

    const parentVisibleBalanceCents = parentVisibleBillingBalanceCents({
      accountBalanceCents: account.balanceCents,
      agencyLedgerEntries: account.ledgerEntries,
    });
    const responsibilityReviewRequired = parentBalanceNeedsResponsibilityReview({
      accountBalanceCents: account.balanceCents,
      agencyLedgerEntries: account.ledgerEntries,
      invoiceResponsibilitySeparated: allOpenInvoicesResponsibilitySeparated(account.invoices),
      responsibilityEvidence: [
        account.customFields,
        family.customFields,
        ...family.children.map((child) => child.customFields),
        ...account.invoices.flatMap((invoice) => [invoice.customFields, invoice.items.map((item) => item.description)]),
      ],
      enforceCollectionHold: true,
    });
    if (responsibilityReviewRequired) {
      counters.subsidyResponsibilityReviewSkipped += 1;
      continue;
    }
    if (parentVisibleBalanceCents <= 0) {
      counters.noParentPayableBalanceSkipped += 1;
      continue;
    }

    const readiness = centerReadiness.get(center.id) ?? {
      checkoutReady: false,
      billingApproved: false,
      reason: "checkout_not_ready" as const,
    };
    if (!readiness.billingApproved) {
      counters.billingNotApprovedSkipped += 1;
      continue;
    }
    if (!readiness.checkoutReady) {
      if (readiness.reason === "stripe_status_unavailable") counters.stripeStatusUnavailableSkipped += 1;
      else counters.checkoutNotReadySkipped += 1;
      continue;
    }

    if (!isCurrentFamilyBalanceReminderEligible({
      balanceCents: account.balanceCents,
      parentVisibleBalanceCents,
      responsibilityReviewRequired,
      checkoutReady: readiness.checkoutReady,
      billingApproved: readiness.billingApproved,
      children: family.children,
    })) {
      continue;
    }

    const activeAutopay = hasActiveAutopay(account);
    const pendingPayment = account.payments.some((payment) => (
      isActiveStripeCheckoutPayment(payment) || isActiveStripeAutopayPayment(payment)
    ));
    const decision = tuitionPaymentReminderDecision({
      hasActiveAutopay: activeAutopay,
      hasPendingPayment: pendingPayment,
      now,
      settings,
    });
    if (!decision) {
      if (pendingPayment) counters.pendingPaymentSkipped += 1;
      else if (activeAutopay) counters.activeAutopaySkipped += 1;
      else counters.settingsSkipped += 1;
      continue;
    }

    const lastReminder = latestReminderByFamilyId.get(family.id);
    if (lastReminder && now.getTime() - lastReminder.getTime() < settings.repeatEveryDays * 86_400_000) {
      counters.recentlyRemindedSkipped += 1;
      continue;
    }

    const { guardianUserIds, deliveryRecipients } = selectedFamilyRecipients(family);
    if (!guardianUserIds.length && !deliveryRecipients.length) {
      counters.noRecipientSkipped += 1;
      continue;
    }

    const copy = tuitionPaymentReminderCopy({
      familyName: family.name,
      centerName: centerLabel(center),
      balanceCents: parentVisibleBalanceCents,
    });
    const deliveryDedupeKey = tuitionPaymentReminderDeliveryDedupeKey({
      billingAccountId: account.id,
      phase: decision.phase,
      bucket: decision.bucket,
    });
    if (!deliveryDedupeKey) {
      counters.settingsSkipped += 1;
      continue;
    }
    const emailDedupeKey = notificationDedupeKey([deliveryDedupeKey, "email"]);
    if (!emailDedupeKey) {
      counters.settingsSkipped += 1;
      continue;
    }

    events.push({
      billingAccountId: account.id,
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
      emailDedupeKey,
      replyTo: center.email,
    });
  }

  const notificationRetentionDate = notificationExpiresAt(now, TUITION_PAYMENT_REMINDER_NOTIFICATION_RETENTION_DAYS);
  const notificationData: Prisma.NotificationCreateManyInput[] = [];
  const localDedupeKeys = new Set<string>();
  for (const event of events) {
    for (const userId of event.guardianUserIds) {
      const dedupeKey = tuitionPaymentReminderDedupeKey({
        billingAccountId: event.billingAccountId,
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

  const eventTenantIds = uniqueIds(events.map((event) => event.tenantId));
  const parentUserIds = uniqueIds(events.flatMap((event) => event.deliveryRecipients.map((recipient) => recipient.userId)));
  const preferences = eventTenantIds.length
    ? await prisma.notificationPreference.findMany({
        where: {
          tenantId: { in: eventTenantIds },
          type: "billing",
          OR: [
            ...(parentUserIds.length ? [{ userId: { in: parentUserIds } }] : []),
            { role: UserRole.PARENT_GUARDIAN },
          ],
        },
        select: {
          id: true,
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
  const emailEligibleEvents = events.filter((event) => {
    const emailRecipients = collectNotificationEmailRecipients({
      type: "billing",
      recipients: event.deliveryRecipients,
      preferences: preferencesByTenant.get(event.tenantId) ?? [],
    });
    if (!emailRecipients.length) return false;
    const summary = eligibleByCenter.get(event.centerId) ?? {
      centerName: centersById.get(event.centerId)?.name ?? event.centerId,
      families: 0,
      emailAddresses: 0,
    };
    summary.families += 1;
    summary.emailAddresses += emailRecipients.length;
    eligibleByCenter.set(event.centerId, summary);
    return true;
  });

  const existingDeliveries = emailEligibleEvents.length
    ? await prisma.integrationDelivery.findMany({
        where: {
          dedupeKey: { in: emailEligibleEvents.map((event) => event.emailDedupeKey) },
          purpose: "notification_email",
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
  const eventsToDeliver = emailEligibleEvents.filter((event) => (
    !existingDeliveryKeys.has(event.emailDedupeKey)
    && sendGridConfiguredByTenant.get(event.tenantId) === true
  ));
  const providerNotConfiguredSkipped = emailEligibleEvents.filter((event) => (
    sendGridConfiguredByTenant.get(event.tenantId) !== true
  )).length;
  const externalEmailWouldAttempt = eventsToDeliver.reduce((total, event) => total + collectNotificationEmailRecipients({
    type: "billing",
    recipients: event.deliveryRecipients,
    preferences: preferencesByTenant.get(event.tenantId) ?? [],
  }).length, 0);

  let notificationsCreated = 0;
  if (!dryRun && pendingNotificationData.length) {
    const created = await prisma.notification.createMany({ data: pendingNotificationData, skipDuplicates: true });
    notificationsCreated = created.count;
  }

  let externalDeliveriesAttempted = 0;
  let externalEmailAttempted = 0;
  let externalEmailAccepted = 0;
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
        smsRequested: false,
        disableEmailClickTracking: true,
        replyTo: event.replyTo,
        fromName: "The BEE Suite",
        emailCategory: "billing",
        metadata: {
          familyId: event.familyId,
          billingAccountId: event.billingAccountId,
          reminderPhase: event.phase,
          reminderBucket: event.bucket,
          reminderVersion: TUITION_PAYMENT_REMINDER_VERSION,
        },
      });
      externalDeliveriesAttempted += 1;
      externalEmailAttempted += delivery.email.attempted;
      externalEmailAccepted += delivery.email.sent;
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    asOf: now.toISOString(),
    reminderVersion: TUITION_PAYMENT_REMINDER_VERSION,
    positiveCurrentFamilyAccountsChecked: accounts.length,
    withdrawnOrInactivePositiveBalanceAccountsExcluded: withdrawnOrInactivePositiveBalanceAccounts,
    eligibleCurrentFamilyReminders: events.length,
    eligibleEmailFamilies: emailEligibleEvents.length,
    eligibleEmailAddresses: Array.from(eligibleByCenter.values()).reduce((total, item) => total + item.emailAddresses, 0),
    eligibleByCenter: Array.from(eligibleByCenter.entries())
      .map(([centerId, item]) => ({ centerId, ...item }))
      .sort((left, right) => left.centerName.localeCompare(right.centerName)),
    ...counters,
    providerNotConfiguredSkipped,
    notificationsCreated,
    notificationsWouldCreate: dryRun ? pendingNotificationData.length : 0,
    notificationsSkipped: existingNotifications.length,
    externalDeliveriesAttempted,
    externalDeliveriesWouldAttempt: dryRun ? eventsToDeliver.length : 0,
    externalEmailAttempted,
    externalEmailWouldAttempt: dryRun ? externalEmailWouldAttempt : 0,
    externalEmailAccepted,
    externalDeliveriesSkipped: existingDeliveries.length,
  });
}

export const GET = withApiLogging("GET", GETHandler);
