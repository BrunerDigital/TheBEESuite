import "server-only";

import { createHash } from "node:crypto";
import * as webpush from "web-push";
import { activeNotificationWhere } from "@/lib/notification-policy";
import { resolveNotificationPreferenceChannels } from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";
import { logOperationalError } from "@/lib/request-response-logging";
import {
  webPushBody,
  webPushHref,
  webPushPreferenceType,
  webPushSubscriptionShouldDeactivate,
  type WebPushPreferenceType,
} from "@/lib/web-push-policy";

type WebPushEnvironment = Record<string, string | undefined>;

type WebPushConfiguration = {
  configured: boolean;
  publicKey: string | null;
  privateKey: string | null;
  subject: string;
};

const MAX_DELIVERY_ATTEMPTS = 5;
const STALE_PROCESSING_MINUTES = 10;

function clean(value: string | undefined) {
  return String(value || "").trim();
}

function validBase64UrlKey(value: string, minimumLength: number) {
  return value.length >= minimumLength && /^[A-Za-z0-9_-]+$/.test(value);
}

export function getWebPushConfiguration(
  env: WebPushEnvironment = process.env as WebPushEnvironment,
): WebPushConfiguration {
  const publicKey = clean(env.WEB_PUSH_VAPID_PUBLIC_KEY);
  const privateKey = clean(env.WEB_PUSH_VAPID_PRIVATE_KEY);
  const configuredSubject = clean(env.WEB_PUSH_VAPID_SUBJECT);
  const subject = configuredSubject || "mailto:support@thebeesuite.io";
  const validSubject = /^(mailto:|https:\/\/)/i.test(subject);
  const configured =
    validSubject &&
    validBase64UrlKey(publicKey, 80) &&
    validBase64UrlKey(privateKey, 40);

  return {
    configured,
    publicKey: configured ? publicKey : null,
    privateKey: configured ? privateKey : null,
    subject,
  };
}

export function webPushEndpointHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function webPushUserAgentHash(userAgent: string) {
  const value = userAgent.trim();
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 32) : null;
}

function retryAt(attempts: number, now: Date) {
  const minutes = Math.min(2 ** Math.max(attempts, 1), 60);
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function errorStatus(error: unknown) {
  if (error instanceof webpush.WebPushError) return error.statusCode;
  if (error && typeof error === "object" && "statusCode" in error) {
    const status = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isInteger(status) ? status : null;
  }
  return null;
}

function errorCode(error: unknown) {
  const status = errorStatus(error);
  if (status) return `push_http_${status}`;
  if (error instanceof Error && error.name) {
    return `push_${error.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 48)}`;
  }
  return "push_delivery_error";
}

async function skipDelivery(deliveryId: string, code: string, now: Date) {
  await prisma.webPushDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "skipped",
      failedAt: now,
      errorCode: code,
    },
  });
}

async function cancelSubscriptionDeliveries(subscriptionId: string, code: string, now: Date) {
  await prisma.$transaction([
    prisma.webPushSubscription.update({
      where: { id: subscriptionId },
      data: {
        isActive: false,
        lastFailureAt: now,
        failureCount: { increment: 1 },
      },
    }),
    prisma.webPushDelivery.updateMany({
      where: {
        subscriptionId,
        status: { in: ["pending", "processing", "retry"] },
      },
      data: {
        status: "cancelled",
        failedAt: now,
        errorCode: code,
      },
    }),
  ]);
}

type DispatchCandidate = Awaited<ReturnType<typeof loadCandidates>>[number];

async function loadCandidates(limit: number, now: Date) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60 * 1000);
  return prisma.webPushDelivery.findMany({
    where: {
      OR: [
        {
          status: { in: ["pending", "retry"] },
          nextAttemptAt: { lte: now },
        },
        {
          status: "processing",
          updatedAt: { lte: staleBefore },
        },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
    include: {
      notification: {
        include: {
          user: {
            select: {
              id: true,
              tenantId: true,
              role: true,
              isActive: true,
            },
          },
        },
      },
      subscription: {
        include: {
          deviceSession: {
            select: {
              userId: true,
              tenantId: true,
              revokedAt: true,
            },
          },
        },
      },
    },
  });
}

function candidatePreferenceType(candidate: DispatchCandidate) {
  return webPushPreferenceType(candidate.notification.type);
}

async function loadPreferences(candidates: DispatchCandidate[]) {
  const eligible = candidates
    .map((candidate) => ({
      candidate,
      user: candidate.notification.user,
      type: candidatePreferenceType(candidate),
    }))
    .filter((item): item is typeof item & { user: NonNullable<typeof item.user>; type: WebPushPreferenceType } => (
      Boolean(item.user && item.type)
    ));
  const tenantIds = [...new Set(eligible.map((item) => item.user.tenantId))];
  const userIds = [...new Set(eligible.map((item) => item.user.id))];
  const roles = [...new Set(eligible.map((item) => item.user.role))];
  const types = [...new Set(eligible.map((item) => item.type))];
  if (!tenantIds.length || !userIds.length || !types.length) return [];

  return prisma.notificationPreference.findMany({
    where: {
      tenantId: { in: tenantIds },
      type: { in: types },
      OR: [
        { userId: { in: userIds } },
        { userId: null, role: { in: roles } },
      ],
    },
  });
}

async function unreadBadgeCount(userId: string, now: Date) {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null,
      ...activeNotificationWhere(now),
    },
  });
}

async function dispatchCandidate(
  candidate: DispatchCandidate,
  preferences: Awaited<ReturnType<typeof loadPreferences>>,
  configuration: WebPushConfiguration & { configured: true; publicKey: string; privateKey: string },
  now: Date,
) {
  const claimed = await prisma.webPushDelivery.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      updatedAt: candidate.updatedAt,
    },
    data: {
      status: "processing",
      lastAttemptAt: now,
    },
  });
  if (!claimed.count) return "claimed_elsewhere" as const;

  const { notification, subscription } = candidate;
  const user = notification.user;
  const preferenceType = candidatePreferenceType(candidate);

  if (!user || !notification.userId || !user.isActive) {
    await skipDelivery(candidate.id, "inactive_or_missing_user", now);
    return "skipped" as const;
  }
  if (
    !subscription.isActive ||
    subscription.userId !== user.id ||
    subscription.tenantId !== user.tenantId
  ) {
    await skipDelivery(candidate.id, "subscription_user_scope_mismatch", now);
    return "skipped" as const;
  }
  if (
    subscription.deviceSessionId &&
    (
      !subscription.deviceSession ||
      subscription.deviceSession.revokedAt ||
      subscription.deviceSession.userId !== user.id ||
      subscription.deviceSession.tenantId !== user.tenantId
    )
  ) {
    await cancelSubscriptionDeliveries(subscription.id, "device_session_revoked", now);
    return "cancelled" as const;
  }
  if (subscription.expiresAt && subscription.expiresAt <= now) {
    await cancelSubscriptionDeliveries(subscription.id, "subscription_expired", now);
    return "cancelled" as const;
  }
  if (
    notification.readAt ||
    notification.archivedAt ||
    (notification.expiresAt && notification.expiresAt <= now)
  ) {
    await skipDelivery(candidate.id, "notification_inactive", now);
    return "skipped" as const;
  }
  if (!preferenceType) {
    await skipDelivery(candidate.id, "notification_type_unmapped", now);
    return "skipped" as const;
  }

  const tenantPreferences = preferences.filter(
    (preference) => preference.tenantId === user.tenantId,
  );
  const channels = resolveNotificationPreferenceChannels({
    type: preferenceType,
    target: { mode: "user", userId: user.id, role: user.role },
    preferences: tenantPreferences,
  });
  if (!channels.pushEnabled) {
    await skipDelivery(candidate.id, "push_preference_disabled", now);
    return "skipped" as const;
  }

  const badgeCount = await unreadBadgeCount(user.id, now);
  const payload = JSON.stringify({
    title: "The BEE Suite",
    body: webPushBody(preferenceType),
    url: webPushHref(preferenceType, user.role),
    tag: `bee-notification-${notification.id}`,
    notificationId: notification.id,
    badgeCount,
    icon: "/brand/the-bee-suite/app-icon-yellow.png",
    badge: "/brand/the-bee-suite/browser-icon.png",
  });

  try {
    const result = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expiresAt?.getTime() ?? null,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
      {
        vapidDetails: {
          subject: configuration.subject,
          publicKey: configuration.publicKey,
          privateKey: configuration.privateKey,
        },
        TTL: notification.priority === "high" ? 24 * 60 * 60 : 6 * 60 * 60,
        urgency: notification.priority === "high" ? "high" : "normal",
        topic: notification.id.slice(-32),
        timeout: 10_000,
      },
    );

    await prisma.$transaction([
      prisma.webPushDelivery.update({
        where: { id: candidate.id },
        data: {
          status: "delivered",
          attempts: { increment: 1 },
          deliveredAt: new Date(),
          responseStatus: result.statusCode,
          errorCode: null,
        },
      }),
      prisma.webPushSubscription.update({
        where: { id: subscription.id },
        data: {
          lastSuccessAt: new Date(),
          failureCount: 0,
        },
      }),
    ]);
    return "delivered" as const;
  } catch (error) {
    const status = errorStatus(error);
    const attempts = candidate.attempts + 1;
    const code = errorCode(error);
    const deactivateSubscription = webPushSubscriptionShouldDeactivate(status, subscription.failureCount + 1);
    const terminal = deactivateSubscription || attempts >= MAX_DELIVERY_ATTEMPTS;
    const failedAt = terminal ? new Date() : null;

    await prisma.$transaction([
      prisma.webPushDelivery.update({
        where: { id: candidate.id },
        data: {
          status: terminal ? "failed" : "retry",
          attempts: { increment: 1 },
          nextAttemptAt: terminal ? now : retryAt(attempts, now),
          failedAt,
          responseStatus: status,
          errorCode: code,
        },
      }),
      prisma.webPushSubscription.update({
        where: { id: subscription.id },
        data: {
          isActive: deactivateSubscription ? false : subscription.isActive,
          lastFailureAt: new Date(),
          failureCount: { increment: 1 },
        },
      }),
    ]);

    logOperationalError("web_push.delivery_failed", error, {
      status: status ?? 0,
      attempts,
      terminal,
      deactivateSubscription,
    });
    return terminal ? "failed" as const : "retry" as const;
  }
}

export async function dispatchPendingWebPush(options: { limit?: number; now?: Date } = {}) {
  const configuration = getWebPushConfiguration();
  if (!configuration.configured || !configuration.publicKey || !configuration.privateKey) {
    return {
      configured: false,
      selected: 0,
      delivered: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    };
  }

  const now = options.now ?? new Date();
  const candidates = await loadCandidates(options.limit ?? 50, now);
  const preferences = await loadPreferences(candidates);
  const results: string[] = [];

  for (let index = 0; index < candidates.length; index += 10) {
    const batch = candidates.slice(index, index + 10);
    results.push(...await Promise.all(batch.map((candidate) => (
      dispatchCandidate(
        candidate,
        preferences,
        configuration as WebPushConfiguration & { configured: true; publicKey: string; privateKey: string },
        now,
      )
    ))));
  }

  return {
    configured: true,
    selected: candidates.length,
    delivered: results.filter((result) => result === "delivered").length,
    retried: results.filter((result) => result === "retry").length,
    failed: results.filter((result) => result === "failed").length,
    skipped: results.filter((result) => result === "skipped").length,
    cancelled: results.filter((result) => result === "cancelled").length,
  };
}
