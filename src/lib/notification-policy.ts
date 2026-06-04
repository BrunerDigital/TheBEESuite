import type { Prisma } from "@prisma/client";

export const DEFAULT_NOTIFICATION_RETENTION_DAYS = 180;

export function notificationExpiresAt(
  createdAt: Date = new Date(),
  retentionDays = DEFAULT_NOTIFICATION_RETENTION_DAYS,
) {
  const expiresAt = new Date(createdAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
  return expiresAt;
}

export function activeNotificationWhere(now: Date = new Date()): Prisma.NotificationWhereInput {
  return {
    archivedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export function notificationDedupeKey(parts: Array<string | number | null | undefined>) {
  const key = parts
    .map((part) => String(part ?? "").trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .join(":");

  return key || null;
}
