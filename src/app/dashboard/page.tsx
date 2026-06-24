import { redirect } from "next/navigation";
import { EnrollmentStage, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ExecutiveDashboard, type LiveDashboardData } from "@/components/dashboard";
import { centerServiceDayWindow, latestLogMap } from "@/lib/attendance-state";
import { canAccessAllCenters, canManageCrmLeads, canViewDemoFallbackData, getCurrentUser, getLeadScopeWhere, requiresPasswordResetGate } from "@/lib/auth";
import { stageLabels } from "@/lib/crm";
import { buildDashboardAttendanceSnapshot } from "@/lib/dashboard-attendance-snapshot";
import { getDashboardWidgetPreferenceValue, normalizeDashboardWidgetPreferences } from "@/lib/dashboard-widgets";
import type { DashboardWidgetId } from "@/lib/dashboard-widgets";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { getFteDueState } from "@/lib/fte-report-guardrails";
import { getCenterInquiryEmbedCode, getKidCityInquiryEmbedCode } from "@/lib/inquiry-embed";
import { prisma } from "@/lib/prisma";
import { dashboardLensesForRole } from "@/lib/rbac";
import { deriveDirectorLaunchAutoCompletedIds } from "@/lib/setup-checklist-auto";
import { readCompletedSetupChecklistIds } from "@/lib/setup-checklists";
import { stripeConnectReadinessFromFields } from "@/lib/stripe-connect-readiness";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect("/login?next=/dashboard");
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=/dashboard");

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
      postalCode: true,
      timezone: true,
      licensedCapacity: true,
      customFields: true,
    },
  });
  const [tenantBrand, dashboardPreferenceUser, teacherDashboardProfile] = await Promise.all([
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
    user.role === UserRole.TEACHER
      ? prisma.staffProfile.findUnique({
          where: { userId: user.id },
          select: { centerId: true, classroomId: true },
        })
      : Promise.resolve(null),
  ]);
  const dashboardWidgetConfig = normalizeDashboardWidgetPreferences({
    role: user.role,
    value: getDashboardWidgetPreferenceValue(dashboardPreferenceUser?.customFields),
  });
  const directorChecklistCompletedIds = readCompletedSetupChecklistIds(dashboardPreferenceUser?.customFields, "director_launch");
  const teacherChecklistCompletedIds = readCompletedSetupChecklistIds(dashboardPreferenceUser?.customFields, "teacher_profile");
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
  const currentEnrollmentWhere = currentlyEnrolledChildWhere();
  const currentFamilyWhere = {
    centerId: scopedCenterFilter,
    children: { some: currentEnrollmentWhere },
  };
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  const thirtyDays = new Date(today);
  thirtyDays.setDate(today.getDate() + 30);
  const trendStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const attendanceClassroomWhere = user.role === UserRole.TEACHER
    ? teacherDashboardProfile?.classroomId
      ? { id: teacherDashboardProfile.classroomId, centerId: scopedCenterFilter }
      : { id: "__no_teacher_classroom__" }
    : { centerId: scopedCenterFilter };

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
    familyCount,
    documentCount,
    billingAccountCount,
    guardianLoginCount,
    attendanceRecordCount,
    messageTemplateCount,
    calendarEventCount,
    fteReportCount,
    complianceTaskCount,
    incidentReviewCount,
    attendanceClassroomRows,
  ] = await Promise.all([
    prisma.child.count({
      where: {
        ...currentEnrollmentWhere,
        OR: [
          { classroom: { centerId: scopedCenterFilter } },
          { family: { centerId: scopedCenterFilter } },
        ],
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
        family: currentFamilyWhere,
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
            children: { where: currentEnrollmentWhere },
            staff: { where: { user: { role: UserRole.TEACHER } } },
          },
        },
      },
    }),
    prisma.message.findMany({
      where: {
        family: currentFamilyWhere,
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
    prisma.family.count({ where: currentFamilyWhere }),
    prisma.document.count({
      where: {
        OR: [
          { family: { centerId: scopedCenterFilter } },
          { child: { family: { centerId: scopedCenterFilter } } },
        ],
      },
    }),
    prisma.billingAccount.count({ where: { family: { centerId: scopedCenterFilter } } }),
    prisma.guardian.count({ where: { family: currentFamilyWhere, userId: { not: null } } }),
    prisma.checkInOutLog.count({ where: { centerId: scopedCenterFilter } }),
    prisma.messageTemplate.count({ where: { centerId: scopedCenterFilter } }),
    prisma.calendarEvent.count({ where: { centerId: scopedCenterFilter } }),
    prisma.fteReport.count({ where: { centerId: scopedCenterFilter } }),
    prisma.complianceTask.count({ where: { centerId: scopedCenterFilter } }),
    prisma.incidentReport.count({ where: { classroom: { centerId: scopedCenterFilter }, adminReviewStatus: { not: "pending" } } }),
    prisma.classroom.findMany({
      where: attendanceClassroomWhere,
      orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { name: "asc" }],
      take: 150,
      select: {
        id: true,
        name: true,
        centerId: true,
        center: {
          select: {
            name: true,
            crmLocationId: true,
            city: true,
            state: true,
            postalCode: true,
            timezone: true,
            customFields: true,
          },
        },
        children: {
          where: currentEnrollmentWhere,
          select: { id: true },
          orderBy: { fullName: "asc" },
        },
      },
    }),
  ]);

  const attendanceServiceDayByCenter = new Map(
    attendanceClassroomRows.map((classroom) => [classroom.centerId, centerServiceDayWindow(today, classroom.center)]),
  );
  const attendanceServiceDayValues = Array.from(attendanceServiceDayByCenter.values());
  const attendanceChildCenterId = new Map<string, string>();
  const attendanceChildIds = attendanceClassroomRows.flatMap((classroom) =>
    classroom.children.map((child) => {
      attendanceChildCenterId.set(child.id, classroom.centerId);
      return child.id;
    }),
  );
  const attendanceWindowStart = attendanceServiceDayValues.length
    ? new Date(Math.min(...attendanceServiceDayValues.map((serviceDay) => serviceDay.start.getTime())))
    : null;
  const attendanceWindowEnd = attendanceServiceDayValues.length
    ? new Date(Math.max(...attendanceServiceDayValues.map((serviceDay) => serviceDay.end.getTime())))
    : null;
  const [dashboardCheckLogs, dashboardAttendanceRecords] = attendanceChildIds.length && attendanceWindowStart && attendanceWindowEnd
    ? await Promise.all([
        prisma.checkInOutLog.findMany({
          where: {
            childId: { in: attendanceChildIds },
            occurredAt: { gte: attendanceWindowStart, lt: attendanceWindowEnd },
          },
          orderBy: { occurredAt: "desc" },
          select: { childId: true, centerId: true, type: true, occurredAt: true },
        }),
        prisma.attendanceRecord.findMany({
          where: {
            childId: { in: attendanceChildIds },
            date: { gte: attendanceWindowStart, lt: attendanceWindowEnd },
          },
          orderBy: { date: "desc" },
          select: { childId: true, status: true, date: true },
        }),
      ])
    : [[], []] as const;
  function isWithinAttendanceServiceDay(centerId: string | undefined, date: Date) {
    const serviceDay = centerId ? attendanceServiceDayByCenter.get(centerId) : null;
    return Boolean(serviceDay && date >= serviceDay.start && date < serviceDay.end);
  }
  const latestDashboardCheckLogByChild = latestLogMap(
    dashboardCheckLogs.filter((log) =>
      isWithinAttendanceServiceDay(log.centerId ?? attendanceChildCenterId.get(log.childId), log.occurredAt),
    ),
  );
  const latestDashboardAttendanceRecordByChild = new Map<string, { status: string; date: Date }>();
  for (const record of dashboardAttendanceRecords) {
    if (!record.childId || latestDashboardAttendanceRecordByChild.has(record.childId)) continue;
    if (!isWithinAttendanceServiceDay(attendanceChildCenterId.get(record.childId), record.date)) continue;
    latestDashboardAttendanceRecordByChild.set(record.childId, {
      status: record.status,
      date: record.date,
    });
  }
  const attendanceScopeLabel = user.role === UserRole.TEACHER
    ? attendanceClassroomRows[0]
      ? `${attendanceClassroomRows[0].center.crmLocationId ?? attendanceClassroomRows[0].center.name} - ${attendanceClassroomRows[0].name}`
      : "Assigned classroom not set"
    : centers.length === 1
      ? `All classes at ${centers[0].crmLocationId ?? centers[0].name}`
      : "All classes across visible schools";
  const attendanceSnapshot = buildDashboardAttendanceSnapshot({
    scopeLabel: attendanceScopeLabel,
    classrooms: attendanceClassroomRows.map((classroom) => ({
      id: classroom.id,
      name: classroom.name,
      centerName: classroom.center.crmLocationId ?? classroom.center.name,
      children: classroom.children,
    })),
    latestLogByChild: latestDashboardCheckLogByChild,
    latestRecordByChild: latestDashboardAttendanceRecordByChild,
  });

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
  const visibleDashboardLenses = dashboardLensesForRole(user);
  const directorChecklistAutomaticCompletedIds = deriveDirectorLaunchAutoCompletedIds({
    centerCount: centers.length,
    classroomCount: classroomSnapshotRows.length,
    teacherStaffCount: staffCount,
    importedFamilyCount: familyCount,
    importedChildCount: activeChildren,
    documentCount,
    billingAccountCount,
    invoiceCount: trendInvoiceRows.length,
    guardianLoginCount,
    attendanceRecordCount,
    messageTemplateCount,
    parentMessageCount: unreadMessages + parentMessageRows.length,
    calendarEventCount,
    fteReportCount,
    complianceTaskCount,
    incidentReviewCount,
    leadCount: newLeadCount + highIntentLeadCount,
    dashboardConfigured: dashboardWidgetConfig.widgets.some((widget) => widget.visible),
    payoutReady: centers.some((center) => stripeConnectReadinessFromFields(center.customFields).status === "ready"),
  });
  const canSeeExecutiveMetrics = visibleDashboardLenses.some((lens) => ["platform", "brand", "regional"].includes(lens));
  const fteDueState = getFteDueState(today);
  const fteTrendStart = new Date(fteDueState.weekStart);
  fteTrendStart.setUTCDate(fteTrendStart.getUTCDate() - 7 * 7);
  const [
    executiveClassroomRows,
    executiveStaffRows,
    executiveLeadRows,
    executiveTourRows,
    executiveInvoiceRows,
    executiveFteRows,
    executiveExpiringDocumentRows,
    executivePendingIncidentRows,
  ] = await Promise.all([
    prisma.classroom.findMany({
      where: { centerId: scopedCenterFilter },
      select: {
        centerId: true,
        capacity: true,
        _count: { select: { children: { where: currentEnrollmentWhere } } },
      },
    }),
    prisma.staffProfile.groupBy({
      by: ["centerId"],
      where: { centerId: scopedCenterFilter, user: { role: UserRole.TEACHER } },
      _count: { _all: true },
    }),
    canSeeExecutiveMetrics ? prisma.lead.groupBy({
      by: ["centerId"],
      where: leadWhere,
      _count: { _all: true },
    }) : Promise.resolve([]),
    canSeeExecutiveMetrics ? prisma.tour.groupBy({
      by: ["centerId"],
      where: { centerId: scopedCenterFilter, startsAt: { gte: startOfDay, lte: endOfDay } },
      _count: { _all: true },
    }) : Promise.resolve([]),
    canSeeExecutiveMetrics ? prisma.invoice.findMany({
      where: {
        billingAccount: {
          family: {
            centerId: scopedCenterFilter,
          },
        },
      },
      select: {
        totalCents: true,
        billingAccount: { select: { family: { select: { centerId: true } } } },
      },
    }) : Promise.resolve([]),
    canSeeExecutiveMetrics ? prisma.fteReport.findMany({
      where: {
        centerId: scopedCenterFilter,
        weekStart: { gte: fteTrendStart },
      },
      orderBy: [{ weekStart: "asc" }, { updatedAt: "desc" }],
      select: {
        centerId: true,
        weekStart: true,
        enrolledCount: true,
        fteCount: true,
        status: true,
      },
    }) : Promise.resolve([]),
    canSeeExecutiveMetrics ? prisma.document.findMany({
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
      select: {
        family: { select: { centerId: true } },
        child: { select: { classroom: { select: { centerId: true } } } },
      },
    }) : Promise.resolve([]),
    canSeeExecutiveMetrics ? prisma.incidentReport.findMany({
      where: {
        adminReviewStatus: "pending",
        classroom: {
          centerId: scopedCenterFilter,
        },
      },
      select: {
        classroom: { select: { centerId: true } },
      },
    }) : Promise.resolve([]),
  ]);
  const classroomStatsByCenter = new Map<string, { children: number; capacity: number }>();
  for (const classroom of executiveClassroomRows) {
    const current = classroomStatsByCenter.get(classroom.centerId) ?? { children: 0, capacity: 0 };
    current.children += classroom._count.children;
    current.capacity += classroom.capacity;
    classroomStatsByCenter.set(classroom.centerId, current);
  }
  const staffByCenter = new Map(executiveStaffRows.map((row) => [row.centerId, row._count._all]));
  const leadsByCenter = new Map(executiveLeadRows.map((row) => [row.centerId, row._count._all]));
  const toursByCenter = new Map(executiveTourRows.map((row) => [row.centerId, row._count._all]));
  const revenueByCenter = new Map<string, number>();
  for (const invoice of executiveInvoiceRows) {
    const centerId = invoice.billingAccount.family.centerId;
    if (!centerId) continue;
    revenueByCenter.set(centerId, (revenueByCenter.get(centerId) ?? 0) + Math.round(invoice.totalCents / 100));
  }
  const expiringDocumentsByCenter = new Map<string, number>();
  for (const document of executiveExpiringDocumentRows) {
    const centerId = document.family?.centerId ?? document.child?.classroom?.centerId;
    if (!centerId) continue;
    expiringDocumentsByCenter.set(centerId, (expiringDocumentsByCenter.get(centerId) ?? 0) + 1);
  }
  const pendingIncidentsByCenter = new Map<string, number>();
  for (const incident of executivePendingIncidentRows) {
    const centerId = incident.classroom?.centerId;
    if (!centerId) continue;
    pendingIncidentsByCenter.set(centerId, (pendingIncidentsByCenter.get(centerId) ?? 0) + 1);
  }
  const currentWeekFteByCenter = new Map<string, (typeof executiveFteRows)[number]>();
  for (const report of executiveFteRows) {
    if (report.weekStart.getTime() === fteDueState.weekStart.getTime() && !currentWeekFteByCenter.has(report.centerId)) {
      currentWeekFteByCenter.set(report.centerId, report);
    }
  }
  const fteRowsByWeek = new Map<string, typeof executiveFteRows>();
  for (const report of executiveFteRows) {
    const key = report.weekStart.toISOString().slice(0, 10);
    const rows = fteRowsByWeek.get(key) ?? [];
    rows.push(report);
    fteRowsByWeek.set(key, rows);
  }
  const weeklyFteTrend = Array.from({ length: 8 }, (_, index) => {
    const weekDate = new Date(fteDueState.weekStart);
    weekDate.setUTCDate(weekDate.getUTCDate() - 7 * (7 - index));
    const week = weekDate.toISOString().slice(0, 10);
    const rows = fteRowsByWeek.get(week) ?? [];
    const submitted = new Set(rows.map((row) => row.centerId)).size;
    return {
      week,
      submitted,
      missing: Math.max(centers.length - submitted, 0),
      fteTotal: Math.round(rows.reduce((sum, row) => sum + row.fteCount, 0) * 100) / 100,
      enrolledTotal: rows.reduce((sum, row) => sum + row.enrolledCount, 0),
    };
  });
  const executiveSchoolComparisons = centers.map((center) => {
    const classroomStats = classroomStatsByCenter.get(center.id);
    const children = classroomStats?.children ?? 0;
    const capacityForCenter = classroomStats?.capacity || center.licensedCapacity || 0;
    const fteReport = currentWeekFteByCenter.get(center.id);
    const expiringDocumentCount = expiringDocumentsByCenter.get(center.id) ?? 0;
    const pendingIncidentCount = pendingIncidentsByCenter.get(center.id) ?? 0;
    return {
      id: center.id,
      name: center.crmLocationId ?? center.name,
      region: [center.city, center.state].filter(Boolean).join(", ") || "Region not set",
      children,
      capacity: capacityForCenter,
      occupancy: capacityForCenter ? Math.round((children / capacityForCenter) * 100) : 0,
      staff: staffByCenter.get(center.id) ?? 0,
      leads: leadsByCenter.get(center.id) ?? 0,
      toursToday: toursByCenter.get(center.id) ?? 0,
      revenueDollars: revenueByCenter.get(center.id) ?? 0,
      compliance: Math.max(0, Math.min(100, 100 - expiringDocumentCount * 3 - pendingIncidentCount * 5)),
      fteCount: fteReport ? Math.round(fteReport.fteCount * 100) / 100 : null,
      fteStatus: fteReport?.status.replaceAll("_", " ") ?? "missing",
      fteSubmitted: Boolean(fteReport),
    };
  });
  const fteSubmittedSchools = executiveSchoolComparisons.filter((school) => school.fteSubmitted).length;
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
  const aiHighlights = user.role === UserRole.TEACHER
    ? [
        `${activeChildren.toLocaleString()} children in visible classrooms`,
        `${pendingIncidents.toLocaleString()} classroom incident drafts/reviews`,
        `${unreadMessages.toLocaleString()} family messages`,
      ]
    : [
        `${highIntentLeadCount.toLocaleString()} high-fit leads`,
        `${expiringDocuments.toLocaleString()} expiring docs`,
        `${totalOpenSeats.toLocaleString()} open seats`,
      ];
  const aiSummary = user.role === UserRole.TEACHER
    ? `Classroom snapshot: ${activeChildren.toLocaleString()} children are visible to your role, ${pendingIncidents.toLocaleString()} classroom incident items need attention, and ${unreadMessages.toLocaleString()} family messages are unread. Mr. Bee suggestions require human review and do not make safety, medical, custody, legal, or licensing decisions.`
    : `Live CRM snapshot: ${newLeadCount.toLocaleString()} leads are visible to your role, ${highIntentLeadCount.toLocaleString()} are high-fit, ${openTasks.toLocaleString()} follow-up tasks are open, and ${unreadMessages.toLocaleString()} family messages are unread. Mr. Bee suggestions require human review and do not make safety, medical, custody, legal, billing, or compliance decisions.`;
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
    centers: executiveSchoolComparisons.slice(0, 6).map((center) => ({
      name: center.name,
      region: center.region,
      director: user.name,
      children: center.children,
      capacity: center.capacity,
      staff: center.staff,
      revenue: `$${center.revenueDollars.toLocaleString()}`,
      compliance: center.compliance,
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
    attendanceSnapshot,
    notifications: dashboardNotifications,
    asOfLabel: today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    showDemoFallbackData,
    visibleLenses: visibleDashboardLenses,
    dashboardWidgets: dashboardWidgetConfig.widgets,
    dashboardWidgetRoleLabel: dashboardWidgetConfig.roleLabel,
    setupChecklists: [
      ...(user.role === UserRole.TEACHER ? [{
        key: "teacher_profile" as const,
        title: "Teacher profile setup checklist",
        description: "Confirm your teacher account, classroom, roster, kiosk code, and classroom tablet workflows are ready.",
        completedIds: teacherChecklistCompletedIds,
        graphicHref: "/brand/the-bee-suite/explainers/kid-city-teacher-profile-setup-roadmap.svg",
      }] : []),
      ...(user.role === UserRole.CENTER_DIRECTOR || user.role === UserRole.ASSISTANT_DIRECTOR ? [{
        key: "director_launch" as const,
        title: "Director launch setup checklist",
        description: "Track the school-level setup work required before all BEE Suite features go live.",
        completedIds: directorChecklistCompletedIds,
        automaticCompletedIds: directorChecklistAutomaticCompletedIds,
        graphicHref: "/brand/the-bee-suite/explainers/kid-city-director-setup-roadmap.svg",
      }] : []),
    ],
    aiSummary,
    inquiryEmbed: inquiryEmbeds[0],
    inquiryEmbeds,
    executiveMetrics: canSeeExecutiveMetrics
      ? {
          currentWeekStart: fteDueState.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          fteDeadlineLabel: fteDueState.deadlineLabel,
          fteSubmittedSchools,
          fteMissingSchools: Math.max(executiveSchoolComparisons.length - fteSubmittedSchools, 0),
          schoolComparisons: executiveSchoolComparisons,
          weeklyFteTrend,
        }
      : undefined,
  };

  return (
    <AppShell currentUser={user}>
      <ExecutiveDashboard live={live} />
    </AppShell>
  );
}
