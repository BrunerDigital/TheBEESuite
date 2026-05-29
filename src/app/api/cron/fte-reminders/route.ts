import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getFteDueState } from "@/lib/fte-report-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const directorRoles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR];

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

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const dueState = getFteDueState(new Date());
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
  const [platformOwners, executives, staffDirectors, grantDirectors, existingNotifications] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: UserRole.PLATFORM_OWNER },
      select: { id: true },
      take: 100,
    }),
    prisma.user.findMany({
      where: { isActive: true, tenantId: { in: tenantIds }, role: { in: [UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER] } },
      select: { id: true, tenantId: true },
      take: 500,
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: directorRoles }, staffProfile: { is: { centerId: { in: centerIds } } } },
      select: { id: true, staffProfile: { select: { centerId: true } } },
      take: 1000,
    }),
    prisma.user.findMany({
      where: { isActive: true, accessGrants: { some: { isActive: true, centerId: { in: centerIds }, role: { in: directorRoles } } } },
      select: {
        id: true,
        accessGrants: {
          where: { isActive: true, centerId: { in: centerIds }, role: { in: directorRoles } },
          select: { centerId: true },
        },
      },
      take: 1000,
    }),
    prisma.notification.findMany({
      where: { type: "fte_due", createdAt: { gte: dueState.weekStart } },
      select: { userId: true, title: true },
      take: 5000,
    }),
  ]);
  const existingKeys = new Set(existingNotifications.map((notification) => `${notification.userId ?? ""}|${notification.title}`));
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

  const notificationData = [];

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
      const existingKey = `${userId}|${title}`;
      if (existingKeys.has(existingKey)) continue;
      existingKeys.add(existingKey);
      notificationData.push({
        userId,
        title,
        body,
        type: "fte_due",
        priority: dueState.priority,
      });
    }
  }

  if (!dryRun && notificationData.length) {
    await prisma.notification.createMany({ data: notificationData });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    weekStart: dueState.weekStart,
    dueAt: dueState.dueAt,
    phase: dueState.phase,
    missingCenters: missingCenters.length,
    notificationsCreated: dryRun ? 0 : notificationData.length,
    notificationsWouldCreate: dryRun ? notificationData.length : 0,
    notificationsSkipped: existingNotifications.length,
  });
}
