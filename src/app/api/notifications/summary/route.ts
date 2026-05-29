import { NextResponse } from "next/server";
import { EnrollmentStage, Prisma } from "@prisma/client";
import { canAccessAllCenters, getCurrentUser, getLeadScopeWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function centerIdFilter(centerIds: string[]) {
  return centerIds.length ? { in: centerIds } : { in: ["__no_visible_centers__"] };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const centers = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    select: { id: true },
  });
  const centerIds = centers.map((center) => center.id);
  const scopedCenterIds = centerIdFilter(centerIds);
  const leadWhere: Prisma.LeadWhereInput = { centerId: scopedCenterIds };
  const tenantWide = canAccessAllCenters(user);
  const notificationUserWhere = tenantWide
    ? { OR: [{ userId: user.id }, { userId: null }] }
    : { userId: user.id };
  const now = new Date();
  const sevenDays = new Date(now);
  sevenDays.setDate(now.getDate() + 7);
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  const [
    notifications,
    unread,
    newInquiries,
    highIntentLeads,
    openTasks,
    upcomingTours,
    pendingIncidents,
    missingFteReports,
  ] = await Promise.all([
    prisma.notification.findMany({
      where: notificationUserWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, body: true, type: true, priority: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({
      where: { readAt: null, ...notificationUserWhere },
    }),
    prisma.lead.count({ where: { ...leadWhere, stage: EnrollmentStage.NEW_INQUIRY } }),
    prisma.lead.count({ where: { ...leadWhere, score: { gte: 75 }, status: "open" } }),
    prisma.task.count({ where: { status: "open", lead: leadWhere } }),
    prisma.tour.count({ where: { centerId: scopedCenterIds, startsAt: { gte: now, lte: sevenDays } } }),
    prisma.incidentReport.count({
      where: {
        adminReviewStatus: "pending",
        OR: [
          { classroom: { is: { centerId: scopedCenterIds } } },
          { child: { family: { is: { centerId: scopedCenterIds } } } },
        ],
      },
    }),
    prisma.center.count({
      where: {
        id: scopedCenterIds,
        fteReports: { none: { weekStart: { gte: weekAgo } } },
      },
    }),
  ]);

  const derived = [
    newInquiries
      ? {
          title: `${newInquiries.toLocaleString()} new inquiries`,
          body: "Fresh website or manual inquiries are waiting for first contact.",
          type: "new_inquiries",
          priority: "high",
          href: "/crm-leads",
        }
      : null,
    highIntentLeads
      ? {
          title: `${highIntentLeads.toLocaleString()} high-intent leads`,
          body: "Lead score is 75+ and should be prioritized by enrollment staff.",
          type: "lead_priority",
          priority: "high",
          href: "/enrollment-pipeline",
        }
      : null,
    openTasks
      ? {
          title: `${openTasks.toLocaleString()} open to-do tasks`,
          body: "Follow-up tasks are still open across the visible CRM scope.",
          type: "tasks",
          priority: "normal",
          href: "/notifications",
        }
      : null,
    upcomingTours
      ? {
          title: `${upcomingTours.toLocaleString()} tours this week`,
          body: "Upcoming tours need confirmation, reminders, and post-tour follow-up.",
          type: "tours",
          priority: "normal",
          href: "/tours",
        }
      : null,
    pendingIncidents
      ? {
          title: `${pendingIncidents.toLocaleString()} incidents need review`,
          body: "Incident reports are waiting for director/admin review.",
          type: "incidents",
          priority: "high",
          href: "/incident-reports",
        }
      : null,
    missingFteReports
      ? {
          title: `${missingFteReports.toLocaleString()} FTE reports due`,
          body: "Schools without a current weekly FTE report should submit or be updated manually.",
          type: "fte",
          priority: "normal",
          href: "/fte-reports",
        }
      : null,
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    stats: {
      unread,
      newInquiries,
      highIntentLeads,
      openTasks,
      upcomingTours,
      pendingIncidents,
      missingFteReports,
    },
    derived,
    notifications,
  });
}
