import { notFound, redirect } from "next/navigation";
import { DocumentStatus, EnrollmentStage, PaymentStatus, Prisma } from "@prisma/client";
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
import { getKidCityFteSnapshot } from "@/lib/fte-reports";
import { prisma } from "@/lib/prisma";
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
      city: true,
      state: true,
      email: true,
      licensedCapacity: true,
      _count: {
        select: {
          leads: true,
          staff: true,
          classrooms: true,
        },
      },
    },
  });
}

async function renderLivePage(slug: string, user: CurrentUser) {
  const allCenters = user.role === "PLATFORM_OWNER";
  const tenantWide = canAccessAllCenters(user);
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

  if (slug === "multi-location-dashboard") {
    const [leads, highIntentLeads, upcomingTours, fte] = await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, score: { gte: 75 } } }),
      prisma.tour.count({ where: { centerId: scopedCenterIds, startsAt: { gte: today } } }),
      getKidCityFteSnapshot(centers),
    ]);

    return (
      <MultiLocationDashboardPage
        data={{
          centers,
          stats: {
            centers: centers.length,
            leads,
            highIntentLeads,
            upcomingTours,
            staff: centers.reduce((sum, center) => sum + center._count.staff, 0),
          },
          fte,
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
    const [families, total, withCustodyNotes, children, guardians] = await Promise.all([
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
    ]);

    return (
      <FamilyProfilesPage
        data={{
          families,
          importCenters: centers.map((center) => ({ id: center.id, name: center.crmLocationId ?? center.name })),
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
    const [children, total, enrolled, allergies, restrictedMedicalNotes] = await Promise.all([
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
    ]);

    return <ChildProfilesPage data={{ children, stats: { total, enrolled, allergies, restrictedMedicalNotes } }} />;
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
        guardians: { select: { fullName: true, email: true, phone: true } },
        children: {
          select: {
            id: true,
            fullName: true,
            ageGroup: true,
            enrollmentStatus: true,
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
    const [invoices, dailyReports, incidents, messages, documents, media] = await Promise.all([
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
    ]);

    const signedMedia = await signChildMediaRecords(media);
    return <ParentPortalWorkspace family={family} invoices={invoices} dailyReports={dailyReports} incidents={incidents} messages={messages} documents={documents} media={signedMedia} />;
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
    const settings = await prisma.whiteLabelSettings.findMany({
      where: { brand: { tenantId: user.tenantId } },
      orderBy: { brandName: "asc" },
      include: { brand: { select: { name: true, slug: true } } },
    });

    return <WhiteLabelPage data={{ settings }} />;
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

    const applicationFeeBps = Number.parseInt(process.env.STRIPE_APPLICATION_FEE_BPS || "0", 10);
    return (
      <BillingSettingsPage
        data={{
          products,
          tuitionPlans,
          subscriptions,
          centers: billingCenters,
          stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
          webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
          applicationFeeBps: Number.isFinite(applicationFeeBps) ? Math.max(0, Math.min(applicationFeeBps, 10_000)) : 0,
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
    const where = tenantWide
      ? { tenantId: user.tenantId }
      : { tenantId: user.tenantId, staffProfile: { centerId: scopedCenterIds } };
    const [users, roleCounts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 250,
        include: {
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
    const [organizations, users, leads] = await Promise.all([
      prisma.organization.count({
        where: tenantWide ? { tenantId: user.tenantId } : { id: user.organizationId ?? "__none__" },
      }),
      prisma.user.count({
        where: tenantWide
          ? { tenantId: user.tenantId }
          : { tenantId: user.tenantId, staffProfile: { centerId: scopedCenterIds } },
      }),
      prisma.lead.count({ where: leadWhere }),
    ]);

    return (
      <AgencyAdminPage
        data={{
          stats: {
            organizations,
            centers: centers.length,
            users,
            leads,
          },
          centers: centers.slice(0, 150),
        }}
      />
    );
  }

  if (slug === "integrations") {
    const env = (key: string) => Boolean(process.env[key]);
    return (
      <IntegrationsPage
        data={{
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
    const center = centers[0];
    const centerWhere = center ? { centerId: center.id } : { centerId: "__none__" };
    const [leads, highIntentLeads, staff, classrooms, toursUpcoming, openTasks, recentLeads] = await Promise.all([
      prisma.lead.count({ where: centerWhere }),
      prisma.lead.count({ where: { ...centerWhere, score: { gte: 75 } } }),
      center ? prisma.staffProfile.count({ where: { centerId: center.id } }) : 0,
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
    ]);

    return (
      <CenterDashboardPage
        data={{
          centerId: center?.id ?? null,
          centerName: center?.crmLocationId ?? center?.name ?? "No center assigned",
          place: [center?.city, center?.state].filter(Boolean).join(", "),
          stats: { leads, highIntentLeads, staff, classrooms, toursUpcoming, openTasks },
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
        _count: { select: { children: true, staff: true, dailyReports: true, incidents: true } },
      },
    });

    const demoMode = showExecutiveDemoData && classrooms.length === 0;

    return <ClassroomDashboardPage data={{ classrooms: demoMode ? executiveClassroomDemoRows : classrooms, demoMode }} />;
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
    const staffWhere: Prisma.StaffProfileWhereInput = { centerId: scopedCenterIds };
    const certificationWhere: Prisma.CertificationWhereInput = allCenters
      ? { expiresAt: { lte: thirtyDays } }
      : { staff: { centerId: scopedCenterIds }, expiresAt: { lte: thirtyDays } };
    const [staff, total, activeUsers, expiringCerts, backgroundPending] = await Promise.all([
      prisma.staffProfile.findMany({
        where: staffWhere,
        orderBy: [{ center: { state: "asc" } }, { user: { name: "asc" } }],
        take: 200,
        include: {
          user: { select: { name: true, email: true, role: true, isActive: true } },
          center: { select: { name: true, crmLocationId: true } },
          classroom: { select: { name: true } },
          certifications: { orderBy: { expiresAt: "asc" }, take: 4 },
        },
      }),
      prisma.staffProfile.count({ where: staffWhere }),
      prisma.staffProfile.count({ where: { ...staffWhere, user: { isActive: true } } }),
      prisma.certification.count({ where: certificationWhere }),
      prisma.staffProfile.count({
        where: {
          ...staffWhere,
          OR: [{ backgroundCheckStatus: null }, { backgroundCheckStatus: { not: "placeholder_clear" } }],
        },
      }),
    ]);

    return <StaffPage data={{ staff, stats: { total, activeUsers, expiringCerts, backgroundPending } }} />;
  }

  if (slug === "forms") {
    const [forms, submissions] = await Promise.all([
      prisma.form.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 100,
        include: { _count: { select: { submissions: true } } },
      }),
      prisma.formSubmission.findMany({
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

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/${encodeURIComponent(slug)}`);
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
