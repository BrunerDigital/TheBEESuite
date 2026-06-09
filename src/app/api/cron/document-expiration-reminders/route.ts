import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, Prisma, UserRole } from "@prisma/client";
import {
  certificationReminderCopy,
  documentExpirationWindow,
  documentReminderCopy,
  DOCUMENT_EXPIRATION_LOOKAHEAD_DAYS,
  DOCUMENT_EXPIRATION_NOTIFICATION_RETENTION_DAYS,
  reminderDedupeKey,
} from "@/lib/document-expiration-reminders";
import { notificationExpiresAt } from "@/lib/notification-policy";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const tenantReminderRoles = [UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER, UserRole.READ_ONLY_AUDITOR];
const centerReminderRoles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.READ_ONLY_AUDITOR];
const maxLookaheadDays = 90;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function normalizedLookaheadDays(request: NextRequest) {
  const rawDays = request.nextUrl.searchParams.get("days");
  if (!rawDays) return DOCUMENT_EXPIRATION_LOOKAHEAD_DAYS;

  const days = Number.parseInt(rawDays, 10);
  if (!Number.isFinite(days)) return DOCUMENT_EXPIRATION_LOOKAHEAD_DAYS;
  return Math.min(Math.max(days, 1), maxLookaheadDays);
}

function centerLabel(center: { name: string; crmLocationId: string | null }) {
  return center.crmLocationId ?? center.name;
}

function pushMapValue(map: Map<string, string[]>, key: string | null | undefined, value: string) {
  if (!key) return;
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));
}

function activeGuardianUserIds(
  guardians: Array<{ userId: string | null; user: { isActive: boolean } | null }>,
) {
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
  const now = new Date();
  const lookaheadDays = normalizedLookaheadDays(request);
  const { start, end } = documentExpirationWindow(now, lookaheadDays);

  const [documents, certifications] = await Promise.all([
    prisma.document.findMany({
      where: {
        expiresAt: { gte: start, lte: end },
        status: { not: DocumentStatus.EXPIRED },
        OR: [
          { family: { is: { centerId: { not: null } } } },
          { child: { is: { family: { is: { centerId: { not: null } } } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        expiresAt: true,
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
        child: {
          select: {
            id: true,
            fullName: true,
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
      take: 1000,
    }),
    prisma.certification.findMany({
      where: {
        expiresAt: { gte: start, lte: end },
        status: { notIn: ["expired", "EXPIRED"] },
        staff: { center: { status: { not: "closed" } } },
      },
      select: {
        id: true,
        name: true,
        expiresAt: true,
        staff: {
          select: {
            userId: true,
            user: { select: { id: true, name: true, isActive: true } },
            centerId: true,
            center: {
              select: {
                id: true,
                name: true,
                crmLocationId: true,
                organization: { select: { tenantId: true } },
              },
            },
          },
        },
      },
      take: 1000,
    }),
  ]);

  const documentCenterIds = documents
    .map((document) => document.child?.family.centerId ?? document.family?.centerId)
    .filter((centerId): centerId is string => typeof centerId === "string");
  const certificationCenterIds = certifications.map((certification) => certification.staff.centerId);
  const centerIds = uniqueIds([...documentCenterIds, ...certificationCenterIds]);

  const centers = centerIds.length
    ? await prisma.center.findMany({
        where: { id: { in: centerIds }, status: { not: "closed" } },
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          organization: { select: { tenantId: true } },
        },
        take: 1000,
      })
    : [];
  const centersById = new Map(centers.map((center) => [center.id, center]));
  const tenantIds = uniqueIds(centers.map((center) => center.organization.tenantId));

  const [platformOwners, tenantUsers, staffScopedUsers, grantScopedUsers] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: UserRole.PLATFORM_OWNER },
      select: { id: true },
      take: 100,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        tenantId: { in: tenantIds },
        role: { in: tenantReminderRoles },
      },
      select: { id: true, tenantId: true },
      take: 500,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: centerReminderRoles },
        staffProfile: { is: { centerId: { in: centerIds } } },
      },
      select: { id: true, staffProfile: { select: { centerId: true } } },
      take: 1000,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        accessGrants: { some: { isActive: true, centerId: { in: centerIds }, role: { in: centerReminderRoles } } },
      },
      select: {
        id: true,
        accessGrants: {
          where: { isActive: true, centerId: { in: centerIds }, role: { in: centerReminderRoles } },
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
  const notificationRetentionDate = notificationExpiresAt(now, DOCUMENT_EXPIRATION_NOTIFICATION_RETENTION_DAYS);

  for (const document of documents) {
    if (!document.expiresAt) continue;

    const family = document.child?.family ?? document.family;
    const centerId = family?.centerId;
    const center = centerId ? centersById.get(centerId) : null;
    if (!center) continue;

    const guardianIds = activeGuardianUserIds(family?.guardians ?? []);
    const recipientIds = uniqueIds([
      ...platformOwnerIds,
      ...(usersByTenant.get(center.organization.tenantId) ?? []),
      ...(usersByCenter.get(center.id) ?? []),
      ...guardianIds,
    ]);
    const copy = documentReminderCopy({
      documentName: document.name,
      documentType: document.type,
      subjectName: document.child?.fullName ?? family?.name,
      centerLabel: centerLabel(center),
      expiresAt: document.expiresAt,
      now,
    });

    for (const userId of recipientIds) {
      const dedupeKey = reminderDedupeKey({
        kind: "document",
        id: document.id,
        expiresAt: document.expiresAt,
        userId,
      });
      if (!dedupeKey || localDedupeKeys.has(dedupeKey)) continue;
      localDedupeKeys.add(dedupeKey);
      notificationData.push({
        userId,
        title: copy.title,
        body: copy.body,
        type: "document_expiration",
        priority: copy.priority,
        dedupeKey,
        expiresAt: notificationRetentionDate,
      });
    }
  }

  for (const certification of certifications) {
    if (!certification.expiresAt) continue;

    const center = certification.staff.center;
    const recipientIds = uniqueIds([
      ...platformOwnerIds,
      ...(usersByTenant.get(center.organization.tenantId) ?? []),
      ...(usersByCenter.get(center.id) ?? []),
      certification.staff.user?.isActive ? certification.staff.userId : null,
    ]);
    const copy = certificationReminderCopy({
      certificationName: certification.name,
      staffName: certification.staff.user.name,
      centerLabel: centerLabel(center),
      expiresAt: certification.expiresAt,
      now,
    });

    for (const userId of recipientIds) {
      const dedupeKey = reminderDedupeKey({
        kind: "certification",
        id: certification.id,
        expiresAt: certification.expiresAt,
        userId,
      });
      if (!dedupeKey || localDedupeKeys.has(dedupeKey)) continue;
      localDedupeKeys.add(dedupeKey);
      notificationData.push({
        userId,
        title: copy.title,
        body: copy.body,
        type: "staff_certification_expiration",
        priority: copy.priority,
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
    lookaheadDays,
    windowStart: start,
    windowEnd: end,
    documentsChecked: documents.length,
    staffCertificationsChecked: certifications.length,
    activeCentersChecked: centers.length,
    notificationsCreated,
    notificationsWouldCreate: dryRun ? pendingNotificationData.length : 0,
    notificationsSkipped: existingNotifications.length,
  });
}

export const GET = withApiLogging("GET", GETHandler);
