import { notFound, redirect } from "next/navigation";
import { DocumentStatus, EnrollmentStage, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import {
  AgencyAdminPage,
  AiCommandPage,
  AnnouncementsPage,
  AnalyticsPage,
  AuditLogsPage,
  AutomationsPage,
  BillingInvoicesPage,
  BillingSettingsPage,
  CalendarPage,
  CampaignsPage,
  CenterDashboardPage,
  ChildProfilesPage,
  ClassroomDashboardPage,
  AttendancePage,
  CompliancePage,
  DailyReportsPage,
  DocumentsPage,
  EnrollmentPipelinePage,
  FormsPage,
  FamilyProfilesPage,
  FteReportsPage,
  IntegrationsPage,
  IncidentReportsPage,
  MessagesPage,
  MultiLocationDashboardPage,
  NotificationCenterPage,
  PaymentsPage,
  ParentMediaReviewPage,
  ReputationPage,
  StaffPage,
  TeamPermissionsPage,
  ToursPage,
  WaitlistPage,
  WhiteLabelPage,
} from "@/components/live-ops-pages";
import type { FteReportRow } from "@/components/fte-report-form";
import { AuthLikePage, ModulePage } from "@/components/module-page";
import { ParentPortalWorkspace } from "@/components/parent-portal-workspace";
import { TeacherMobileWorkspace } from "@/components/teacher-mobile-workspace";
import { getModule, modules } from "@/lib/demo-data";
import { canAccessAllCenters, canViewExecutiveDemoData, getCurrentUser, getLeadScopeWhere, type CurrentUser } from "@/lib/auth";
import { enrollmentStages, stageLabels } from "@/lib/crm";
import {
  executiveAnnouncementDemoRows,
  executiveClassroomDemoRows,
  executiveDailyReportDemoRows,
  executiveParentMessageDemoRows,
  executiveParentPortalDemo,
} from "@/lib/executive-demo-data";
import { getFteDueState, startOfFteWeek } from "@/lib/fte-report-guardrails";
import { getKidCityFteSnapshot } from "@/lib/fte-reports";
import { getStripeApplicationFeeBps, getStripeParentSurchargeBps } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { canAccessModule } from "@/lib/rbac";
import { signChildMediaRecords } from "@/lib/supabase-storage";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return [
    ...modules.map((module) => ({ slug: module.slug })),
    { slug: "forgot-password" },
  ];
}

function centerIdFilter(centerIds: string[]) {
  return centerIds.length ? { in: centerIds } : { in: ["__no_visible_centers__"] };
}

async function getVisibleCenters(user: CurrentUser) {
  return prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      city: true,
      state: true,
      email: true,
      status: true,
      licensedCapacity: true,
      ownerGroupId: true,
      ownerGroup: {
        select: {
          name: true,
          ownerType: true,
        },
      },
      _count: {
        select: {
          leads: true,
          staff: { where: { user: { role: UserRole.TEACHER } } },
          classrooms: true,
        },
      },
    },
  });
}

async function getFamilyIntakeCenters(user: CurrentUser) {
  const centers = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      city: true,
      state: true,
      classrooms: {
        orderBy: [{ ageGroup: "asc" }, { name: "asc" }],
        select: { id: true, name: true, ageGroup: true },
      },
    },
  });

  return centers.map((center) => ({
    id: center.id,
    name: [center.crmLocationId ?? center.name, [center.city, center.state].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
    classrooms: center.classrooms,
  }));
}

function formatCenterName(center: { name: string; crmLocationId: string | null; city?: string | null; state?: string | null }) {
  return [
    center.crmLocationId ?? center.name,
    [center.city, center.state].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
}

function serializeFteReport(report: {
  id: string;
  centerId: string;
  weekStart: Date;
  weekEnd: Date | null;
  enrolledCount: number;
  fullTimeCount: number;
  partTimeCount: number;
  fteCount: number;
  infants: number;
  toddlers: number;
  twos: number;
  preschool: number;
  preK: number;
  schoolAge: number;
  status: string;
  source: string;
  notes: string | null;
  updatedAt: Date;
  center: { name: string; crmLocationId: string | null };
  submittedBy: { name: string; email: string } | null;
}): FteReportRow {
  return {
    id: report.id,
    centerId: report.centerId,
    centerName: report.center.crmLocationId ?? report.center.name,
    weekStart: report.weekStart.toISOString(),
    weekEnd: report.weekEnd?.toISOString() ?? null,
    enrolledCount: report.enrolledCount,
    fullTimeCount: report.fullTimeCount,
    partTimeCount: report.partTimeCount,
    fteCount: report.fteCount,
    infants: report.infants,
    toddlers: report.toddlers,
    twos: report.twos,
    preschool: report.preschool,
    preK: report.preK,
    schoolAge: report.schoolAge,
    status: report.status,
    source: report.source,
    notes: report.notes,
    submittedBy: report.submittedBy?.email ?? report.submittedBy?.name ?? null,
    updatedAt: report.updatedAt.toISOString(),
  };
}

async function getFteReports(centerIds: string[], take = 150) {
  return prisma.fteReport.findMany({
    where: { centerId: centerIdFilter(centerIds) },
    orderBy: [{ weekStart: "desc" }, { updatedAt: "desc" }],
    take,
    include: {
      center: { select: { name: true, crmLocationId: true } },
      submittedBy: { select: { name: true, email: true } },
    },
  });
}

function buildFteTrendData(
  centers: Array<{ id: string; name: string; crmLocationId: string | null; city?: string | null; state?: string | null }>,
  reports: Awaited<ReturnType<typeof getFteReports>>,
  currentWeekStart: Date,
) {
  const centerCount = centers.length;
  const reportsByWeek = new Map<string, typeof reports>();
  for (const report of reports) {
    const key = report.weekStart.toISOString().slice(0, 10);
    const weekReports = reportsByWeek.get(key) ?? [];
    weekReports.push(report);
    reportsByWeek.set(key, weekReports);
  }

  const trendWeeks = Array.from(reportsByWeek.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-8)
    .map(([weekStart, weekReports]) => {
      const submittedCenters = new Set(weekReports.map((report) => report.centerId)).size;
      return {
        weekStart: `${weekStart}T00:00:00.000Z`,
        fteTotal: weekReports.reduce((sum, report) => sum + report.fteCount, 0),
        enrolledTotal: weekReports.reduce((sum, report) => sum + report.enrolledCount, 0),
        submittedCenters,
        approvedReports: weekReports.filter((report) => report.status === "approved").length,
        correctedReports: weekReports.filter((report) => report.status === "corrected").length,
        missingCenters: Math.max(centerCount - submittedCenters, 0),
      };
    });

  const latestByCenter = new Map<string, (typeof reports)[number]>();
  const currentByCenter = new Map<string, (typeof reports)[number]>();
  for (const report of reports) {
    if (!latestByCenter.has(report.centerId)) latestByCenter.set(report.centerId, report);
    if (report.weekStart.getTime() === currentWeekStart.getTime()) currentByCenter.set(report.centerId, report);
  }

  return {
    trendWeeks,
    latestByCenter,
    currentByCenter,
    centerSnapshots: centers.map((center) => {
      const latest = latestByCenter.get(center.id);
      const current = currentByCenter.get(center.id);
      return {
        id: center.id,
        name: formatCenterName(center),
        latestWeekStart: latest?.weekStart.toISOString() ?? null,
        latestFte: latest?.fteCount ?? null,
        currentWeekFte: current?.fteCount ?? null,
        status: current ? current.status.replaceAll("_", " ") : "Due",
      };
    }),
  };
}

function nextBirthdayInRange(dateOfBirth: Date | null, today: Date, daysAhead = 30) {
  if (!dateOfBirth) return null;
  const birthday = new Date(Date.UTC(today.getUTCFullYear(), dateOfBirth.getUTCMonth(), dateOfBirth.getUTCDate(), 12));
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  if (birthday < start) birthday.setUTCFullYear(birthday.getUTCFullYear() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + daysAhead);
  return birthday <= end ? birthday : null;
}

async function renderLivePage(slug: string, user: CurrentUser) {
  const tenantWide = canAccessAllCenters(user);
  const allCenters = tenantWide;
  const showExecutiveDemoData = canViewExecutiveDemoData(user);
  const centers = await getVisibleCenters(user);
  const visibleCenterIds = centers.map((center) => center.id);
  const scopedCenterIds = centerIdFilter(visibleCenterIds);
  const leadWhere: Prisma.LeadWhereInput = { centerId: scopedCenterIds };
  const today = new Date();
  const thirtyDays = new Date(today);
  thirtyDays.setDate(today.getDate() + 30);
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  const fteDueState = getFteDueState(today);

  if (slug === "multi-location-dashboard") {
    const [leads, highIntentLeads, upcomingTours, teacherCount, fte, fteReports] = await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, score: { gte: 75 } } }),
      prisma.tour.count({ where: { centerId: scopedCenterIds, startsAt: { gte: today } } }),
      prisma.staffProfile.count({ where: { centerId: scopedCenterIds, user: { role: UserRole.TEACHER } } }),
      getKidCityFteSnapshot(centers),
      getFteReports(visibleCenterIds, 250),
    ]);
    const currentFteWeekStart = fteDueState.weekStart;
    const trend = buildFteTrendData(centers, fteReports, currentFteWeekStart);
    const currentWeekReports = fteReports.filter((report) => report.weekStart.getTime() === currentFteWeekStart.getTime());
    const currentWeekReportedCenterIds = new Set(currentWeekReports.map((report) => report.centerId));

    return (
      <MultiLocationDashboardPage
        data={{
          centers,
          stats: {
            centers: centers.length,
            leads,
            highIntentLeads,
            upcomingTours,
            staff: teacherCount,
            submittedFteReports: fteReports.length,
            latestFteTotal: Array.from(trend.latestByCenter.values()).reduce((sum, report) => sum + report.fteCount, 0),
            currentWeekFteTotal: currentWeekReports.reduce((sum, report) => sum + report.fteCount, 0),
            currentWeekSubmittedCenters: currentWeekReportedCenterIds.size,
            missingFteReports: Math.max(centers.length - currentWeekReportedCenterIds.size, 0),
          },
          currentWeekStart: currentFteWeekStart.toISOString(),
          dueCenters: centers
            .filter((center) => !currentWeekReportedCenterIds.has(center.id))
            .map((center) => ({ id: center.id, name: formatCenterName(center) })),
          fte,
          fteCenters: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          fteReports: fteReports.map(serializeFteReport),
        }}
      />
    );
  }

  if (slug === "fte-reports") {
    const [fteReports, fte] = await Promise.all([
      getFteReports(visibleCenterIds, tenantWide ? 500 : 100),
      tenantWide ? getKidCityFteSnapshot(centers) : Promise.resolve(undefined),
    ]);
    const currentFteWeekStart = fteDueState.weekStart;
    const trend = buildFteTrendData(centers, fteReports, currentFteWeekStart);
    const currentWeekReports = fteReports.filter((report) => report.weekStart.getTime() === currentFteWeekStart.getTime());
    const currentWeekReportedCenterIds = new Set(currentWeekReports.map((report) => report.centerId));

    return (
      <FteReportsPage
        data={{
          mode: tenantWide ? "executive" : "director",
          centers,
          stats: {
            centers: centers.length,
            submittedFteReports: fteReports.length,
            latestFteTotal: Array.from(trend.latestByCenter.values()).reduce((sum, report) => sum + report.fteCount, 0),
            currentWeekFteTotal: currentWeekReports.reduce((sum, report) => sum + report.fteCount, 0),
            currentWeekSubmittedCenters: currentWeekReportedCenterIds.size,
            missingCurrentWeekReports: Math.max(centers.length - currentWeekReportedCenterIds.size, 0),
          },
          currentWeekStart: currentFteWeekStart.toISOString(),
          dueCenters: centers
            .filter((center) => !currentWeekReportedCenterIds.has(center.id))
            .map((center) => ({ id: center.id, name: formatCenterName(center) })),
          dueState: {
            label: fteDueState.label,
            phase: fteDueState.phase,
            priority: fteDueState.priority,
            dueAt: fteDueState.dueAt.toISOString(),
            reminder: fteDueState.reminder,
          },
          trendWeeks: trend.trendWeeks,
          centerSnapshots: trend.centerSnapshots,
          fte,
          fteCenters: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          fteReports: fteReports.map(serializeFteReport),
          exportHref: "/api/fte-reports?format=csv",
        }}
      />
    );
  }

  if (slug === "enrollment-pipeline") {
    const [pipelineCounts, highIntentCounts, recentLeads] = await Promise.all([
      prisma.lead.groupBy({
        by: ["stage"],
        where: leadWhere,
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["stage"],
        where: { ...leadWhere, score: { gte: 75 } },
        _count: { _all: true },
      }),
      prisma.lead.findMany({
        where: leadWhere,
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          familyName: true,
          email: true,
          phone: true,
          stage: true,
          score: true,
          createdAt: true,
          center: {
            select: {
              name: true,
              crmLocationId: true,
            },
          },
        },
      }),
    ]);
    const countByStage = new Map(pipelineCounts.map((item) => [item.stage, item._count._all]));
    const highByStage = new Map(highIntentCounts.map((item) => [item.stage, item._count._all]));

    return (
      <EnrollmentPipelinePage
        data={{
          stages: enrollmentStages.map((stage) => ({
            stage,
            label: stageLabels[stage],
            count: countByStage.get(stage) ?? 0,
            highIntent: highByStage.get(stage) ?? 0,
          })),
          recentLeads,
        }}
      />
    );
  }

  if (slug === "tours") {
    const tourWhere: Prisma.TourWhereInput = { centerId: scopedCenterIds };
    const [tours, upcoming, todayTours, completed] = await Promise.all([
      prisma.tour.findMany({
        where: tourWhere,
        orderBy: { startsAt: "desc" },
        take: 100,
        include: {
          center: {
            select: {
              name: true,
              crmLocationId: true,
            },
          },
          lead: {
            select: {
              familyName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      prisma.tour.count({ where: { ...tourWhere, startsAt: { gte: today } } }),
      prisma.tour.count({ where: { ...tourWhere, startsAt: { gte: startOfDay, lte: endOfDay } } }),
      prisma.tour.count({ where: { ...tourWhere, status: "completed" } }),
    ]);

    return <ToursPage data={{ tours, stats: { upcoming, today: todayTours, completed } }} />;
  }

  if (slug === "calendar") {
    const sixtyDays = new Date(today);
    sixtyDays.setDate(today.getDate() + 60);
    const centerById = new Map(centers.map((center) => [center.id, formatCenterName(center)]));
    const centerName = (centerId?: string | null) => centerId ? centerById.get(centerId) ?? "Visible center" : "No center";
    const [calendarTours, staffSchedules, invoices, expiringDocs, enrollmentStarts, birthdayChildren] = await Promise.all([
      prisma.tour.findMany({
        where: { centerId: scopedCenterIds, startsAt: { gte: startOfDay, lte: sixtyDays } },
        orderBy: { startsAt: "asc" },
        take: 150,
        include: { lead: { select: { familyName: true, childName: true } }, center: { select: { id: true, name: true, crmLocationId: true } } },
      }),
      prisma.staffSchedule.findMany({
        where: { centerId: scopedCenterIds, startsAt: { gte: startOfDay, lte: sixtyDays } },
        orderBy: { startsAt: "asc" },
        take: 150,
        include: { staff: { select: { user: { select: { name: true } } } }, center: { select: { id: true, name: true, crmLocationId: true } } },
      }),
      prisma.invoice.findMany({
        where: { dueDate: { gte: startOfDay, lte: sixtyDays }, billingAccount: { family: { is: { centerId: scopedCenterIds } } } },
        orderBy: { dueDate: "asc" },
        take: 150,
        include: { billingAccount: { select: { family: { select: { name: true, centerId: true } } } } },
      }),
      prisma.document.findMany({
        where: {
          expiresAt: { gte: startOfDay, lte: sixtyDays },
          OR: [
            { family: { is: { centerId: scopedCenterIds } } },
            { child: { is: { family: { is: { centerId: scopedCenterIds } } } } },
          ],
        },
        orderBy: { expiresAt: "asc" },
        take: 150,
        include: {
          family: { select: { name: true, centerId: true } },
          child: { select: { fullName: true, family: { select: { centerId: true } }, classroom: { select: { name: true } } } },
        },
      }),
      prisma.child.findMany({
        where: { startDate: { gte: startOfDay, lte: sixtyDays }, family: { is: { centerId: scopedCenterIds } } },
        orderBy: { startDate: "asc" },
        take: 150,
        include: { family: { select: { name: true, centerId: true } }, classroom: { select: { name: true } } },
      }),
      prisma.child.findMany({
        where: { family: { is: { centerId: scopedCenterIds } } },
        orderBy: { fullName: "asc" },
        take: 400,
        include: { family: { select: { name: true, centerId: true } }, classroom: { select: { name: true } } },
      }),
    ]);

    const events = [
      ...calendarTours.map((tour) => ({
        id: `tour:${tour.id}`,
        type: "tour",
        title: `${tour.lead?.familyName ?? "Family"} tour`,
        startsAt: tour.startsAt.toISOString(),
        endsAt: null,
        centerId: tour.centerId,
        centerName: tour.center.crmLocationId ?? tour.center.name,
        classroomName: null,
        status: tour.status,
        detail: tour.lead?.childName ? `Child: ${tour.lead.childName}` : "Enrollment tour",
      })),
      ...staffSchedules.map((schedule) => ({
        id: `staff:${schedule.id}`,
        type: "staff",
        title: `${schedule.staff.user.name} coverage`,
        startsAt: schedule.startsAt.toISOString(),
        endsAt: schedule.endsAt.toISOString(),
        centerId: schedule.centerId,
        centerName: schedule.center.crmLocationId ?? schedule.center.name,
        classroomName: null,
        status: schedule.status,
        detail: "Teacher schedule",
      })),
      ...invoices.map((invoice) => ({
        id: `billing:${invoice.id}`,
        type: "billing",
        title: `${invoice.billingAccount.family.name} invoice due`,
        startsAt: invoice.dueDate.toISOString(),
        endsAt: null,
        centerId: invoice.billingAccount.family.centerId,
        centerName: centerName(invoice.billingAccount.family.centerId),
        classroomName: null,
        status: invoice.status,
        detail: `$${Math.round(invoice.totalCents / 100).toLocaleString()} due`,
      })),
      ...expiringDocs.map((document) => {
        const centerId = document.family?.centerId ?? document.child?.family.centerId ?? null;
        return {
          id: `document:${document.id}`,
          type: "compliance",
          title: `${document.name} expires`,
          startsAt: document.expiresAt?.toISOString() ?? today.toISOString(),
          endsAt: null,
          centerId,
          centerName: centerName(centerId),
          classroomName: document.child?.classroom?.name ?? null,
          status: document.status,
          detail: document.child?.fullName ?? document.family?.name ?? document.type,
        };
      }),
      ...enrollmentStarts.map((child) => ({
        id: `start:${child.id}`,
        type: "enrollment",
        title: `${child.fullName} starts`,
        startsAt: child.startDate?.toISOString() ?? today.toISOString(),
        endsAt: null,
        centerId: child.family.centerId,
        centerName: centerName(child.family.centerId),
        classroomName: child.classroom?.name ?? null,
        status: child.enrollmentStatus,
        detail: child.family.name,
      })),
      ...birthdayChildren
        .map((child) => ({ child, birthday: nextBirthdayInRange(child.dateOfBirth, today, 30) }))
        .filter((item): item is { child: (typeof birthdayChildren)[number]; birthday: Date } => Boolean(item.birthday))
        .map(({ child, birthday }) => ({
          id: `birthday:${child.id}`,
          type: "birthday",
          title: `${child.preferredName ?? child.fullName} birthday`,
          startsAt: birthday.toISOString(),
          endsAt: null,
          centerId: child.family.centerId,
          centerName: centerName(child.family.centerId),
          classroomName: child.classroom?.name ?? null,
          status: "upcoming",
          detail: child.family.name,
        })),
    ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));

    return (
      <CalendarPage
        data={{
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          events,
          generatedAt: today.toISOString(),
        }}
      />
    );
  }

  if (slug === "waitlist") {
    const [leadWaitlist, entries] = await Promise.all([
      prisma.lead.findMany({
        where: {
          ...leadWhere,
          stage: EnrollmentStage.WAITLISTED,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          familyName: true,
          childName: true,
          programInterest: true,
          score: true,
          createdAt: true,
          center: {
            select: {
              name: true,
              crmLocationId: true,
            },
          },
        },
      }),
      prisma.waitlistEntry.findMany({
        orderBy: [{ priority: "desc" }, { desiredStartDate: "asc" }],
        take: 100,
      }),
    ]);

    return <WaitlistPage data={{ leadWaitlist, entries }} />;
  }

  if (slug === "family-detail") {
    const familyWhere: Prisma.FamilyWhereInput = { centerId: scopedCenterIds };
    const [families, total, withCustodyNotes, children, guardians, intakeCenters] = await Promise.all([
      prisma.family.findMany({
        where: familyWhere,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          guardians: { orderBy: { fullName: "asc" }, take: 4 },
          children: { orderBy: { fullName: "asc" }, take: 5 },
          _count: { select: { documents: true, messages: true, pickups: true, emergencyContacts: true } },
        },
      }),
      prisma.family.count({ where: familyWhere }),
      prisma.family.count({ where: { ...familyWhere, custodyNotes: { not: null } } }),
      prisma.child.count({ where: { family: { is: { centerId: scopedCenterIds } } } }),
      prisma.guardian.count({ where: { family: { is: { centerId: scopedCenterIds } } } }),
      getFamilyIntakeCenters(user),
    ]);

    return (
      <FamilyProfilesPage
        data={{
          families,
          importCenters: centers.map((center) => ({ id: center.id, name: center.crmLocationId ?? center.name })),
          bulkImportEnabled: tenantWide || allCenters,
          intakeCenters,
          stats: { total, withCustodyNotes, children, guardians },
        }}
      />
    );
  }

  if (slug === "child-profile") {
    const childWhere: Prisma.ChildWhereInput = allCenters
      ? {}
      : {
          OR: [
            { classroom: { is: { centerId: scopedCenterIds } } },
            { family: { is: { centerId: scopedCenterIds } } },
          ],
        };
    const [children, total, enrolled, allergies, restrictedMedicalNotes, intakeCenters] = await Promise.all([
      prisma.child.findMany({
        where: childWhere,
        orderBy: { fullName: "asc" },
        take: 150,
        include: {
          family: { select: { name: true, centerId: true } },
          classroom: {
            select: {
              name: true,
              center: { select: { name: true, crmLocationId: true } },
            },
          },
          _count: { select: { allergies: true, medicalNotes: true, documents: true, incidents: true, dailyReports: true } },
        },
      }),
      prisma.child.count({ where: childWhere }),
      prisma.child.count({ where: { ...childWhere, enrollmentStatus: "enrolled" } }),
      prisma.allergy.count({ where: { child: { family: { is: { centerId: scopedCenterIds } } } } }),
      prisma.childMedicalNote.count({ where: { restricted: true, child: { family: { is: { centerId: scopedCenterIds } } } } }),
      getFamilyIntakeCenters(user),
    ]);

    return <ChildProfilesPage data={{ children, intakeCenters, stats: { total, enrolled, allergies, restrictedMedicalNotes } }} />;
  }

  if (slug === "parent-portal") {
    const family = await prisma.family.findFirst({
      where: user.role === "PARENT_GUARDIAN"
        ? { guardians: { some: { userId: user.id } } }
        : allCenters
          ? {}
          : { centerId: scopedCenterIds },
      orderBy: { createdAt: "desc" },
      include: {
        guardians: {
          select: {
            id: true,
            userId: true,
            fullName: true,
            email: true,
            phone: true,
            relation: true,
            preferredCommunication: true,
            customFields: true,
          },
        },
          children: {
            select: {
              id: true,
              fullName: true,
              preferredName: true,
              ageGroup: true,
              enrollmentStatus: true,
              startDate: true,
              schedule: true,
              photoVideoPermission: true,
              fieldTripPermission: true,
              classroom: { select: { name: true, ageGroup: true } },
            },
            orderBy: { fullName: "asc" },
          },
      },
    });

    if (!family && showExecutiveDemoData) {
      return <ParentPortalWorkspace {...executiveParentPortalDemo} demoMode />;
    }

    const familyId = family?.id ?? "__no_family__";
    const childIds = family?.children.map((child) => child.id) ?? [];
    const [billingAccount, invoices, dailyReports, incidents, messages, documents, media, announcements] = await Promise.all([
      prisma.billingAccount.findUnique({
        where: { familyId },
        select: {
          id: true,
          balanceCents: true,
          autopayPlaceholder: true,
          payments: {
            orderBy: [{ paidAt: "desc" }, { id: "desc" }],
            take: 10,
            select: { id: true, amountCents: true, status: true, provider: true, paidAt: true },
          },
          ledgerEntries: {
            orderBy: { effectiveAt: "desc" },
            take: 20,
            select: { id: true, type: true, description: true, amountCents: true, balanceAfterCents: true, effectiveAt: true },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { billingAccount: { familyId } },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 20,
        select: { id: true, number: true, status: true, dueDate: true, totalCents: true },
      }),
      prisma.dailyReport.findMany({
        where: { childId: { in: childIds.length ? childIds : ["__none__"] } },
        orderBy: { date: "desc" },
        take: 20,
        select: {
          id: true,
          date: true,
          mood: true,
          teacherNote: true,
          suppliesNeeded: true,
          child: { select: { fullName: true } },
          meals: { select: { id: true, mealType: true, food: true, amount: true } },
          naps: { select: { id: true, startsAt: true, endsAt: true } },
          diapers: { select: { id: true, type: true, occurredAt: true, notes: true } },
          activities: { select: { id: true, title: true, notes: true } },
        },
      }),
      prisma.incidentReport.findMany({
        where: { childId: { in: childIds.length ? childIds : ["__none__"] } },
        orderBy: { occurredAt: "desc" },
        take: 20,
        select: {
          id: true,
          occurredAt: true,
          type: true,
          description: true,
          actionTaken: true,
          parentAcknowledgedAt: true,
          child: { select: { fullName: true } },
        },
      }),
      prisma.message.findMany({
        where: { familyId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, subject: true, body: true, createdAt: true },
      }),
      prisma.document.findMany({
        where: { OR: [{ familyId }, { childId: { in: childIds.length ? childIds : ["__none__"] } }] },
        orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
        take: 20,
        select: { id: true, name: true, type: true, status: true, expiresAt: true },
      }),
      prisma.childMedia.findMany({
        where: { childId: { in: childIds.length ? childIds : ["__none__"] }, sharedWithParents: true, status: "shared" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, url: true, storageKey: true, caption: true, createdAt: true, child: { select: { fullName: true } } },
      }),
      prisma.announcement.findMany({
        where: {
          OR: [
            { centerId: family?.centerId ?? "__none__" },
            { centerId: null },
          ],
          status: { in: ["active", "sent", "published"] },
        },
        orderBy: [{ sendAt: "desc" }, { id: "desc" }],
        take: 8,
        select: { id: true, title: true, body: true, sendAt: true },
      }),
    ]);

    const signedMedia = await signChildMediaRecords(media);
    const linkedGuardian = user.role === UserRole.PARENT_GUARDIAN
      ? family?.guardians.find((guardian) => guardian.userId === user.id) ?? null
      : null;
    const linkedGuardianCustomFields =
      linkedGuardian?.customFields && typeof linkedGuardian.customFields === "object" && !Array.isArray(linkedGuardian.customFields)
        ? linkedGuardian.customFields
        : {};
    const notificationPreferences =
      linkedGuardianCustomFields.notificationPreferences &&
      typeof linkedGuardianCustomFields.notificationPreferences === "object" &&
      !Array.isArray(linkedGuardianCustomFields.notificationPreferences)
        ? linkedGuardianCustomFields.notificationPreferences as Record<string, boolean>
        : null;
    return (
      <ParentPortalWorkspace
        family={family}
        billingAccount={billingAccount ? {
          id: billingAccount.id,
          balanceCents: billingAccount.balanceCents,
          autopayPlaceholder: billingAccount.autopayPlaceholder,
        } : null}
        invoices={invoices}
        payments={billingAccount?.payments ?? []}
        ledgerEntries={billingAccount?.ledgerEntries ?? []}
        dailyReports={dailyReports}
        incidents={incidents}
        messages={messages}
        documents={documents}
        media={signedMedia}
        announcements={announcements}
        currentGuardianId={linkedGuardian?.id ?? null}
        notificationPreferences={notificationPreferences}
      />
    );
  }

  if (slug === "teacher-portal") {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId: user.id },
      select: { centerId: true, classroomId: true },
    });
    const childWhereForTeacher: Prisma.ChildWhereInput = allCenters
      ? {}
      : staffProfile?.classroomId
        ? { classroomId: staffProfile.classroomId }
        : staffProfile?.centerId
          ? { classroom: { is: { centerId: staffProfile.centerId } } }
          : { classroom: { is: { centerId: scopedCenterIds } } };
    const children = await prisma.child.findMany({
      where: childWhereForTeacher,
      orderBy: [{ classroom: { name: "asc" } }, { fullName: "asc" }],
      take: 120,
      select: {
        id: true,
        fullName: true,
        ageGroup: true,
        enrollmentStatus: true,
        classroom: { select: { id: true, name: true } },
      },
    });

    return <TeacherMobileWorkspace roster={children} teacherName={user.name} />;
  }

  if (slug === "messages") {
    const messageWhere: Prisma.MessageWhereInput = allCenters
      ? {}
      : { OR: [{ family: { is: { centerId: scopedCenterIds } } }, { familyId: null }] };
    const [messages, total, unread, priority, aiReview] = await Promise.all([
      prisma.message.findMany({
        where: messageWhere,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          family: {
            select: {
              name: true,
              billingEmail: true,
              centerId: true,
            },
          },
          sender: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.message.count({ where: messageWhere }),
      prisma.message.count({ where: { ...messageWhere, readAt: null } }),
      prisma.message.count({ where: { ...messageWhere, priority: { in: ["high", "urgent"] } } }),
      prisma.message.count({
        where: {
          AND: [
            messageWhere,
            {
              OR: [
                { priority: { in: ["high", "urgent"] } },
                { sentiment: { in: ["sensitive", "negative"] } },
              ],
            },
          ],
        },
      }),
    ]);

    const demoMode = showExecutiveDemoData && messages.length === 0;
    const visibleMessages = demoMode ? executiveParentMessageDemoRows : messages;

    return (
      <MessagesPage
        data={{
          messages: visibleMessages,
          stats: demoMode
            ? {
                total: visibleMessages.length,
                unread: visibleMessages.filter((message) => !message.readAt).length,
                priority: visibleMessages.filter((message) => ["high", "urgent"].includes(message.priority)).length,
                aiReview: visibleMessages.filter((message) =>
                  ["high", "urgent"].includes(message.priority) || ["sensitive", "negative"].includes(message.sentiment ?? ""),
                ).length,
              }
            : { total, unread, priority, aiReview },
          demoMode,
        }}
      />
    );
  }

  if (slug === "announcements") {
    const announcementWhere: Prisma.AnnouncementWhereInput = allCenters
      ? {}
      : { OR: [{ centerId: scopedCenterIds }, { centerId: null }] };
    const [announcements, total, draft, scheduled, sent] = await Promise.all([
      prisma.announcement.findMany({
        where: announcementWhere,
        orderBy: [{ sendAt: "desc" }, { title: "asc" }],
        take: 100,
        include: {
          center: {
            select: {
              name: true,
              crmLocationId: true,
            },
          },
        },
      }),
      prisma.announcement.count({ where: announcementWhere }),
      prisma.announcement.count({ where: { ...announcementWhere, status: "draft" } }),
      prisma.announcement.count({ where: { ...announcementWhere, status: "scheduled" } }),
      prisma.announcement.count({ where: { ...announcementWhere, status: "sent" } }),
    ]);

    const demoMode = showExecutiveDemoData && announcements.length === 0;
    const visibleAnnouncements = demoMode ? executiveAnnouncementDemoRows : announcements;

    return (
      <AnnouncementsPage
        data={{
          announcements: visibleAnnouncements,
          stats: demoMode
            ? {
                total: visibleAnnouncements.length,
                draft: visibleAnnouncements.filter((announcement) => announcement.status === "draft").length,
                scheduled: visibleAnnouncements.filter((announcement) => announcement.status === "scheduled").length,
                sent: visibleAnnouncements.filter((announcement) => announcement.status === "sent").length,
              }
            : { total, draft, scheduled, sent },
          demoMode,
        }}
      />
    );
  }

  if (slug === "campaigns") {
    const campaignWhere: Prisma.CampaignWhereInput = {
      OR: [{ brand: { is: { tenantId: user.tenantId } } }, { brandId: null }],
    };
    const [campaigns, total, active, draft, paused] = await Promise.all([
      prisma.campaign.findMany({
        where: campaignWhere,
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 100,
        include: {
          brand: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.campaign.count({ where: campaignWhere }),
      prisma.campaign.count({ where: { ...campaignWhere, status: "active" } }),
      prisma.campaign.count({ where: { ...campaignWhere, status: "draft" } }),
      prisma.campaign.count({ where: { ...campaignWhere, status: "paused" } }),
    ]);

    return <CampaignsPage data={{ campaigns, stats: { total, active, draft, paused } }} />;
  }

  if (slug === "automations") {
    const automationWhere: Prisma.AutomationWhereInput = {
      OR: [{ brand: { is: { tenantId: user.tenantId } } }, { brandId: null }],
    };
    const [automations, total, active, paused, recentRuns] = await Promise.all([
      prisma.automation.findMany({
        where: automationWhere,
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 100,
        include: {
          brand: {
            select: {
              name: true,
            },
          },
          runs: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      }),
      prisma.automation.count({ where: automationWhere }),
      prisma.automation.count({ where: { ...automationWhere, status: "active" } }),
      prisma.automation.count({ where: { ...automationWhere, status: "paused" } }),
      prisma.automationRun.count({
        where: {
          automation: automationWhere,
          createdAt: { gte: thirtyDays },
        },
      }),
    ]);

    return <AutomationsPage data={{ automations, stats: { total, active, paused, recentRuns } }} />;
  }

  if (slug === "billing-invoices") {
    const invoiceWhere: Prisma.InvoiceWhereInput = allCenters
      ? {}
      : { billingAccount: { family: { is: { centerId: scopedCenterIds } } } };
    const [invoices, ledgerEntries, total, open, paid, openRows] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          billingAccount: {
            select: {
              balanceCents: true,
              family: { select: { name: true, billingEmail: true, centerId: true } },
            },
          },
          _count: { select: { items: true } },
        },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          billingAccount: invoiceWhere.billingAccount,
        },
        orderBy: { effectiveAt: "desc" },
        take: 50,
        include: {
          billingAccount: {
            select: {
              family: { select: { name: true, billingEmail: true, centerId: true } },
            },
          },
        },
      }),
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.invoice.count({ where: { ...invoiceWhere, status: PaymentStatus.OPEN } }),
      prisma.invoice.count({ where: { ...invoiceWhere, status: PaymentStatus.PAID } }),
      prisma.invoice.findMany({ where: { ...invoiceWhere, status: PaymentStatus.OPEN }, select: { totalCents: true } }),
    ]);

    return <BillingInvoicesPage data={{ invoices, ledgerEntries, stats: { total, open, paid, outstandingCents: openRows.reduce((sum, invoice) => sum + invoice.totalCents, 0) } }} />;
  }

  if (slug === "payments") {
    const paymentWhere: Prisma.PaymentWhereInput = allCenters
      ? {}
      : { billingAccount: { family: { is: { centerId: scopedCenterIds } } } };
    const [payments, total, paid, failed, draft, payoutCenters] = await Promise.all([
      prisma.payment.findMany({
        where: paymentWhere,
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        take: 100,
        include: {
          billingAccount: {
            select: {
              family: { select: { name: true, billingEmail: true, centerId: true } },
            },
          },
        },
      }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.payment.count({ where: { ...paymentWhere, status: PaymentStatus.PAID } }),
      prisma.payment.count({ where: { ...paymentWhere, status: PaymentStatus.FAILED } }),
      prisma.payment.count({ where: { ...paymentWhere, status: PaymentStatus.DRAFT } }),
      prisma.center.findMany({
        where: getLeadScopeWhere(user),
        select: { id: true, customFields: true },
      }),
    ]);
    const payoutStartedCenters = payoutCenters.filter((center) => {
      const fields = center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
        ? center.customFields as Record<string, unknown>
        : {};
      return Boolean(fields.stripeConnectAccountId || fields.stripeConnectedAccountId);
    }).length;
    const payoutReadyCenters = payoutCenters.filter((center) => {
      const fields = center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
        ? center.customFields as Record<string, unknown>
        : {};
      return fields.stripePayoutsEnabled === true && fields.stripeChargesEnabled === true;
    }).length;

    return (
      <PaymentsPage
        data={{
          payments,
          stats: {
            total,
            paid,
            failed,
            draft,
            stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
            webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
            payoutReadyCenters,
            payoutStartedCenters,
          },
        }}
      />
    );
  }

  if (slug === "analytics") {
    const messageWhere: Prisma.MessageWhereInput = allCenters
      ? {}
      : { family: { is: { centerId: scopedCenterIds } } };
    const invoiceWhere: Prisma.InvoiceWhereInput = allCenters
      ? {}
      : { billingAccount: { family: { is: { centerId: scopedCenterIds } } } };
    const incidentWhere: Prisma.IncidentReportWhereInput = allCenters
      ? { adminReviewStatus: "pending" }
      : {
          adminReviewStatus: "pending",
          OR: [
            { classroom: { is: { centerId: scopedCenterIds } } },
            { child: { family: { is: { centerId: scopedCenterIds } } } },
          ],
        };
    const [leads, enrolled, waitlisted, tours, openInvoices, openRows, incidentsPending, unreadMessages, stageCounts, fte] = await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, stage: EnrollmentStage.ENROLLED } }),
      prisma.lead.count({ where: { ...leadWhere, stage: EnrollmentStage.WAITLISTED } }),
      prisma.tour.count({ where: { centerId: scopedCenterIds } }),
      prisma.invoice.count({ where: { ...invoiceWhere, status: PaymentStatus.OPEN } }),
      prisma.invoice.findMany({ where: { ...invoiceWhere, status: PaymentStatus.OPEN }, select: { totalCents: true } }),
      prisma.incidentReport.count({ where: incidentWhere }),
      prisma.message.count({ where: { ...messageWhere, readAt: null } }),
      prisma.lead.groupBy({ by: ["stage"], where: leadWhere, _count: { _all: true } }),
      getKidCityFteSnapshot(centers),
    ]);

    return (
      <AnalyticsPage
        data={{
          stats: {
            leads,
            enrolled,
            waitlisted,
            tours,
            openInvoices,
            outstandingCents: openRows.reduce((sum, invoice) => sum + invoice.totalCents, 0),
            incidentsPending,
            unreadMessages,
          },
          stageCounts: stageCounts.map((stage) => ({ stage: stage.stage, count: stage._count._all })),
          fte,
        }}
      />
    );
  }

  if (slug === "reputation") {
    const [reviews, surveys] = await Promise.all([
      prisma.review.findMany({ orderBy: [{ rating: "desc" }, { source: "asc" }], take: 100 }),
      prisma.survey.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }], take: 100 }),
    ]);
    const averageRating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;

    return (
      <ReputationPage
        data={{
          reviews,
          surveys,
          stats: {
            reviews: reviews.length,
            averageRating,
            testimonials: reviews.filter((review) => review.approvedForPublicTestimonial).length,
            surveys: surveys.length,
          },
        }}
      />
    );
  }

  if (slug === "ai-command") {
    const [summaries, suggestions, pendingReview] = await Promise.all([
      prisma.aiSummary.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.aiSuggestion.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.aiSuggestion.count({ where: { status: "pending_review" } }),
    ]);

    return <AiCommandPage data={{ summaries, suggestions, stats: { summaries: summaries.length, suggestions: suggestions.length, pendingReview } }} />;
  }

  if (slug === "white-label") {
    const customizationScope = tenantWide
      ? { tenantId: user.tenantId }
      : {
          tenantId: user.tenantId,
          OR: [
            { centerId: scopedCenterIds },
            { ownerGroup: { centers: { some: { id: scopedCenterIds } } } },
            { organizationId: user.organizationId ?? "__none__" },
          ],
        };
    const [settings, customizations, assets] = await Promise.all([
      prisma.whiteLabelSettings.findMany({
        where: { brand: { tenantId: user.tenantId } },
        orderBy: { brandName: "asc" },
        include: { brand: { select: { name: true, slug: true } } },
      }),
      prisma.brandCustomization.findMany({
        where: customizationScope,
        orderBy: [{ scopeType: "asc" }, { brandName: "asc" }],
        take: 100,
        include: {
          brand: { select: { name: true, slug: true } },
          ownerGroup: { select: { name: true } },
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
      prisma.brandAsset.findMany({
        where: tenantWide
          ? { tenantId: user.tenantId }
          : {
              tenantId: user.tenantId,
              OR: [
                { centerId: scopedCenterIds },
                { ownerGroup: { centers: { some: { id: scopedCenterIds } } } },
                { brand: { orgs: { some: { id: user.organizationId ?? "__none__" } } } },
              ],
            },
        orderBy: [{ assetType: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          brand: { select: { name: true } },
          ownerGroup: { select: { name: true } },
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
    ]);

    return <WhiteLabelPage data={{ settings, customizations, assets }} />;
  }

  if (slug === "billing-settings") {
    const [products, tuitionPlans, subscriptions, billingCenters] = await Promise.all([
      prisma.product.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.tuitionPlan.findMany({ orderBy: [{ ageGroup: "asc" }, { amountCents: "asc" }] }),
      prisma.subscriptionPlaceholder.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
      prisma.center.findMany({
        where: getLeadScopeWhere(user),
        orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          email: true,
          customFields: true,
        },
      }),
    ]);

    return (
      <BillingSettingsPage
        data={{
          products,
          tuitionPlans,
          subscriptions,
          centers: billingCenters,
          stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
          webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
          applicationFeeBps: getStripeApplicationFeeBps(),
          parentSurchargeBps: getStripeParentSurchargeBps(),
          applicationFeeFixedCents: Number.parseInt(process.env.STRIPE_APPLICATION_FEE_FIXED_CENTS || "0", 10) || 0,
          parentSurchargeFixedCents: Number.parseInt(process.env.STRIPE_PARENT_SURCHARGE_FIXED_CENTS || "0", 10) || 0,
        }}
      />
    );
  }

  if (slug === "notifications") {
    const [notifications, openTasks, highIntentLeads, pendingIncidents] = await Promise.all([
      prisma.notification.findMany({
        where: {
          OR: [{ userId: null }, { userId: user.id }],
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.task.count({
        where: {
          status: "open",
          lead: leadWhere,
        },
      }),
      prisma.lead.count({
        where: {
          ...leadWhere,
          score: { gte: 75 },
        },
      }),
      prisma.incidentReport.count({
        where: {
          classroom: {
            centerId: scopedCenterIds,
          },
          adminReviewStatus: "pending",
        },
      }),
    ]);
    const unread = notifications.filter((notification) => !notification.readAt).length;

    return (
      <NotificationCenterPage
        data={{
          notifications,
          stats: { unread, openTasks, highIntentLeads, pendingIncidents },
          derived: [
            {
              title: `${openTasks.toLocaleString()} lead follow-up tasks are open`,
              body: "Review the CRM pipeline and complete school-level follow-up work.",
              priority: openTasks ? "high" : "normal",
              type: "CRM",
            },
            {
              title: `${highIntentLeads.toLocaleString()} high-intent leads are visible`,
              body: "Prioritize families with complete contact information, strong score, and selected location.",
              priority: highIntentLeads ? "high" : "normal",
              type: "Enrollment",
            },
            {
              title: `${pendingIncidents.toLocaleString()} incident reports need review`,
              body: "Incident review is a human-led safety workflow. AI should not make final safety decisions.",
              priority: pendingIncidents ? "high" : "normal",
              type: "Safety",
            },
          ],
        }}
      />
    );
  }

  if (slug === "audit-logs") {
    const where = { centerId: scopedCenterIds };
    const [logs, total, leadActions, sensitive] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { name: true, email: true } },
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { ...where, action: { startsWith: "lead." } } }),
      prisma.auditLog.count({
        where: {
          ...where,
          OR: [
            { action: { contains: "restricted", mode: "insensitive" } },
            { action: { contains: "sensitive", mode: "insensitive" } },
            { resource: { contains: "Incident", mode: "insensitive" } },
          ],
        },
      }),
    ]);

    return <AuditLogsPage data={{ logs, stats: { total, leadActions, sensitive } }} />;
  }

  if (slug === "team-permissions") {
    const scopedActiveGrantWhere: Prisma.UserAccessGrantListRelationFilter = {
      some: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: today } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: today } }] },
          {
            OR: [
              { scopeType: "CENTER", centerId: scopedCenterIds },
              { scopeType: "OWNER_GROUP", ownerGroup: { centers: { some: { id: scopedCenterIds } } } },
            ],
          },
        ],
      },
    };
    const where: Prisma.UserWhereInput = tenantWide
      ? { tenantId: user.tenantId }
      : {
          tenantId: user.tenantId,
          OR: [
            { staffProfile: { centerId: scopedCenterIds } },
            { accessGrants: scopedActiveGrantWhere },
          ],
        };
    const [users, roleCounts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 250,
        include: {
          accessGrants: {
            where: {
              isActive: true,
              OR: [{ startsAt: null }, { startsAt: { lte: today } }],
              AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: today } }] }],
            },
            orderBy: [{ scopeType: "asc" }, { createdAt: "asc" }],
            include: {
              brand: { select: { name: true } },
              organization: { select: { name: true } },
              ownerGroup: { select: { name: true } },
              center: { select: { name: true, crmLocationId: true } },
            },
          },
          staffProfile: {
            select: {
              title: true,
              center: {
                select: {
                  name: true,
                  crmLocationId: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.groupBy({
        by: ["role"],
        where,
        _count: { _all: true },
        orderBy: { role: "asc" },
      }),
    ]);

    return (
      <TeamPermissionsPage
        data={{
          users,
          roleCounts: roleCounts.map((role) => ({ role: role.role, count: role._count._all })),
        }}
      />
    );
  }

  if (slug === "agency-admin") {
    const [organizations, users, leads, ownerGroups, accessGrants, adminCenters, adminUsers] = await Promise.all([
      prisma.organization.count({
        where: tenantWide ? { tenantId: user.tenantId } : { id: user.organizationId ?? "__none__" },
      }),
      prisma.user.count({
        where: tenantWide
          ? { tenantId: user.tenantId }
          : { tenantId: user.tenantId, staffProfile: { centerId: scopedCenterIds } },
      }),
      prisma.lead.count({ where: leadWhere }),
      prisma.ownerGroup.findMany({
        where: tenantWide
          ? { tenantId: user.tenantId }
          : {
              tenantId: user.tenantId,
              centers: { some: { id: scopedCenterIds } },
            },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 100,
        select: {
          id: true,
          name: true,
          slug: true,
          ownerType: true,
          billingEmail: true,
          contactName: true,
          status: true,
          _count: { select: { centers: true, accessGrants: true } },
        },
      }),
      prisma.userAccessGrant.findMany({
        where: tenantWide
          ? { tenantId: user.tenantId, isActive: true }
          : {
              tenantId: user.tenantId,
              isActive: true,
              OR: [
                { centerId: scopedCenterIds },
                { ownerGroup: { centers: { some: { id: scopedCenterIds } } } },
                { user: { staffProfile: { centerId: scopedCenterIds } } },
              ],
            },
        orderBy: [{ scopeType: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          user: { select: { name: true, email: true } },
          brand: { select: { name: true } },
          organization: { select: { name: true } },
          ownerGroup: { select: { name: true } },
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
      prisma.center.findMany({
        where: tenantWide
          ? { organization: { tenantId: user.tenantId } }
          : { id: scopedCenterIds },
        orderBy: [{ status: "asc" }, { state: "asc" }, { city: "asc" }, { name: "asc" }],
        take: 250,
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          locationId: true,
          address: true,
          city: true,
          state: true,
          postalCode: true,
          phone: true,
          email: true,
          status: true,
          licensedCapacity: true,
          ownerGroupId: true,
          ownerGroup: { select: { name: true, ownerType: true } },
          _count: { select: { leads: true, staff: { where: { user: { role: UserRole.TEACHER } } }, classrooms: true } },
        },
      }),
      prisma.user.findMany({
        where: tenantWide
          ? { tenantId: user.tenantId }
          : { tenantId: user.tenantId, staffProfile: { centerId: scopedCenterIds } },
        orderBy: [{ isActive: "desc" }, { email: "asc" }],
        take: 150,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustResetPassword: true,
          accessGrants: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              role: true,
              scopeType: true,
              isActive: true,
              centerId: true,
              ownerGroupId: true,
              center: { select: { name: true, crmLocationId: true } },
              ownerGroup: { select: { name: true } },
            },
          },
          staffProfile: {
            select: {
              title: true,
              center: { select: { id: true, name: true, crmLocationId: true } },
            },
          },
        },
      }),
    ]);

    return (
      <AgencyAdminPage
        data={{
          stats: {
            organizations,
            centers: adminCenters.length,
            users,
            leads,
          },
          centers: adminCenters,
          users: adminUsers,
          ownerGroups,
          accessGrants,
        }}
      />
    );
  }

  if (slug === "integrations") {
    const env = (key: string) => Boolean(process.env[key]);
    const deliveryWhere: Prisma.IntegrationDeliveryWhereInput = user.role === UserRole.PLATFORM_OWNER
      ? {}
      : tenantWide
        ? { tenantId: user.tenantId }
        : { centerId: scopedCenterIds };
    const [totalDeliveries, deliveredDeliveries, pendingDeliveries, failedDeliveries, skippedDeliveries, recentDeliveries] = await Promise.all([
      prisma.integrationDelivery.count({ where: deliveryWhere }),
      prisma.integrationDelivery.count({ where: { ...deliveryWhere, status: "delivered" } }),
      prisma.integrationDelivery.count({ where: { ...deliveryWhere, status: "pending" } }),
      prisma.integrationDelivery.count({ where: { ...deliveryWhere, status: "failed" } }),
      prisma.integrationDelivery.count({ where: { ...deliveryWhere, status: "skipped" } }),
      prisma.integrationDelivery.findMany({
        where: deliveryWhere,
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          provider: true,
          purpose: true,
          status: true,
          attempts: true,
          maxAttempts: true,
          lastError: true,
          nextAttemptAt: true,
          deliveredAt: true,
          createdAt: true,
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
    ]);

    return (
      <IntegrationsPage
        data={{
          deliveryStats: {
            total: totalDeliveries,
            delivered: deliveredDeliveries,
            pending: pendingDeliveries,
            failed: failedDeliveries,
            skipped: skippedDeliveries,
          },
          recentDeliveries,
          integrations: [
            {
              name: "Supabase",
              purpose: "Database and Auth",
              status: env("DATABASE_URL") && (env("SUPABASE_ANON_KEY") || env("SUPABASE_SERVICE_ROLE_KEY")) ? "Connected" : "Missing",
              detail: "Used for Kid City USA users, CRM records, auth, audit logs, and SaaS data storage.",
            },
            {
              name: "SendGrid",
              purpose: "Inquiry and reviewed lead emails",
              status: env("SENDGRID_API_KEY") && env("SENDGRID_FROM_EMAIL") ? "Connected" : "Missing",
              detail: "Sends internal inquiry notifications and human-reviewed Mr. Bee follow-up emails.",
            },
            {
              name: "Google Sheets",
              purpose: "Lead backup",
              status: env("GOOGLE_SHEETS_WEBHOOK_URL") || env("GOOGLE_SERVICE_ACCOUNT_EMAIL") ? "Connected" : "Missing",
              detail: "Backs up every successful website inquiry outside the CRM database.",
            },
            {
              name: "OpenAI",
              purpose: "Future AI drafting",
              status: env("OPENAI_API_KEY") ? "Configured" : "Placeholder",
              detail: "Mr. Bee currently uses a guardrailed drafting layer. Full OpenAI integration remains gated by human review.",
            },
            {
              name: "Stripe",
              purpose: "Platform payments and school payouts",
              status: env("STRIPE_SECRET_KEY") && env("STRIPE_WEBHOOK_SECRET") ? "Connected" : env("STRIPE_SECRET_KEY") ? "Configured" : "Placeholder",
              detail: "Stripe Connect powers parent checkout through the platform account and routes funds to each school's connected payout account.",
            },
            {
              name: "Twilio",
              purpose: "Future SMS",
              status: env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") ? "Configured" : "Placeholder",
              detail: "SMS reminders and emergency alerts are not live yet.",
            },
          ],
        }}
      />
    );
  }

  if (slug === "center-dashboard") {
    const center = centers.find((item) => item.id === user.primaryCenterId) ?? centers[0];
    const centerWhere = center ? { centerId: center.id } : { centerId: "__none__" };
    const [leads, highIntentLeads, staff, classrooms, toursUpcoming, openTasks, recentLeads, fteReports] = await Promise.all([
      prisma.lead.count({ where: centerWhere }),
      prisma.lead.count({ where: { ...centerWhere, score: { gte: 75 } } }),
      center ? prisma.staffProfile.count({ where: { centerId: center.id, user: { role: UserRole.TEACHER } } }) : 0,
      center ? prisma.classroom.count({ where: { centerId: center.id } }) : 0,
      center
        ? prisma.tour.count({
            where: {
              centerId: center.id,
              startsAt: { gte: today },
            },
          })
        : 0,
      prisma.task.count({ where: { status: "open", lead: centerWhere } }),
      prisma.lead.findMany({
        where: centerWhere,
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          familyName: true,
          stage: true,
          score: true,
          createdAt: true,
        },
      }),
      center ? getFteReports([center.id], 24) : [],
    ]);
    const currentFteWeekStart = startOfFteWeek(today);
    const currentWeekFteReport = fteReports.find((report) => report.weekStart.getTime() === currentFteWeekStart.getTime());
    const latestFteReport = fteReports[0];

    return (
      <CenterDashboardPage
        data={{
          centerId: center?.id ?? null,
          centerName: center?.crmLocationId ?? center?.name ?? "No center assigned",
          place: [center?.city, center?.state].filter(Boolean).join(", "),
          fteCenters: center ? [{ id: center.id, name: formatCenterName(center) }] : [],
          fteReports: fteReports.map(serializeFteReport),
          stats: {
            leads,
            highIntentLeads,
            staff,
            classrooms,
            toursUpcoming,
            openTasks,
            currentWeekFte: currentWeekFteReport?.fteCount ?? null,
            latestFte: latestFteReport?.fteCount ?? null,
            fteSubmittedThisWeek: Boolean(currentWeekFteReport),
          },
          recentLeads,
        }}
      />
    );
  }

  if (slug === "classroom-dashboard") {
    const classroomWhere: Prisma.ClassroomWhereInput = { centerId: scopedCenterIds };
    const classrooms = await prisma.classroom.findMany({
      where: classroomWhere,
      orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { name: "asc" }],
      take: 150,
      include: {
        center: { select: { name: true, crmLocationId: true } },
        _count: { select: { children: true, staff: { where: { user: { role: UserRole.TEACHER } } }, dailyReports: true, incidents: true } },
      },
    });

    const demoMode = showExecutiveDemoData && classrooms.length === 0;

    return (
      <ClassroomDashboardPage
        data={{
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          classrooms: demoMode ? executiveClassroomDemoRows : classrooms,
          demoMode,
        }}
      />
    );
  }

  if (slug === "attendance") {
    const attendanceWhere: Prisma.AttendanceRecordWhereInput = allCenters
      ? {}
      : { classroom: { is: { centerId: scopedCenterIds } } };
    const [records, total, present, absent] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: attendanceWhere,
        orderBy: { date: "desc" },
        take: 100,
        include: {
          child: { select: { fullName: true, ageGroup: true } },
          classroom: {
            select: {
              name: true,
              center: { select: { name: true, crmLocationId: true } },
            },
          },
        },
      }),
      prisma.attendanceRecord.count({ where: attendanceWhere }),
      prisma.attendanceRecord.count({ where: { ...attendanceWhere, status: "present" } }),
      prisma.attendanceRecord.count({ where: { ...attendanceWhere, status: "absent" } }),
    ]);

    return <AttendancePage data={{ records, stats: { total, present, absent, other: Math.max(total - present - absent, 0) } }} />;
  }

  if (slug === "daily-reports") {
    const dailyReportWhere: Prisma.DailyReportWhereInput = allCenters
      ? {}
      : {
          OR: [
            { classroom: { is: { centerId: scopedCenterIds } } },
            { child: { family: { is: { centerId: scopedCenterIds } } } },
          ],
        };
    const [reports, total, sent, needsSupplies] = await Promise.all([
      prisma.dailyReport.findMany({
        where: dailyReportWhere,
        orderBy: { date: "desc" },
        take: 100,
        include: {
          child: { select: { fullName: true, ageGroup: true } },
          classroom: {
            select: {
              name: true,
              center: { select: { name: true, crmLocationId: true } },
            },
          },
          _count: { select: { meals: true, naps: true, diapers: true, activities: true } },
        },
      }),
      prisma.dailyReport.count({ where: dailyReportWhere }),
      prisma.dailyReport.count({ where: { ...dailyReportWhere, sentAt: { not: null } } }),
      prisma.dailyReport.count({ where: { ...dailyReportWhere, suppliesNeeded: { not: null } } }),
    ]);

    const demoMode = showExecutiveDemoData && reports.length === 0;
    const visibleReports = demoMode ? executiveDailyReportDemoRows : reports;

    return (
      <DailyReportsPage
        data={{
          reports: visibleReports,
          stats: demoMode
            ? {
                total: visibleReports.length,
                sent: visibleReports.filter((report) => Boolean(report.sentAt)).length,
                inProgress: visibleReports.filter((report) => !report.sentAt).length,
                needsSupplies: visibleReports.filter((report) => Boolean(report.suppliesNeeded)).length,
              }
            : { total, sent, inProgress: Math.max(total - sent, 0), needsSupplies },
          demoMode,
        }}
      />
    );
  }

  if (slug === "parent-media-review") {
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const mediaScopeWhere: Prisma.ChildMediaWhereInput = allCenters
      ? {}
      : {
          OR: [
            { classroom: { is: { centerId: scopedCenterIds } } },
            { child: { family: { is: { centerId: scopedCenterIds } } } },
          ],
        };
    const scopedMediaWhere = (where: Prisma.ChildMediaWhereInput): Prisma.ChildMediaWhereInput =>
      Object.keys(mediaScopeWhere).length ? { AND: [mediaScopeWhere, where] } : where;

    const [media, pending, sharedThirtyDays, rejectedThirtyDays, restrictedChildren] = await Promise.all([
      prisma.childMedia.findMany({
        where: scopedMediaWhere({ status: "permission_review", sharedWithParents: false }),
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          child: {
            select: {
              id: true,
              fullName: true,
              preferredName: true,
              ageGroup: true,
              photoVideoPermission: true,
              family: { select: { name: true, centerId: true } },
            },
          },
          classroom: {
            select: {
              name: true,
              center: { select: { id: true, name: true, crmLocationId: true, city: true, state: true } },
            },
          },
          uploadedBy: { select: { name: true, email: true, role: true } },
        },
      }),
      prisma.childMedia.count({ where: scopedMediaWhere({ status: "permission_review", sharedWithParents: false }) }),
      prisma.childMedia.count({ where: scopedMediaWhere({ status: "shared", sharedWithParents: true, createdAt: { gte: thirtyDaysAgo } }) }),
      prisma.childMedia.count({ where: scopedMediaWhere({ status: "rejected", createdAt: { gte: thirtyDaysAgo } }) }),
      prisma.child.count({
        where: allCenters
          ? { photoVideoPermission: false }
          : { photoVideoPermission: false, family: { is: { centerId: scopedCenterIds } } },
      }),
    ]);

    const centerById = new Map(centers.map((center) => [center.id, center]));
    const signedMedia = await signChildMediaRecords(media);
    const reviewMedia = signedMedia.map((item) => {
      const center = item.classroom?.center ?? (item.child.family.centerId ? centerById.get(item.child.family.centerId) ?? null : null);
      return {
        id: item.id,
        url: item.url,
        caption: item.caption,
        status: item.status,
        sharedWithParents: item.sharedWithParents,
        takenAt: item.takenAt,
        createdAt: item.createdAt,
        child: item.child,
        classroom: item.classroom ? { name: item.classroom.name } : null,
        uploadedBy: item.uploadedBy,
        center,
      };
    });

    return (
      <ParentMediaReviewPage
        data={{
          media: reviewMedia,
          stats: { pending, sharedThirtyDays, rejectedThirtyDays, restrictedChildren },
        }}
      />
    );
  }

  if (slug === "incident-reports") {
    const incidentWhere: Prisma.IncidentReportWhereInput = allCenters
      ? {}
      : {
          OR: [
            { classroom: { is: { centerId: scopedCenterIds } } },
            { child: { family: { is: { centerId: scopedCenterIds } } } },
          ],
        };
    const [incidents, total, pending, parentNotified, acknowledged] = await Promise.all([
      prisma.incidentReport.findMany({
        where: incidentWhere,
        orderBy: { occurredAt: "desc" },
        take: 100,
        include: {
          child: { select: { fullName: true } },
          classroom: {
            select: {
              name: true,
              center: { select: { name: true, crmLocationId: true } },
            },
          },
        },
      }),
      prisma.incidentReport.count({ where: incidentWhere }),
      prisma.incidentReport.count({ where: { ...incidentWhere, adminReviewStatus: "pending" } }),
      prisma.incidentReport.count({ where: { ...incidentWhere, parentNotified: true } }),
      prisma.incidentReport.count({ where: { ...incidentWhere, parentAcknowledgedAt: { not: null } } }),
    ]);

    return <IncidentReportsPage data={{ incidents, stats: { total, pending, parentNotified, acknowledged } }} />;
  }

  if (slug === "staff") {
    const staffWhere: Prisma.StaffProfileWhereInput = { centerId: scopedCenterIds, user: { role: UserRole.TEACHER, isActive: true } };
    const certificationWhere: Prisma.CertificationWhereInput = allCenters
      ? { staff: { user: { role: UserRole.TEACHER } }, expiresAt: { lte: thirtyDays } }
      : { staff: { centerId: scopedCenterIds, user: { role: UserRole.TEACHER } }, expiresAt: { lte: thirtyDays } };
    const staff = await prisma.staffProfile.findMany({
      where: staffWhere,
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 200,
      include: {
        user: { select: { name: true, email: true, role: true, isActive: true } },
        center: { select: { id: true, name: true, crmLocationId: true } },
        classroom: { select: { id: true, name: true } },
        certifications: { orderBy: { expiresAt: "asc" }, take: 4 },
      },
    });
    const classrooms = await prisma.classroom.findMany({
      where: { centerId: scopedCenterIds },
      orderBy: [{ centerId: "asc" }, { ageGroup: "asc" }, { name: "asc" }],
      take: 300,
      select: { id: true, centerId: true, name: true, ageGroup: true },
    });
    const schedules = await prisma.staffSchedule.findMany({
      where: { centerId: scopedCenterIds, startsAt: { gte: startOfDay } },
      orderBy: { startsAt: "asc" },
      take: 120,
      include: {
        staff: { select: { id: true, user: { select: { name: true } } } },
        center: { select: { name: true, crmLocationId: true } },
      },
    });
    const sortedStaff = staff.sort((left, right) => {
      const leftCenter = left.center.crmLocationId ?? left.center.name;
      const rightCenter = right.center.crmLocationId ?? right.center.name;
      return leftCenter.localeCompare(rightCenter) || left.user.name.localeCompare(right.user.name);
    });
    const total = sortedStaff.length;
    const activeUsers = sortedStaff.filter((profile) => profile.user.isActive).length;
    const expiringCerts = await prisma.certification.count({ where: certificationWhere });
    const backgroundPending = sortedStaff.filter((profile) => profile.backgroundCheckStatus !== "placeholder_clear").length;

    return (
      <StaffPage
        data={{
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          classrooms,
          schedules,
          staff: sortedStaff,
          stats: { total, activeUsers, expiringCerts, backgroundPending },
        }}
      />
    );
  }

  if (slug === "forms") {
    const submissionWhere: Prisma.FormSubmissionWhereInput = allCenters
      ? {}
      : visibleCenterIds.length
        ? { OR: visibleCenterIds.map((centerId) => ({ data: { path: ["centerId"], equals: centerId } })) }
        : { id: "__no_visible_submissions__" };
    const [forms, submissions] = await Promise.all([
      prisma.form.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 100,
        include: { _count: { select: { submissions: true } } },
      }),
      prisma.formSubmission.findMany({
        where: submissionWhere,
        orderBy: { submittedAt: "desc" },
        take: 100,
        include: { form: { select: { name: true, type: true } } },
      }),
    ]);

    return <FormsPage data={{ forms, submissions }} />;
  }

  if (slug === "documents") {
    const documentWhere: Prisma.DocumentWhereInput = allCenters
      ? {}
      : {
          OR: [
            { family: { is: { centerId: scopedCenterIds } } },
            { child: { is: { family: { is: { centerId: scopedCenterIds } } } } },
          ],
        };
    const [documents, total, expiring, restricted, pending] = await Promise.all([
      prisma.document.findMany({
        where: documentWhere,
        orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          family: { select: { name: true } },
          child: { select: { fullName: true, family: { select: { centerId: true } } } },
        },
      }),
      prisma.document.count({ where: documentWhere }),
      prisma.document.count({ where: { ...documentWhere, expiresAt: { lte: thirtyDays } } }),
      prisma.document.count({ where: { ...documentWhere, restricted: true } }),
      prisma.document.count({ where: { ...documentWhere, status: DocumentStatus.REQUESTED } }),
    ]);

    return <DocumentsPage data={{ documents, stats: { total, expiring, restricted, pending } }} />;
  }

  if (slug === "compliance") {
    const certificationWhere: Prisma.CertificationWhereInput = allCenters
      ? { expiresAt: { lte: thirtyDays } }
      : { staff: { centerId: scopedCenterIds }, expiresAt: { lte: thirtyDays } };
    const incidentWhere: Prisma.IncidentReportWhereInput = allCenters
      ? { adminReviewStatus: "pending" }
      : {
          adminReviewStatus: "pending",
          OR: [
            { classroom: { is: { centerId: scopedCenterIds } } },
            { child: { family: { is: { centerId: scopedCenterIds } } } },
          ],
        };
    const documentWhere: Prisma.DocumentWhereInput = allCenters
      ? { expiresAt: { lte: thirtyDays } }
      : {
          expiresAt: { lte: thirtyDays },
          OR: [
            { family: { is: { centerId: scopedCenterIds } } },
            { child: { is: { family: { is: { centerId: scopedCenterIds } } } } },
          ],
        };
    const allergyWhere: Prisma.AllergyWhereInput = allCenters
      ? {}
      : { child: { family: { is: { centerId: scopedCenterIds } } } };
    const medicalWhere: Prisma.ChildMedicalNoteWhereInput = allCenters
      ? { restricted: true }
      : { restricted: true, child: { family: { is: { centerId: scopedCenterIds } } } };

    const [pendingIncidents, expiringCertifications, expiringDocuments, allergyCount, restrictedMedicalNotes, certifications, allergies] = await Promise.all([
      prisma.incidentReport.count({ where: incidentWhere }),
      prisma.certification.count({ where: certificationWhere }),
      prisma.document.count({ where: documentWhere }),
      prisma.allergy.count({ where: allergyWhere }),
      prisma.childMedicalNote.count({ where: medicalWhere }),
      prisma.certification.findMany({
        where: certificationWhere,
        orderBy: { expiresAt: "asc" },
        take: 20,
        include: {
          staff: {
            select: {
              user: { select: { name: true } },
              center: { select: { name: true, crmLocationId: true } },
            },
          },
        },
      }),
      prisma.allergy.findMany({
        where: allergyWhere,
        orderBy: [{ severity: "desc" }, { allergen: "asc" }],
        take: 30,
        include: {
          child: { select: { fullName: true, family: { select: { centerId: true } } } },
        },
      }),
    ]);

    return (
      <CompliancePage
        data={{
          stats: { pendingIncidents, expiringCertifications, expiringDocuments, allergies: allergyCount, restrictedMedicalNotes },
          certifications,
          allergies,
        }}
      />
    );
  }

  return null;
}

export default async function SlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === "forgot-password" || slug === "onboarding") {
    return <AuthLikePage type={slug} />;
  }

  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) {
    redirect(`/login?next=/${encodeURIComponent(slug)}`);
  }
  if (user.mustResetPassword) {
    redirect(`/reset-password?force=1&next=/${encodeURIComponent(slug)}`);
  }

  if (!canAccessModule(user, slug)) {
    notFound();
  }

  const livePage = await renderLivePage(slug, user);
  if (livePage) {
    return <AppShell currentUser={user}>{livePage}</AppShell>;
  }

  const productModule = getModule(slug);

  if (!productModule) {
    notFound();
  }

  return (
    <AppShell currentUser={user}>
      <ModulePage module={productModule} />
    </AppShell>
  );
}
