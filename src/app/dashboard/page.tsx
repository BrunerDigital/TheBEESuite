import { redirect } from "next/navigation";
import { EnrollmentStage, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ExecutiveDashboard, type LiveDashboardData } from "@/components/dashboard";
import { canAccessAllCenters, canManageCrmLeads, canViewDemoFallbackData, getCurrentUser, getLeadScopeWhere } from "@/lib/auth";
import { stageLabels } from "@/lib/crm";
import { getDashboardWidgetPreferenceValue, normalizeDashboardWidgetPreferences } from "@/lib/dashboard-widgets";
import type { DashboardWidgetId } from "@/lib/dashboard-widgets";
import { getCenterInquiryEmbedCode, getKidCityInquiryEmbedCode } from "@/lib/inquiry-embed";
import { prisma } from "@/lib/prisma";
import { dashboardLensesForRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect("/login?next=/dashboard");
  if (user.mustResetPassword) redirect("/reset-password?force=1&next=/dashboard");

  const centerWhere = { ...getLeadScopeWhere(user), status: { not: "closed" } };
  const centers = await prisma.center.findMany({
    where: centerWhere,
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      city: true,
      state: true,
      licensedCapacity: true,
    },
  });
  const [tenantBrand, dashboardPreferenceUser] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        name: true,
        slug: true,
        brands: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { name: true, slug: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { customFields: true },
    }),
  ]);
  const dashboardWidgetConfig = normalizeDashboardWidgetPreferences({
    role: user.role,
    value: getDashboardWidgetPreferenceValue(dashboardPreferenceUser?.customFields),
  });
  const brandName = tenantBrand?.brands[0]?.name || tenantBrand?.name || "The BEE Suite";
  const isKidCityWorkspace = /kid[-\s]*city/i.test(`${tenantBrand?.slug || ""} ${brandName}`);
  const showDemoFallbackData = canViewDemoFallbackData(user);
  const centerIds = centers.map((center) => center.id);
  const scopedCenterFilter = centerIds.length ? { in: centerIds } : { in: ["__no_centers__"] };
  const allCentersAccess = canAccessAllCenters(user);
  const leadWhere = {
    centerId: scopedCenterFilter,
    status: { notIn: ["closed", "merged"] },
  };
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  const thirtyDays = new Date(today);
  thirtyDays.setDate(today.getDate() + 30);
  const trendStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);

  const [
    activeChildren,
    newLeadCount,
    highIntentLeadCount,
    toursToday,
    openTasks,
    unreadMessages,
    pendingIncidents,
    expiringDocuments,
    staffCount,
    revenue,
    pipelineCounts,
    classroomSnapshotRows,
    parentMessageRows,
    recentDashboardLeads,
    trendLeadRows,
    trendTourRows,
    trendInvoiceRows,
  ] = await Promise.all([
    prisma.child.count({
      where: {
        classroom: {
          centerId: scopedCenterFilter,
        },
      },
    }),
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.count({ where: { ...leadWhere, score: { gte: 75 } } }),
    prisma.tour.count({
      where: {
        centerId: scopedCenterFilter,
        startsAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    }),
    prisma.task.count({
      where: {
        status: "open",
        lead: {
          centerId: scopedCenterFilter,
        },
      },
    }),
    prisma.message.count({
      where: {
        readAt: null,
        family: {
          centerId: scopedCenterFilter,
        },
      },
    }),
    prisma.incidentReport.count({
      where: {
        adminReviewStatus: "pending",
        classroom: {
          centerId: scopedCenterFilter,
        },
      },
    }),
    prisma.document.count({
      where: {
        expiresAt: {
          gte: today,
          lte: thirtyDays,
        },
        OR: [
          {
            family: {
              centerId: scopedCenterFilter,
            },
          },
          {
            child: {
              classroom: {
                centerId: scopedCenterFilter,
              },
            },
          },
        ],
      },
    }),
    prisma.staffProfile.count({
      where: {
        centerId: scopedCenterFilter,
        user: { role: UserRole.TEACHER },
      },
    }),
    prisma.invoice.aggregate({
      where: {
        billingAccount: {
          family: {
            centerId: scopedCenterFilter,
          },
        },
      },
      _sum: {
        totalCents: true,
      },
    }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: leadWhere,
      _count: {
        _all: true,
      },
    }),
    prisma.classroom.findMany({
      where: {
        centerId: scopedCenterFilter,
      },
      orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { name: "asc" }],
      take: 8,
      select: {
        name: true,
        ageGroup: true,
        capacity: true,
        ratioRule: true,
        _count: {
          select: {
            children: true,
            staff: { where: { user: { role: UserRole.TEACHER } } },
          },
        },
      },
    }),
    prisma.message.findMany({
      where: {
        family: {
          centerId: scopedCenterFilter,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        subject: true,
        body: true,
        priority: true,
        sentiment: true,
        readAt: true,
        family: { select: { name: true } },
        sender: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        familyName: true,
        childName: true,
        leadSource: true,
        stage: true,
        score: true,
        desiredStartDate: true,
        ageGroupInterest: true,
        programInterest: true,
        tags: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        ...leadWhere,
        createdAt: { gte: trendStart },
      },
      select: {
        createdAt: true,
        stage: true,
      },
    }),
    prisma.tour.findMany({
      where: {
        centerId: scopedCenterFilter,
        startsAt: {
          gte: trendStart,
          lte: endOfDay,
        },
      },
      select: {
        startsAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        createdAt: { gte: trendStart },
        billingAccount: {
          family: {
            centerId: scopedCenterFilter,
          },
        },
      },
      select: {
        createdAt: true,
        totalCents: true,
      },
    }),
  ]);

  const capacity = centers.reduce((sum, center) => sum + center.licensedCapacity, 0);
  const occupancy = capacity ? Math.round((activeChildren / capacity) * 1000) / 10 : 0;
  const revenueDollars = Math.round((revenue._sum.totalCents ?? 0) / 100);
  const totalOpenSeats = Math.max(capacity - activeChildren, 0);
  const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;
  const trendBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    return {
      key: monthKey(date),
      month: date.toLocaleDateString("en-US", { month: "short" }),
      leads: 0,
      tours: 0,
      enrolled: 0,
      revenue: 0,
    };
  });
  const trendBucketByKey = new Map(trendBuckets.map((bucket) => [bucket.key, bucket]));
  trendLeadRows.forEach((lead) => {
    const bucket = trendBucketByKey.get(monthKey(lead.createdAt));
    if (!bucket) return;
    bucket.leads += 1;
    if (lead.stage === EnrollmentStage.ENROLLED) bucket.enrolled += 1;
  });
  trendTourRows.forEach((tour) => {
    const bucket = trendBucketByKey.get(monthKey(tour.startsAt));
    if (bucket) bucket.tours += 1;
  });
  trendInvoiceRows.forEach((invoice) => {
    const bucket = trendBucketByKey.get(monthKey(invoice.createdAt));
    if (bucket) bucket.revenue += Math.round(invoice.totalCents / 100);
  });
  const dashboardAnalytics = trendBuckets.map((bucket) => ({
    month: bucket.month,
    leads: bucket.leads,
    tours: bucket.tours,
    enrolled: bucket.enrolled,
    revenue: bucket.revenue,
  }));
  type DashboardNotificationRow = { widgetId: DashboardWidgetId; text: string };
  const dashboardNotificationRows: Array<DashboardNotificationRow | null> = [
    unreadMessages ? { widgetId: "familyCommunication" as const, text: `${unreadMessages.toLocaleString()} parent messages need a response` } : null,
    expiringDocuments ? { widgetId: "complianceQueue" as const, text: `${expiringDocuments.toLocaleString()} documents expire within 30 days` } : null,
    totalOpenSeats ? { widgetId: "classroomCapacity" as const, text: `${totalOpenSeats.toLocaleString()} open seats across visible centers` } : null,
    pendingIncidents ? { widgetId: "complianceQueue" as const, text: `${pendingIncidents.toLocaleString()} incident reports need review` } : null,
    highIntentLeadCount ? { widgetId: "enrollmentPipeline" as const, text: `${highIntentLeadCount.toLocaleString()} high-fit leads should be prioritized` } : null,
    openTasks ? { widgetId: "toursAndTasks" as const, text: `${openTasks.toLocaleString()} CRM follow-up tasks are open` } : null,
    toursToday ? { widgetId: "toursAndTasks" as const, text: `${toursToday.toLocaleString()} tours are scheduled today` } : null,
  ];
  const dashboardNotifications = dashboardNotificationRows.filter((item): item is DashboardNotificationRow => Boolean(item));
  const aiHighlights = [
    `${highIntentLeadCount.toLocaleString()} high-fit leads`,
    `${expiringDocuments.toLocaleString()} expiring docs`,
    `${totalOpenSeats.toLocaleString()} open seats`,
  ];
  const centerEmbedCards = centers.map((center) => {
    const displayName = [center.crmLocationId ?? center.name, [center.city, center.state].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(" · ");
    return {
      title: `${displayName} inquiry form embed`,
      description:
        "This center-specific form sends new inquiries directly into this school's CRM profile, notification routing, and reporting backup.",
      embedCode: getCenterInquiryEmbedCode({
        centerId: center.id,
        centerName: center.name,
        brandName,
      }),
    };
  });
  const inquiryEmbeds = canManageCrmLeads(user)
    ? allCentersAccess && isKidCityWorkspace
      ? [
          {
            title: "Kid City USA inquiry form embed",
            description:
              "Executive users can copy this multi-location form for the Kid City USA website. It routes each selected school to the matching CRM profile, notification email, and Google Sheets backup.",
            embedCode: getKidCityInquiryEmbedCode(),
          },
        ]
      : centerEmbedCards
    : [];
  const live: LiveDashboardData = {
    kpis: [
      { label: "Active children", value: activeChildren.toLocaleString(), trend: `${centers.length} visible centers`, tone: "emerald" },
      { label: "Enrollment capacity", value: capacity.toLocaleString(), trend: `${totalOpenSeats.toLocaleString()} open seats`, tone: "sky" },
      { label: "Occupancy", value: `${occupancy}%`, trend: "Live from center capacity", tone: "amber" },
      { label: "New leads", value: newLeadCount.toLocaleString(), trend: `${highIntentLeadCount.toLocaleString()} high-fit`, tone: "violet" },
      { label: "Tours today", value: toursToday.toLocaleString(), trend: `${openTasks.toLocaleString()} open CRM tasks`, tone: "sky" },
      { label: "Outstanding balances", value: `$${revenueDollars.toLocaleString()}`, trend: "Invoice total snapshot", tone: "rose" },
      { label: "Teachers", value: staffCount.toLocaleString(), trend: "Assigned to visible centers", tone: "emerald" },
      { label: "Incidents to review", value: pendingIncidents.toLocaleString(), trend: `${expiringDocuments.toLocaleString()} expiring docs`, tone: "amber" },
    ],
    pipelineStages: pipelineCounts.map((item) => ({
      name: stageLabels[item.stage],
      count: item._count._all,
      value: `${item._count._all.toLocaleString()} leads`,
    })),
    leadRows: recentDashboardLeads.map((lead) => ({
      family: lead.familyName,
      child: lead.childName || lead.ageGroupInterest || lead.programInterest || "Child details pending",
      source: lead.leadSource || "Website/manual",
      stage: stageLabels[lead.stage],
      score: lead.score,
      desiredStart: lead.desiredStartDate
        ? lead.desiredStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "TBD",
      tags: lead.tags.length
        ? lead.tags.map((tag) => tag.name)
        : [lead.programInterest, lead.ageGroupInterest].filter((tag): tag is string => Boolean(tag)),
    })),
    centers: centers.slice(0, 6).map((center) => ({
      name: center.name,
      region: [center.city, center.state].filter(Boolean).join(", ") || "Region not set",
      director: user.name,
      children: activeChildren,
      capacity: center.licensedCapacity,
      staff: staffCount,
      revenue: `$${revenueDollars.toLocaleString()}`,
      compliance: expiringDocuments ? 88 : 96,
    })),
    classroomSnapshots: classroomSnapshotRows.map((classroom) => {
      const staffAssigned = classroom._count.staff || 1;
      return {
        name: classroom.name,
        ageGroup: classroom.ageGroup,
        present: classroom._count.children,
        capacity: classroom.capacity,
        ratio: classroom.ratioRule ?? `${staffAssigned}:${classroom._count.children}`,
      };
    }),
    parentMessages: parentMessageRows.map((message) => ({
      from: message.family?.name ?? message.sender?.name ?? "Parent message",
      subject: message.subject ?? "Parent message",
      status: message.priority === "high" || message.priority === "urgent" ? "Priority" : message.readAt ? "Reviewed" : "Open",
      preview: message.body,
      sentiment: message.sentiment ?? (message.readAt ? "Reviewed" : "Unread"),
    })),
    aiHighlights,
    analytics: dashboardAnalytics,
    notifications: dashboardNotifications,
    asOfLabel: today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    showDemoFallbackData,
    visibleLenses: dashboardLensesForRole(user),
    dashboardWidgets: dashboardWidgetConfig.widgets,
    dashboardWidgetRoleLabel: dashboardWidgetConfig.roleLabel,
    aiSummary: `Live CRM snapshot: ${newLeadCount.toLocaleString()} leads are visible to your role, ${highIntentLeadCount.toLocaleString()} are high-fit, ${openTasks.toLocaleString()} follow-up tasks are open, and ${unreadMessages.toLocaleString()} family messages are unread. Mr. Bee suggestions require human review and do not make safety, medical, custody, legal, billing, or compliance decisions.`,
    inquiryEmbed: inquiryEmbeds[0],
    inquiryEmbeds,
  };

  return (
    <AppShell currentUser={user}>
      <ExecutiveDashboard live={live} />
    </AppShell>
  );
}
