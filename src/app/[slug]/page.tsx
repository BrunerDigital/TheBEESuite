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
  CorporateBillingPage,
  DailyReportsPage,
  DeveloperDashboardPage,
  DocumentsPage,
  EnrollmentPipelinePage,
  FormsPage,
  FamilyProfilesPage,
  FteReportsPage,
  HelpPage,
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
  TeacherDocumentsPage,
  TerminalStorePage,
  ToursPage,
  WaitlistPage,
  WhiteLabelPage,
} from "@/components/live-ops-pages";
import type { FteReportPrefill, FteReportRow } from "@/components/fte-report-form";
import { AuthLikePage } from "@/components/module-page";
import { ParentPortalWorkspace } from "@/components/parent-portal-workspace";
import {
  SchoolSetupCommandCenter,
  type SchoolSetupCommandCenterData,
  type SchoolSetupStatus,
} from "@/components/school-setup-command-center";
import { TeacherMobileWorkspace } from "@/components/teacher-mobile-workspace";
import { modules } from "@/lib/demo-data";
import { canAccessAllCenters, canManageClassroomTasks, canManageOperations, canManageStaffCompensation, canViewDemoFallbackData, getCurrentUser, getLeadScopeWhere, requiresPasswordResetGate, type CurrentUser } from "@/lib/auth";
import { enrollmentStages, stageLabels } from "@/lib/crm";
import {
  executiveAnnouncementDemoRows,
  executiveClassroomDemoRows,
  executiveDailyReportDemoRows,
  executiveParentMessageDemoRows,
  executiveParentPortalDemo,
} from "@/lib/executive-demo-data";
import {
  currentlyEnrolledChildWhere,
  currentlyEnrolledStatusValues,
  isCurrentlyEnrolledChildRecord,
  isCurrentlyEnrolledStatus,
} from "@/lib/enrollment-status";
import { getFteDueState, startOfFteWeek } from "@/lib/fte-report-guardrails";
import { getKidCityFteSnapshot } from "@/lib/fte-reports";
import { parseGuardianChangeRequestNote } from "@/lib/guardian-change-requests";
import { buildIntegrationSetupViews, getIntegrationRuntimeStatus } from "@/lib/integration-setup";
import { expandCalendarEventOccurrences } from "@/lib/calendar-events";
import { complianceTaskNeedsReminder } from "@/lib/compliance-workflows";
import {
  getStripeCheckoutAmounts,
  getStripeCardProcessingRecoveryBps,
  getStripeCardProcessingRecoveryFixedCents,
  getStripeSecretKey,
  getStripePaymentMethodConfigurationId,
  getStripeWebhookSecret,
  isStripeParentProcessingRecoveryApproved,
  shouldWaiveStripePaymentOperationsFee,
} from "@/lib/integrations";
import { getKidCitySoftwareInvoiceSnapshot } from "@/lib/kidcity-software-billing";
import { buildGuardianKioskCredential, kioskPathForCenter } from "@/lib/kiosk-credentials";
import {
  activeStripeCheckoutPaymentSummary,
  isActiveStripeCheckoutPayment,
  jsonRecord,
} from "@/lib/billing-guardrails";
import { buildLedgerReconciliationReport } from "@/lib/billing-reconciliation";
import { dashboardOptionsFromCustomFields, mergeAgeGroupOptions } from "@/lib/dashboard-options";
import {
  normalizeBillingCadence,
  defaultRecurringBillingPeriod,
  normalizeRecurringBillingDay,
  normalizeRecurringBillingPeriod,
  shouldCreateRecurringTuitionInvoice,
  utcBillingWeekday,
} from "@/lib/billing-workflows";
import { defaultMessageTemplates, messageMergeFields, normalizeMergeFields, notificationPreferenceTypes } from "@/lib/message-templates";
import { signMessageAttachmentsFromMetadata } from "@/lib/message-attachments";
import { buildVisibleMessageWhere } from "@/lib/message-visibility";
import { extractFamilyTags } from "@/lib/message-segmentation";
import { normalizeSchoolOnboardingSetup, schoolOnboardingSetupSections, type SchoolOnboardingSetupInput } from "@/lib/onboarding-setup";
import { roleLabel } from "@/lib/notification-preferences";
import { resolveClassroomRatioRule } from "@/lib/classroom-ratios";
import { readCenterLicensingConfiguration } from "@/lib/licensing-config";
import { activeNotificationWhere } from "@/lib/notification-policy";
import { paymentDunningSummary } from "@/lib/payment-dunning";
import { paymentMethodManagementSummary } from "@/lib/payment-method-management";
import { invoicePurposeLabel } from "@/lib/product-billing";
import { readProfilePhotoStorageKey, readProfilePhotoUrl } from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
import { buildAnalyticsReportData, normalizeReportFilters } from "@/lib/reporting-analytics";
import { canAccessModule } from "@/lib/rbac";
import { deriveDirectorLaunchAutoCompletedIds } from "@/lib/setup-checklist-auto";
import { readCompletedSetupChecklistIds } from "@/lib/setup-checklists";
import { stripeCheckoutReadiness, stripeConnectReadinessFromFields } from "@/lib/stripe-connect-readiness";
import { terminalStoreCatalog } from "@/lib/terminal-store";
import { STUDENT_UNIFORM_SHIRT_PRODUCT_TYPES, studentUniformProductOptions } from "@/lib/uniform-products";
import { buildRequiredDocumentChecklist, summarizeRequiredDocumentChecklist } from "@/lib/required-document-checklist";
import {
  asRecord,
  cleanText,
  registrationReviewFromData,
  registrationSubmissionSummary,
  summarizeEnrollmentChecklist,
} from "@/lib/registration-packet";
import { registrationPaymentFromData } from "@/lib/registration-billing";
import { createProfilePhotoSignedUrl, isSupabaseStorageConfigured, signChildMediaRecords, signDocumentRecords } from "@/lib/supabase-storage";
import { centerServiceDayWindow, latestLogMap } from "@/lib/attendance-state";
import { readStaffClockState, readStaffClockSummary, readStaffKioskPinHash } from "@/lib/staff-kiosk";
import { uniqueSmsRecipients } from "@/lib/twilio-messaging";

export const dynamic = "force-dynamic";

async function signedProfilePhotoUrl(customFields: unknown) {
  const storageKey = readProfilePhotoStorageKey(customFields);
  if (storageKey && isSupabaseStorageConfigured()) {
    try {
      return await createProfilePhotoSignedUrl(storageKey);
    } catch {
      return readProfilePhotoUrl(customFields);
    }
  }
  return readProfilePhotoUrl(customFields);
}

export function generateStaticParams() {
  return [
    ...modules.map((module) => ({ slug: module.slug })),
    { slug: "forgot-password" },
    { slug: "parent-portal" },
  ];
}

function centerIdFilter(centerIds: string[]) {
  return centerIds.length ? { in: centerIds } : { in: ["__no_visible_centers__"] };
}

function notCurrentlyEnrolledChildWhere(): Prisma.ChildWhereInput {
  return { enrollmentStatus: { notIn: currentlyEnrolledStatusValues() } };
}

function visibleChildCenterWhere(scopedCenterIds: ReturnType<typeof centerIdFilter>): Prisma.ChildWhereInput {
  return {
    OR: [
      { classroom: { is: { centerId: scopedCenterIds } } },
      { family: { is: { centerId: scopedCenterIds } } },
    ],
  };
}

function visibleTeacherStaffWhere(scopedCenterIds: ReturnType<typeof centerIdFilter>): Prisma.StaffProfileWhereInput {
  return { centerId: scopedCenterIds, user: { role: UserRole.TEACHER } };
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
      postalCode: true,
      timezone: true,
      email: true,
      status: true,
      licensedCapacity: true,
      customFields: true,
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
          calendarEvents: true,
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

function recordFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayField(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function tuitionAssignmentFromCustomFields(customFields: unknown) {
  const fields = recordFromJson(customFields);
  const planId = stringField(fields.tuitionPlanId);
  return {
    enabled: fields.tuitionBillingEnabled === true,
    tuitionPlanId: planId,
    tuitionPlanName: stringField(fields.tuitionPlanName),
    cadence: stringField(fields.tuitionBillingCadence) || stringField(fields.tuitionPlanCadence),
    amountCents: numberField(fields.tuitionPlanAmountCents),
    billingDay: numberField(fields.tuitionBillingDay),
    startsPeriod: stringField(fields.tuitionBillingStartsPeriod),
    description: stringField(fields.tuitionBillingDescription),
  };
}

function readSchoolSetupFromCustomFields(customFields: unknown) {
  const fields = recordFromJson(customFields);
  const rawSetup = recordFromJson(fields.schoolOnboardingSetup);
  const rawSections = recordFromJson(rawSetup.sections);
  const input = Object.fromEntries(
    schoolOnboardingSetupSections.map((section) => {
      const storedSection = recordFromJson(rawSections[section.storageKey]);
      return [section.field, stringField(storedSection.value) ?? ""];
    }),
  ) as SchoolOnboardingSetupInput;

  return {
    setup: normalizeSchoolOnboardingSetup(input),
    capturedAt: stringField(rawSetup.capturedAt),
  };
}

function setupGroupForField(field: string) {
  if (field === "schoolProfileSetup" || field === "classroomSetup" || field === "programSetup") {
    return "School profile";
  }
  if (field === "staffSetup" || field === "familyImportSetup" || field === "parentPortalSetup") {
    return "People and access";
  }
  if (field === "tuitionRateSetup" || field === "subsidyRules" || field === "balanceRules" || field === "invoiceRules") {
    return "Billing and payments";
  }
  if (field === "communicationSetup" || field === "formsDocumentsSetup" || field === "licensingSetup" || field === "fteReportingSetup") {
    return "Operations and compliance";
  }
  return "Launch systems";
}

function setupActionLabel(field: string) {
  const labels: Record<string, string> = {
    schoolProfileSetup: "Open center dashboard",
    classroomSetup: "Open classrooms",
    programSetup: "Open calendar",
    staffSetup: "Open teachers",
    familyImportSetup: "Open families",
    tuitionRateSetup: "Open billing settings",
    subsidyRules: "Open billing",
    balanceRules: "Open invoices",
    invoiceRules: "Open payments",
    parentPortalSetup: "Open parent portal",
    communicationSetup: "Open messages",
    formsDocumentsSetup: "Open forms",
    licensingSetup: "Open compliance",
    fteReportingSetup: "Open FTE reports",
    integrationSetup: "Open integrations",
    launchSmokeTestSetup: "Open dashboard",
  };
  return labels[field] ?? "Open feature";
}

const teacherDocumentKeywords = [
  "allergy",
  "medical",
  "medication",
  "action plan",
  "care plan",
  "emergency",
  "immunization",
  "health",
  "physical",
  "authorization",
  "permission",
  "pickup",
  "contact",
  "feeding",
  "nap",
  "toilet",
  "potty",
];

const teacherBlockedDocumentKeywords = [
  "billing",
  "invoice",
  "payment",
  "tuition",
  "ledger",
  "tax",
  "staff",
  "employee",
  "background",
  "payroll",
  "bank",
  "stripe",
  "custody order",
  "court order",
  "legal",
];

function teacherCanViewDocument(document: { name: string; type: string; restricted: boolean }) {
  const haystack = `${document.name} ${document.type}`.toLowerCase();
  if (teacherBlockedDocumentKeywords.some((keyword) => haystack.includes(keyword))) return false;
  const isTeacherRelevant = teacherDocumentKeywords.some((keyword) => haystack.includes(keyword));
  return isTeacherRelevant || !document.restricted;
}

function setupStatus(recordReady: boolean, value: string): SchoolSetupStatus {
  if (recordReady) return "complete";
  return value.trim() ? "in_progress" : "missing";
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeAuthNextPath(value: string | string[] | undefined) {
  const path = firstSearchParam(value) || "";
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) return "";
  return path;
}

function formatSavedAt(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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
  sourceMetadata?: unknown;
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
    payrollPercent: numberField(recordFromJson(report.sourceMetadata).payrollPercent),
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

function activeEnrollmentStatus(value: string) {
  return isCurrentlyEnrolledStatus(value);
}

function ageBucket(ageGroup: string) {
  const value = ageGroup.toLowerCase();
  if (value.includes("infant")) return "infants" as const;
  if (value.includes("toddler")) return "toddlers" as const;
  if (value.includes("two") || value.includes("2")) return "twos" as const;
  if (value.includes("pre-k") || value.includes("prek") || value.includes("vpk")) return "preK" as const;
  if (value.includes("school") || value.includes("after")) return "schoolAge" as const;
  return "preschool" as const;
}

function childScheduleClassification(input: { schedule: unknown; customFields: unknown }) {
  const schedule = recordFromJson(input.schedule);
  const customFields = recordFromJson(input.customFields);
  const days = [
    ...stringArrayField(schedule.days),
    ...stringArrayField(schedule.scheduleDays),
    ...stringArrayField(customFields.days),
    ...stringArrayField(customFields.scheduleDays),
  ];
  const explicit = String(customFields.careScheduleType || customFields.fteScheduleType || customFields.fullTimePartTime || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (["full_time", "fulltime", "full"].includes(explicit)) return "full_time" as const;
  if (["part_time", "parttime", "part"].includes(explicit)) return "part_time" as const;

  if (days.length >= 5) return "full_time" as const;
  if (days.length > 0 && days.length <= 3) return "part_time" as const;

  const text = JSON.stringify({ schedule, customFields }).toLowerCase();
  if (/\b(part|part-time|half|half-day|2 day|two day|3 day|three day|mwf)\b/.test(text)) return "part_time" as const;
  if (/\b(full|full-time|5 day|five day|mon-fri|monday-friday|monday through friday)\b/.test(text)) return "full_time" as const;
  return "unknown" as const;
}

async function buildFtePrefills(
  centers: Array<{ id: string; licensedCapacity: number }>,
): Promise<FteReportPrefill[]> {
  const centerIds = centers.map((center) => center.id);
  if (!centerIds.length) return [];

  const children = await prisma.child.findMany({
    where: {
      AND: [
        currentlyEnrolledChildWhere(),
        {
          OR: [
            { family: { is: { centerId: centerIdFilter(centerIds) } } },
            { classroom: { is: { centerId: centerIdFilter(centerIds) } } },
          ],
        },
      ],
    },
    select: {
      ageGroup: true,
      enrollmentStatus: true,
      schedule: true,
      customFields: true,
      family: { select: { centerId: true } },
      classroom: { select: { centerId: true } },
    },
  });

  const byCenter = new Map(centers.map((center) => [center.id, {
    centerId: center.id,
    licensedCapacity: center.licensedCapacity,
    enrolledCount: 0,
    fullTimeCount: 0,
    partTimeCount: 0,
    unknownScheduleCount: 0,
    infants: 0,
    toddlers: 0,
    twos: 0,
    preschool: 0,
    preK: 0,
    schoolAge: 0,
    generatedAt: new Date().toISOString(),
    sourceLabel: "Current active child records",
  } satisfies FteReportPrefill]));

  for (const child of children) {
    if (!activeEnrollmentStatus(child.enrollmentStatus)) continue;
    const centerId = child.classroom?.centerId ?? child.family.centerId;
    if (!centerId) continue;
    const row = byCenter.get(centerId);
    if (!row) continue;
    row.enrolledCount += 1;
    row[ageBucket(child.ageGroup)] += 1;
    const classification = childScheduleClassification({ schedule: child.schedule, customFields: child.customFields });
    if (classification === "full_time") row.fullTimeCount = (row.fullTimeCount ?? 0) + 1;
    else if (classification === "part_time") row.partTimeCount = (row.partTimeCount ?? 0) + 1;
    else row.unknownScheduleCount += 1;
  }

  return Array.from(byCenter.values()).map((row) => ({
    ...row,
    fullTimeCount: row.fullTimeCount || row.unknownScheduleCount ? row.fullTimeCount : null,
    partTimeCount: row.partTimeCount || row.unknownScheduleCount ? row.partTimeCount : null,
  }));
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

async function renderLivePage(
  slug: string,
  user: CurrentUser,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const tenantWide = canAccessAllCenters(user);
  const allCenters = tenantWide;
  const showDemoFallbackData = canViewDemoFallbackData(user);
  const centers = await getVisibleCenters(user);
  const visibleCenterIds = centers.map((center) => center.id);
  const scopedCenterIds = centerIdFilter(visibleCenterIds);
  const leadWhere: Prisma.LeadWhereInput = { centerId: scopedCenterIds, status: { notIn: ["closed", "merged"] } };
  const today = new Date();
  const thirtyDays = new Date(today);
  thirtyDays.setDate(today.getDate() + 30);
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  const fteDueState = getFteDueState(today);
  const notificationPreferenceRoleOptions = Object.values(UserRole).map((role) => ({ role, label: roleLabel(role) }));
  const notificationPreferenceUserWhere: Prisma.UserWhereInput = {
    tenantId: user.tenantId,
    isActive: true,
    ...(allCenters
      ? {}
      : {
          OR: [
            { id: user.id },
            { staffProfile: { centerId: scopedCenterIds } },
            { accessGrants: { some: { isActive: true, centerId: scopedCenterIds } } },
            { guardians: { some: { family: { centerId: scopedCenterIds } } } },
          ],
        }),
  };
  const setupChecklistUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { customFields: true },
  });

  if (slug === "school-setup") {
    const selectedCenter = centers.find((center) => center.id === user.primaryCenterId) ?? centers[0] ?? null;
    const schoolSetup = selectedCenter ? readSchoolSetupFromCustomFields(selectedCenter.customFields) : {
      setup: normalizeSchoolOnboardingSetup({}),
      capturedAt: null,
    };
    const [
      familyCount,
      childCount,
      guardianCount,
      guardianLoginCount,
      staffCount,
      staffScheduleCount,
      tuitionPlanCount,
      productCount,
      billingAccountCount,
      invoiceCount,
      documentCount,
      formCount,
      fteReportCount,
      integrationCount,
      readyIntegrationCount,
      procareImportCount,
      messageTemplateCount,
    ] = selectedCenter ? await Promise.all([
      prisma.family.count({ where: { centerId: selectedCenter.id, children: { some: currentlyEnrolledChildWhere() } } }),
      prisma.child.count({ where: { ...currentlyEnrolledChildWhere(), family: { centerId: selectedCenter.id } } }),
      prisma.guardian.count({ where: { family: { centerId: selectedCenter.id, children: { some: currentlyEnrolledChildWhere() } } } }),
      prisma.guardian.count({ where: { family: { centerId: selectedCenter.id, children: { some: currentlyEnrolledChildWhere() } }, userId: { not: null } } }),
      prisma.staffProfile.count({ where: { centerId: selectedCenter.id } }),
      prisma.staffSchedule.count({ where: { centerId: selectedCenter.id } }),
      prisma.tuitionPlan.count(),
      prisma.product.count(),
      prisma.billingAccount.count({ where: { family: { centerId: selectedCenter.id } } }),
      prisma.invoice.count({ where: { billingAccount: { family: { centerId: selectedCenter.id } } } }),
      prisma.document.count({
        where: {
          OR: [
            { family: { centerId: selectedCenter.id } },
            { child: { family: { centerId: selectedCenter.id } } },
          ],
        },
      }),
      prisma.form.count({ where: { status: "active" } }),
      prisma.fteReport.count({ where: { centerId: selectedCenter.id } }),
      prisma.integration.count({ where: { tenantId: user.tenantId } }),
      prisma.integration.count({
        where: {
          tenantId: user.tenantId,
          status: { in: ["verified", "connected", "ready_to_install", "platform_managed"] },
        },
      }),
      prisma.procareImportBatch.count({ where: { centerId: selectedCenter.id } }),
      prisma.messageTemplate.count({ where: { centerId: selectedCenter.id } }),
    ]) : Array(17).fill(0) as number[];

    const licensingConfiguration = selectedCenter
      ? readCenterLicensingConfiguration(selectedCenter.customFields, {
          centerState: selectedCenter.state,
          licensedCapacity: selectedCenter.licensedCapacity,
        })
      : null;
    const setupValue = (storageKey: keyof typeof schoolSetup.setup.sections) =>
      schoolSetup.setup.sections[storageKey]?.value ?? "";
    const manualComplete = (storageKey: keyof typeof schoolSetup.setup.sections) => setupValue(storageKey).trim().length > 0;
    const classroomCount = selectedCenter?._count.classrooms ?? 0;
    const leadCount = selectedCenter?._count.leads ?? 0;
    const readyData: Record<string, {
      recordReady: boolean;
      evidence: string;
      metrics: string[];
      requiredActions: string[];
    }> = {
      schoolProfileSetup: {
        recordReady: Boolean(selectedCenter?.email && selectedCenter?.state && selectedCenter.licensedCapacity > 0 && manualComplete("schoolProfile")),
        evidence: selectedCenter
          ? `${selectedCenter.status} school record · ${selectedCenter.licensedCapacity} licensed capacity · ${selectedCenter.email || "missing email"}`
          : "No school record is visible for this login.",
        metrics: [
          `Status: ${selectedCenter?.status ?? "No school"}`,
          `Licensed capacity: ${selectedCenter?.licensedCapacity ?? 0}`,
          `Contact email: ${selectedCenter?.email ?? "Missing"}`,
        ],
        requiredActions: ["Confirm school contact details, operating hours, timezone, launch owner, and target go-live date."],
      },
      classroomSetup: {
        recordReady: classroomCount > 0 && Boolean(selectedCenter?.licensedCapacity),
        evidence: `${classroomCount} classroom records · ${selectedCenter?.licensedCapacity ?? 0} licensed capacity`,
        metrics: [`Classrooms: ${classroomCount}`, `Licensed capacity: ${selectedCenter?.licensedCapacity ?? 0}`],
        requiredActions: ["Create every classroom with age group, capacity, and ratio rule before attendance, daily reports, and staffing go live."],
      },
      programSetup: {
        recordReady: manualComplete("programs"),
        evidence: manualComplete("programs") ? "Director program notes captured." : "Program names, hours, holidays, and schedule rules still need director input.",
        metrics: [`Classrooms available: ${classroomCount}`, `Calendar route: ready for events`],
        requiredActions: ["Provide program names, age groups, operating schedules, holiday closures, and after-school/VPK rules."],
      },
      staffSetup: {
        recordReady: staffCount > 0 && staffScheduleCount > 0,
        evidence: `${staffCount} staff profiles · ${staffScheduleCount} staff schedule rows`,
        metrics: [`Staff profiles: ${staffCount}`, `Schedules: ${staffScheduleCount}`],
        requiredActions: ["Add teachers and staff, assign classrooms, confirm schedules, background checks, credentials, and time clock rules."],
      },
      familyImportSetup: {
        recordReady: familyCount > 0 && childCount > 0 && guardianCount > 0,
        evidence: `${familyCount} families · ${childCount} children · ${guardianCount} guardians · ${procareImportCount} Procare imports`,
        metrics: [`Families: ${familyCount}`, `Children: ${childCount}`, `Guardians: ${guardianCount}`],
        requiredActions: ["Import unencrypted Procare exports and review family, guardian, child, emergency contact, allergy, schedule, and classroom mappings."],
      },
      tuitionRateSetup: {
        recordReady: tuitionPlanCount > 0 || productCount > 0,
        evidence: `${tuitionPlanCount} tuition plans · ${productCount} billing products`,
        metrics: [`Tuition plans: ${tuitionPlanCount}`, `Products/fees: ${productCount}`],
        requiredActions: ["Load tuition by age/program/cadence, registration fees, deposits, sibling discounts, late fees, and other charges."],
      },
      subsidyRules: {
        recordReady: manualComplete("subsidyRules"),
        evidence: manualComplete("subsidyRules") ? "Subsidy rules captured." : "Subsidy and copay handling still needs director/billing input.",
        metrics: [`Billing accounts: ${billingAccountCount}`, `Invoices: ${invoiceCount}`],
        requiredActions: ["Document subsidy programs, parent copays, agency billing cadence, and how subsidy balances are communicated."],
      },
      balanceRules: {
        recordReady: billingAccountCount > 0 && manualComplete("balanceRules"),
        evidence: `${billingAccountCount} billing accounts · ${invoiceCount} invoices`,
        metrics: [`Billing accounts: ${billingAccountCount}`, `Opening invoices: ${invoiceCount}`],
        requiredActions: ["Confirm opening balance cutover date, credits, refunds, ledger adjustments, and imported balances."],
      },
      invoiceRules: {
        recordReady: invoiceCount > 0 && manualComplete("invoiceRules"),
        evidence: `${invoiceCount} invoices · payment policy ${manualComplete("invoiceRules") ? "captured" : "missing"}`,
        metrics: [`Invoices: ${invoiceCount}`, `Payment policy: ${manualComplete("invoiceRules") ? "Captured" : "Missing"}`],
        requiredActions: ["Confirm invoice cadence, due dates, late fee policy, ACH/card options, autopay expectations, and disclosures."],
      },
      parentPortalSetup: {
        recordReady: guardianLoginCount > 0,
        evidence: `${guardianLoginCount} guardians linked to login accounts out of ${guardianCount} guardians`,
        metrics: [`Guardian logins: ${guardianLoginCount}`, `Guardians: ${guardianCount}`],
        requiredActions: ["Choose which guardians receive parent portal invites and collect missing parent emails before launch."],
      },
      communicationSetup: {
        recordReady: messageTemplateCount > 0 && manualComplete("communications"),
        evidence: `${messageTemplateCount} center message templates · communication policy ${manualComplete("communications") ? "captured" : "missing"}`,
        metrics: [`Message templates: ${messageTemplateCount}`, `Leads needing communication: ${leadCount}`],
        requiredActions: ["Confirm message templates, announcement approval rules, notification preferences, SMS/email sender identity, and response ownership."],
      },
      formsDocumentsSetup: {
        recordReady: formCount > 0 && documentCount > 0,
        evidence: `${formCount} active forms · ${documentCount} school-linked documents`,
        metrics: [`Forms: ${formCount}`, `Documents: ${documentCount}`],
        requiredActions: ["Load final registration packets, parent policies, medical/allergy forms, media releases, and staff onboarding forms."],
      },
      licensingSetup: {
        recordReady: licensingConfiguration?.status === "ready_for_review",
        evidence: licensingConfiguration
          ? `${licensingConfiguration.completedFields.length} licensing fields captured · ${licensingConfiguration.missingFields.length} missing`
          : "No licensing configuration is visible.",
        metrics: [
          `State: ${selectedCenter?.state ?? "Missing"}`,
          `Completed fields: ${licensingConfiguration?.completedFields.length ?? 0}`,
          `Missing fields: ${licensingConfiguration?.missingFields.length ?? 0}`,
        ],
        requiredActions: ["Confirm license number, agency, drill cadence, inspection/renewal dates, medication rules, and document retention requirements."],
      },
      fteReportingSetup: {
        recordReady: fteReportCount > 0 && manualComplete("fteReporting"),
        evidence: `${fteReportCount} FTE reports · FTE process ${manualComplete("fteReporting") ? "captured" : "missing"}`,
        metrics: [`FTE reports: ${fteReportCount}`, `Current FTE status: ${fteDueState.label}`],
        requiredActions: ["Confirm FTE submission owner, weekly due date, correction workflow, attendance cutoff, and export cadence."],
      },
      integrationSetup: {
        recordReady: integrationCount > 0 && readyIntegrationCount > 0 && manualComplete("integrations"),
        evidence: `${readyIntegrationCount} ready integrations out of ${integrationCount} setup records`,
        metrics: [`Integration records: ${integrationCount}`, `Ready integrations: ${readyIntegrationCount}`],
        requiredActions: ["Connect or verify payout processing, email sender/domain, SMS sender, Google Sheets/Calendar, storage, and signature provider accounts."],
      },
      launchSmokeTestSetup: {
        recordReady: manualComplete("launchSmokeTest"),
        evidence: manualComplete("launchSmokeTest") ? "Director launch smoke test notes captured." : "Role-by-role launch smoke test still needs sign-off.",
        metrics: [`Ready integrations: ${readyIntegrationCount}`, `Ready setup sections: ${schoolSetup.setup.completedSections.length}`],
        requiredActions: ["Run director, teacher, parent, billing, kiosk, document, payment, notification, and reporting smoke tests before launch."],
      },
    };

    const sections = schoolOnboardingSetupSections.map((definition) => {
      const saved = schoolSetup.setup.sections[definition.storageKey];
      const readiness = readyData[definition.field] ?? {
        recordReady: saved.completed,
        evidence: saved.completed ? "Director setup input captured." : "Director setup input missing.",
        metrics: [],
        requiredActions: ["Provide director setup input."],
      };
      return {
        id: definition.storageKey,
        field: definition.field,
        group: setupGroupForField(definition.field),
        label: definition.label,
        owner: definition.owner,
        href: definition.href,
        description: definition.description,
        placeholder: definition.placeholder,
        value: saved.value,
        status: setupStatus(readiness.recordReady, saved.value),
        evidence: readiness.evidence,
        metrics: readiness.metrics,
        requiredActions: readiness.requiredActions,
        actionLabel: setupActionLabel(definition.field),
      };
    });
    const completedSections = sections.filter((section) => section.status === "complete").length;
    const blockingSections = sections.filter((section) => section.status === "missing").length;
    const progress = sections.length ? Math.round((completedSections / sections.length) * 100) : 0;
    const directorChecklistAutomaticCompletedIds = deriveDirectorLaunchAutoCompletedIds({
      centerCount: selectedCenter ? 1 : 0,
      schoolProfileReady: Boolean(selectedCenter?.email && selectedCenter?.state && selectedCenter.licensedCapacity > 0),
      classroomCount,
      teacherStaffCount: staffCount,
      importedFamilyCount: familyCount,
      importedChildCount: childCount,
      documentCount,
      tuitionPlanCount,
      productCount,
      billingAccountCount,
      invoiceCount,
      guardianLoginCount,
      messageTemplateCount,
      calendarEventCount: selectedCenter?._count.calendarEvents ?? 0,
      fteReportCount,
      licensingReady: licensingConfiguration?.status === "ready_for_review",
      leadCount,
      dashboardConfigured: true,
      payoutReady: selectedCenter ? stripeConnectReadinessFromFields(selectedCenter.customFields).status === "ready" : false,
    });
    const externalNeeds = [
      procareImportCount ? null : "Unencrypted Procare exports for each school: families, children, guardians, classrooms, balances, and staff.",
      tuitionPlanCount || productCount ? null : "Final tuition and fee sheet by program, age group, cadence, discounts, deposits, and late fees.",
      staffCount ? null : "Current staff roster with emails, titles, classroom assignments, schedules, certifications, and background-check status.",
      guardianLoginCount ? null : "Approved parent/guardian invite list and any missing parent email addresses.",
      readyIntegrationCount ? null : "External account credentials or admin access for payment processing, SendGrid/email domain, Twilio/SMS, Google Sheets/Calendar, storage, and signature provider setup.",
      formCount && documentCount ? null : "Final registration packet, policy acknowledgements, medical/allergy forms, media releases, and staff onboarding forms.",
      manualComplete("launchSmokeTest") ? null : "Target go-live date and the person who will sign off after the role-by-role school smoke test.",
    ].filter((item): item is string => Boolean(item));
    const data: SchoolSetupCommandCenterData = {
      centerId: selectedCenter?.id ?? null,
      centerLabel: selectedCenter ? formatCenterName(selectedCenter) : "No visible school",
      setupStatus: blockingSections ? "needs_director_input" : "ready_for_review",
      progress,
      completedSections,
      totalSections: sections.length,
      blockingSections,
      lastCapturedAt: formatSavedAt(schoolSetup.capturedAt),
      stats: [
        { label: "Classrooms", value: String(classroomCount), detail: `${selectedCenter?.licensedCapacity ?? 0} licensed capacity` },
        { label: "People imported", value: `${familyCount}/${childCount}/${guardianCount}`, detail: "Families / children / guardians" },
        { label: "Staff readiness", value: String(staffCount), detail: `${staffScheduleCount} schedule rows` },
        { label: "Billing records", value: String(billingAccountCount), detail: `${tuitionPlanCount} plans · ${invoiceCount} invoices` },
        { label: "Documents", value: String(documentCount), detail: `${formCount} active forms` },
        { label: "Integrations", value: `${readyIntegrationCount}/${integrationCount}`, detail: "Ready setup records" },
      ],
      sections,
      externalNeeds,
      directorChecklistCompletedIds: readCompletedSetupChecklistIds(setupChecklistUser?.customFields, "director_launch"),
      directorChecklistAutomaticCompletedIds,
    };

    return <SchoolSetupCommandCenter data={data} />;
  }

  if (slug === "multi-location-dashboard") {
    const [leads, highIntentLeads, upcomingTours, teacherCount, fte, fteReports, ftePrefills] = await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, score: { gte: 75 } } }),
      prisma.tour.count({ where: { centerId: scopedCenterIds, startsAt: { gte: today } } }),
      prisma.staffProfile.count({ where: { centerId: scopedCenterIds, user: { role: UserRole.TEACHER } } }),
      getKidCityFteSnapshot(centers),
      getFteReports(visibleCenterIds, 250),
      buildFtePrefills(centers),
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
          fteCenters: centers.map((center) => ({ id: center.id, name: formatCenterName(center), licensedCapacity: center.licensedCapacity })),
          ftePrefills,
          fteReports: fteReports.map(serializeFteReport),
        }}
      />
    );
  }

  if (slug === "fte-reports") {
    const [fteReports, fte, ftePrefills] = await Promise.all([
      getFteReports(visibleCenterIds, tenantWide ? 500 : 100),
      tenantWide ? getKidCityFteSnapshot(centers) : Promise.resolve(undefined),
      buildFtePrefills(centers),
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
            deadlineLabel: fteDueState.deadlineLabel,
            reminder: fteDueState.reminder,
          },
          trendWeeks: trend.trendWeeks,
          centerSnapshots: trend.centerSnapshots,
          fte,
          fteCenters: centers.map((center) => ({ id: center.id, name: formatCenterName(center), licensedCapacity: center.licensedCapacity })),
          ftePrefills,
          fteReports: fteReports.map(serializeFteReport),
          exportHref: "/api/fte-reports?format=csv",
        }}
      />
    );
  }

  if (slug === "enrollment-pipeline") {
    const registrationSubmissionWhere: Prisma.FormSubmissionWhereInput = allCenters
      ? { form: { type: "online_registration" } }
      : visibleCenterIds.length
        ? {
            form: { type: "online_registration" },
            OR: visibleCenterIds.map((centerId) => ({ data: { path: ["centerId"], equals: centerId } })),
          }
        : { id: "__no_visible_registration_submissions__" };
    const enrollmentWhere: Prisma.EnrollmentWhereInput = allCenters
      ? {}
      : { child: { is: { family: { is: { centerId: scopedCenterIds } } } } };
    const [pipelineCounts, highIntentCounts, recentLeads, applicationSubmissions, enrollmentRows] = await Promise.all([
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
      prisma.formSubmission.findMany({
        where: registrationSubmissionWhere,
        orderBy: { submittedAt: "desc" },
        take: 25,
        include: { form: { select: { type: true } } },
      }),
      prisma.enrollment.findMany({
        where: enrollmentWhere,
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          child: {
            select: {
              id: true,
              fullName: true,
              family: { select: { id: true, name: true, centerId: true } },
            },
          },
        },
      }),
    ]);
    const countByStage = new Map(pipelineCounts.map((item) => [item.stage, item._count._all]));
    const highByStage = new Map(highIntentCounts.map((item) => [item.stage, item._count._all]));
    const centerNameById = new Map(centers.map((center) => [center.id, center.crmLocationId ?? center.name]));

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
          applicationSubmissions: applicationSubmissions.map((submission) => {
            const record = asRecord(submission.data);
            return {
              id: submission.id,
              status: submission.status,
              reviewStatus: registrationReviewFromData(submission.data).status,
              registrationPayment: registrationPaymentFromData(submission.data),
              submittedAt: submission.submittedAt,
              summary: registrationSubmissionSummary(submission.data),
              childFullName: cleanText(record.childFullName) || "Child",
              guardianName: cleanText(record.primaryGuardianName) || "Parent/guardian",
              program: cleanText(record.program) || "Program not set",
              desiredStartDate: cleanText(record.desiredStartDate),
              centerName: cleanText(record.crmLocationId) || cleanText(record.centerName) || "School not set",
            };
          }),
          enrollmentChecklists: enrollmentRows.map((enrollment) => ({
            id: enrollment.id,
            childId: enrollment.child.id,
            familyId: enrollment.child.family.id,
            stage: enrollment.stage,
            desiredStartDate: enrollment.desiredStartDate,
            childName: enrollment.child.fullName,
            familyName: enrollment.child.family.name,
            centerName: enrollment.child.family.centerId ? centerNameById.get(enrollment.child.family.centerId) ?? null : null,
            summary: summarizeEnrollmentChecklist(enrollment.checklist),
          })),
        }}
      />
    );
  }

  if (slug === "tours") {
    const requestedTourSearch = firstSearchParam(searchParams.q) || "";
    const tourWhere: Prisma.TourWhereInput = {
      centerId: scopedCenterIds,
      ...(requestedTourSearch
        ? {
            OR: [
              { notes: { contains: requestedTourSearch, mode: "insensitive" } },
              {
                lead: {
                  is: {
                    OR: [
                      { familyName: { contains: requestedTourSearch, mode: "insensitive" } },
                      { childName: { contains: requestedTourSearch, mode: "insensitive" } },
                      { email: { contains: requestedTourSearch, mode: "insensitive" } },
                      { phone: { contains: requestedTourSearch, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
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
    const calendarCenterScope: Prisma.CalendarEventWhereInput = canAccessAllCenters(user)
      ? { OR: [{ centerId: scopedCenterIds }, { centerId: null }] }
      : { centerId: scopedCenterIds };
    const [calendarTours, staffSchedules, invoices, expiringDocs, enrollmentStarts, birthdayChildren, savedCalendarEvents, calendarIntegration, calendarCredentials] = await Promise.all([
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
          family: { select: { name: true, centerId: true, custodyNotes: true } },
          child: { select: { fullName: true, family: { select: { centerId: true } }, classroom: { select: { name: true } } } },
        },
      }),
      prisma.child.findMany({
        where: { ...currentlyEnrolledChildWhere(), startDate: { gte: startOfDay, lte: sixtyDays }, family: { is: { centerId: scopedCenterIds } } },
        orderBy: { startDate: "asc" },
        take: 150,
        include: { family: { select: { name: true, centerId: true } }, classroom: { select: { name: true } } },
      }),
      prisma.child.findMany({
        where: { ...currentlyEnrolledChildWhere(), family: { is: { centerId: scopedCenterIds } } },
        orderBy: { fullName: "asc" },
        take: 400,
        include: { family: { select: { name: true, centerId: true } }, classroom: { select: { name: true } } },
      }),
      prisma.calendarEvent.findMany({
        where: {
          tenantId: user.tenantId,
          startsAt: { lte: sixtyDays },
          AND: [
            calendarCenterScope,
            {
              OR: [
                { endsAt: { gte: startOfDay } },
                { endsAt: null, startsAt: { gte: startOfDay } },
                { recurrenceRule: { not: null } },
              ],
            },
          ],
        },
        orderBy: { startsAt: "asc" },
        take: 300,
        include: {
          center: { select: { id: true, name: true, crmLocationId: true } },
        },
      }),
      prisma.integration.findFirst({
        where: { tenantId: user.tenantId, provider: "google_calendar" },
        select: { status: true, lastSyncAt: true },
      }),
      prisma.integrationCredential.findMany({
        where: { tenantId: user.tenantId, provider: "google_calendar" },
        select: { key: true },
      }),
    ]);
    const savedEventOccurrences = expandCalendarEventOccurrences(savedCalendarEvents, startOfDay, sixtyDays).map((occurrence) => {
      const event = occurrence.event;
      return {
        id: `calendar:${occurrence.occurrenceId}`,
        type: event.eventType,
        title: event.title,
        startsAt: occurrence.startsAt.toISOString(),
        endsAt: occurrence.endsAt?.toISOString() ?? null,
        centerId: event.centerId,
        centerName: event.center?.crmLocationId ?? event.center?.name ?? centerName(event.centerId),
        classroomName: null,
        status: event.status,
        detail: [
          event.source === "google" ? "Google Calendar" : "School calendar",
          occurrence.isRecurringOccurrence ? "recurring occurrence" : "",
          event.closureReason ?? "",
        ].filter(Boolean).join(" · "),
        allDay: event.allDay,
        recurrenceRule: event.recurrenceRule,
        visibility: event.visibility,
        syncStatus: event.googleSyncStatus,
        source: event.source,
      };
    });
    const googleRuntime = getIntegrationRuntimeStatus("google_calendar", process.env, calendarCredentials.map((credential) => credential.key));

    const events = [
      ...savedEventOccurrences,
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
        allDay: false,
        recurrenceRule: null,
        visibility: "staff",
        syncStatus: null,
        source: "system",
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
        allDay: false,
        recurrenceRule: null,
        visibility: "staff",
        syncStatus: null,
        source: "system",
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
        allDay: true,
        recurrenceRule: null,
        visibility: "staff",
        syncStatus: null,
        source: "system",
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
          allDay: true,
          recurrenceRule: null,
          visibility: "staff",
          syncStatus: null,
          source: "system",
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
        allDay: true,
        recurrenceRule: null,
        visibility: "staff",
        syncStatus: null,
        source: "system",
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
          allDay: true,
          recurrenceRule: null,
          visibility: "staff",
          syncStatus: null,
          source: "system",
        })),
    ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));

    return (
      <CalendarPage
        data={{
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          events,
          generatedAt: today.toISOString(),
          canManageCalendar: canManageOperations(user),
          googleCalendar: {
            configured: googleRuntime.configured,
            status: googleRuntime.status,
            lastSyncAt: calendarIntegration?.lastSyncAt ? calendarIntegration.lastSyncAt.toISOString() : null,
            missingRequirements: googleRuntime.missingRequirements,
          },
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
    const requestedFamilyId = firstSearchParam(searchParams.familyId) || "";
    const familyWhere: Prisma.FamilyWhereInput = { centerId: scopedCenterIds };
    const currentChildWhere = currentlyEnrolledChildWhere();
    const graduatedChildWhere = notCurrentlyEnrolledChildWhere();
    const currentFamilyWhere: Prisma.FamilyWhereInput = { ...familyWhere, children: { some: currentChildWhere } };
    const graduatedFamilyWhere: Prisma.FamilyWhereInput = {
      AND: [
        familyWhere,
        { children: { none: currentChildWhere } },
        { children: { some: graduatedChildWhere } },
      ],
    };
    const familyInclude = {
      guardians: { orderBy: { fullName: "asc" } },
      children: {
        orderBy: { fullName: "asc" },
        include: {
          allergies: { orderBy: { allergen: "asc" } },
          medicalNotes: { orderBy: { createdAt: "desc" } },
          documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] },
        },
      },
      pickups: { orderBy: { fullName: "asc" } },
      emergencyContacts: { orderBy: { fullName: "asc" } },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          autopayPlaceholder: true,
          customFields: true,
        },
      },
      documents: { where: { childId: null }, orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] },
      notesList: {
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true, email: true } } },
      },
      _count: { select: { documents: true, messages: true, pickups: true, emergencyContacts: true } },
    } satisfies Prisma.FamilyInclude;
    const [families, allFamilies, total, withCustodyNotes, children, guardians, graduated, graduatedFamilies, intakeCenters, requestNotes] = await Promise.all([
      prisma.family.findMany({
        where: currentFamilyWhere,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: familyInclude,
      }),
      prisma.family.findMany({
        where: familyWhere,
        orderBy: { createdAt: "desc" },
        take: 250,
        include: familyInclude,
      }),
      prisma.family.count({ where: currentFamilyWhere }),
      prisma.family.count({ where: { ...currentFamilyWhere, custodyNotes: { not: null } } }),
      prisma.child.count({ where: { ...currentChildWhere, family: { is: { centerId: scopedCenterIds } } } }),
      prisma.guardian.count({ where: { family: { is: currentFamilyWhere } } }),
      prisma.child.count({ where: { ...graduatedChildWhere, family: { is: { centerId: scopedCenterIds } } } }),
      prisma.family.count({ where: graduatedFamilyWhere }),
      getFamilyIntakeCenters(user),
      prisma.note.findMany({
        where: {
          family: { is: currentFamilyWhere },
          restricted: true,
          body: { contains: " request:" },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          family: { select: { id: true, name: true, centerId: true } },
          user: { select: { name: true, email: true } },
        },
      }),
    ]);
    const requestedFamily = requestedFamilyId && !allFamilies.some((family) => family.id === requestedFamilyId)
      ? await prisma.family.findFirst({
          where: { AND: [familyWhere, { id: requestedFamilyId }] },
          include: familyInclude,
        })
      : null;
    const allFamiliesWithRequested = requestedFamily
      ? [requestedFamily, ...allFamilies.filter((family) => family.id !== requestedFamily.id)]
      : allFamilies;
    const familiesWithRequested = requestedFamily && requestedFamily.children.some((child) => isCurrentlyEnrolledChildRecord(child))
      ? [requestedFamily, ...families.filter((family) => family.id !== requestedFamily.id)]
      : families;
    const guardianChangeRequests = requestNotes.flatMap((note) => {
      const parsed = parseGuardianChangeRequestNote(note.body);
      if (!parsed || !note.family) return [];
      return [{
        id: note.id,
        familyId: note.family.id,
        familyName: note.family.name,
        requestType: parsed.requestType,
        details: parsed.details,
        status: parsed.status,
        submittedBy: note.user?.name ?? note.user?.email ?? "Parent/guardian",
        createdAt: note.createdAt,
      }];
    });
    const centerNameById = new Map(centers.map((center) => [center.id, formatCenterName(center)]));
    function serializeFamilyForClient(family: (typeof allFamilies)[number], options: { currentChildrenOnly: boolean }) {
      return {
        ...family,
        centerName: family.centerId ? centerNameById.get(family.centerId) ?? null : null,
        children: options.currentChildrenOnly
          ? family.children.filter((child) => isCurrentlyEnrolledChildRecord(child))
          : family.children,
        billingAccount: family.billingAccount
          ? {
              id: family.billingAccount.id,
              balanceCents: family.billingAccount.balanceCents,
              autopayPlaceholder: family.billingAccount.autopayPlaceholder,
              paymentMethodManagement: paymentMethodManagementSummary({
                autopayPlaceholder: family.billingAccount.autopayPlaceholder,
                customFields: family.billingAccount.customFields,
              }),
            }
          : null,
        guardians: family.guardians.map((guardian) => {
          const credential = buildGuardianKioskCredential({
            id: guardian.id,
            fullName: guardian.fullName,
            checkInPinSetAt: guardian.checkInPinSetAt,
            checkInPinHash: guardian.checkInPinHash,
            family: {
              id: family.id,
              name: family.name,
              centerId: family.centerId,
              centerName: family.centerId ? centerNameById.get(family.centerId) ?? null : null,
            },
          });
          const safeGuardian = { ...guardian };
          delete (safeGuardian as { checkInPinHash?: string | null }).checkInPinHash;
          return {
            ...safeGuardian,
            qrToken: credential.qrToken,
            kioskPath: credential.kioskPath,
            centerName: credential.centerName,
          };
        }),
      };
    }
    const familiesForClient = familiesWithRequested.map((family) => serializeFamilyForClient(family, { currentChildrenOnly: true }));
    const allFamiliesForClient = allFamiliesWithRequested.map((family) => serializeFamilyForClient(family, { currentChildrenOnly: false }));
    const familyAgeGroups = mergeAgeGroupOptions(
      centers.map((center) => dashboardOptionsFromCustomFields(center.customFields).ageGroups),
      allFamiliesWithRequested.flatMap((family) => family.children.map((child) => child.ageGroup)),
      intakeCenters.flatMap((center) => center.classrooms.map((classroom) => classroom.ageGroup)),
    );

    return (
      <FamilyProfilesPage
        data={{
          families: familiesForClient,
          allFamilies: allFamiliesForClient,
          importCenters: centers.map((center) => ({ id: center.id, name: center.crmLocationId ?? center.name })),
          bulkImportEnabled: tenantWide || allCenters,
          intakeCenters,
          ageGroups: familyAgeGroups,
          guardianChangeRequests,
          stats: { total, withCustodyNotes, children, guardians, graduated, graduatedFamilies },
        }}
      />
    );
  }

  if (slug === "child-profile") {
    const childWhere: Prisma.ChildWhereInput = allCenters ? {} : visibleChildCenterWhere(scopedCenterIds);
    const currentChildWhere: Prisma.ChildWhereInput = { AND: [childWhere, currentlyEnrolledChildWhere()] };
    const graduatedChildWhere: Prisma.ChildWhereInput = { AND: [childWhere, notCurrentlyEnrolledChildWhere()] };
    const currentChildRelationWhere: Prisma.ChildWhereInput = allCenters
      ? currentlyEnrolledChildWhere()
      : { AND: [visibleChildCenterWhere(scopedCenterIds), currentlyEnrolledChildWhere()] };
    const [children, allChildren, total, graduated, allergies, restrictedMedicalNotes, intakeCenters] = await Promise.all([
      prisma.child.findMany({
        where: currentChildWhere,
        orderBy: { fullName: "asc" },
        take: 150,
        include: {
          family: { select: { name: true, centerId: true, custodyNotes: true } },
          classroom: {
            select: {
              name: true,
              center: { select: { name: true, crmLocationId: true } },
            },
          },
          _count: { select: { allergies: true, medicalNotes: true, documents: true, incidents: true, dailyReports: true } },
        },
      }),
      prisma.child.findMany({
        where: childWhere,
        orderBy: { fullName: "asc" },
        take: 300,
        include: {
          family: { select: { name: true, centerId: true, custodyNotes: true } },
          classroom: {
            select: {
              name: true,
              center: { select: { name: true, crmLocationId: true } },
            },
          },
          _count: { select: { allergies: true, medicalNotes: true, documents: true, incidents: true, dailyReports: true } },
        },
      }),
      prisma.child.count({ where: currentChildWhere }),
      prisma.child.count({ where: graduatedChildWhere }),
      prisma.allergy.count({ where: { child: currentChildRelationWhere } }),
      prisma.childMedicalNote.count({ where: { restricted: true, child: currentChildRelationWhere } }),
      getFamilyIntakeCenters(user),
    ]);

    return <ChildProfilesPage data={{ children, allChildren, intakeCenters, stats: { total, graduated, allergies, restrictedMedicalNotes } }} />;
  }

  if (slug === "parent-portal") {
    const family = await prisma.family.findFirst({
      where: user.role === "PARENT_GUARDIAN"
        ? { guardians: { some: { userId: user.id } }, children: { some: currentlyEnrolledChildWhere() } }
        : allCenters
          ? { children: { some: currentlyEnrolledChildWhere() } }
          : { centerId: scopedCenterIds, children: { some: currentlyEnrolledChildWhere() } },
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
            checkInPinSetAt: true,
            checkInPinHash: true,
          },
        },
          children: {
            where: currentlyEnrolledChildWhere(),
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

    if (!family && showDemoFallbackData) {
      return <ParentPortalWorkspace {...executiveParentPortalDemo} demoMode />;
    }

    const familyId = family?.id ?? "__no_family__";
    const childIds = family?.children.map((child) => child.id) ?? [];
    const [billingAccount, invoices, dailyReports, incidents, messages, documents, media, announcements, familyCenter, uniformProducts] = await Promise.all([
      prisma.billingAccount.findUnique({
        where: { familyId },
        select: {
          id: true,
          balanceCents: true,
          autopayPlaceholder: true,
          customFields: true,
          payments: {
            where: {
              OR: [
                { status: PaymentStatus.PAID },
                {
                  provider: "stripe",
                  status: PaymentStatus.DRAFT,
                  OR: [
                    { customFields: { path: ["status"], equals: "checkout_created" } },
                    { customFields: { path: ["status"], equals: "checkout_pending" } },
                  ],
                },
              ],
            },
            orderBy: [{ paidAt: "desc" }, { id: "desc" }],
            take: 20,
            select: {
              id: true,
              amountCents: true,
              status: true,
              provider: true,
              paidAt: true,
              externalIdPlaceholder: true,
              customFields: true,
            },
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
        select: { id: true, number: true, status: true, dueDate: true, totalCents: true, customFields: true },
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
        select: { id: true, subject: true, body: true, createdAt: true, metadata: true },
      }),
      prisma.document.findMany({
        where: { OR: [{ familyId }, { childId: { in: childIds.length ? childIds : ["__none__"] } }] },
        orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
        take: 20,
        select: { id: true, name: true, type: true, status: true, expiresAt: true, storageKey: true },
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
      family?.centerId
        ? prisma.center.findUnique({
            where: { id: family.centerId },
            select: {
              id: true,
              customFields: true,
              organization: {
                select: {
                  tenant: { select: { name: true, slug: true } },
                  brand: { select: { name: true, slug: true } },
                },
              },
            },
          })
        : Promise.resolve(null),
      prisma.product.findMany({
        where: { type: { in: [...STUDENT_UNIFORM_SHIRT_PRODUCT_TYPES] } },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, type: true, amountCents: true },
      }),
    ]);

    const [signedDocuments, signedMedia, signedMessages] = await Promise.all([
      signDocumentRecords(documents),
      signChildMediaRecords(media),
      Promise.all(messages.map(async (message) => ({
        ...message,
        attachments: await signMessageAttachmentsFromMetadata(message.metadata),
      }))),
    ]);
    const parentPortalCenterName = family?.centerId
      ? centers.find((center) => center.id === family.centerId)
      : null;
    const kioskCredentials = user.role === UserRole.PARENT_GUARDIAN && family
      ? family.guardians
          .filter((guardian) => guardian.userId === user.id)
          .map((guardian) => buildGuardianKioskCredential({
            id: guardian.id,
            fullName: guardian.fullName,
            checkInPinSetAt: guardian.checkInPinSetAt,
            checkInPinHash: guardian.checkInPinHash,
            family: {
              id: family.id,
              name: family.name,
              centerId: family.centerId,
              centerName: parentPortalCenterName ? formatCenterName(parentPortalCenterName) : null,
            },
          }))
      : [];
    const parentPortalFamily = family
      ? {
          ...family,
          guardians: family.guardians.map((guardian) => {
            const safeGuardian = { ...guardian };
            delete (safeGuardian as { checkInPinHash?: string | null }).checkInPinHash;
            delete (safeGuardian as { checkInPinSetAt?: Date | null }).checkInPinSetAt;
            return safeGuardian;
          }),
        }
      : null;
    const linkedGuardian = user.role === UserRole.PARENT_GUARDIAN
      ? parentPortalFamily?.guardians.find((guardian) => guardian.userId === user.id) ?? null
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
    const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
      tenantSlug: familyCenter?.organization.tenant.slug,
      tenantName: familyCenter?.organization.tenant.name,
      brandSlug: familyCenter?.organization.brand?.slug,
      brandName: familyCenter?.organization.brand?.name,
    });
    const pendingPaymentByInvoiceId = new Map<string, ReturnType<typeof activeStripeCheckoutPaymentSummary>>();
    for (const payment of billingAccount?.payments ?? []) {
      if (!isActiveStripeCheckoutPayment(payment)) continue;
      const fields = jsonRecord(payment.customFields);
      const invoiceId = stringField(fields.invoiceId);
      if (!invoiceId || pendingPaymentByInvoiceId.has(invoiceId)) continue;
      pendingPaymentByInvoiceId.set(invoiceId, activeStripeCheckoutPaymentSummary(payment));
    }
    const invoicesWithCheckout = invoices.map((invoice) => {
      const invoiceFields = asRecord(invoice.customFields);
      const purposeLabel = invoicePurposeLabel(invoiceFields);
      const achAmounts = getStripeCheckoutAmounts(invoice.totalCents, {
        paymentMethodCategory: "ach",
        waiveBeeSuitePaymentOperationsFee,
      });
      const cardAmounts = getStripeCheckoutAmounts(invoice.totalCents, {
        paymentMethodCategory: "card",
        waiveBeeSuitePaymentOperationsFee,
      });
      const instantBankAmounts = getStripeCheckoutAmounts(invoice.totalCents, {
        paymentMethodCategory: "link_bank",
        waiveBeeSuitePaymentOperationsFee,
      });
      return {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        dueDate: invoice.dueDate,
        totalCents: invoice.totalCents,
        purposeLabel,
        pendingPayment: pendingPaymentByInvoiceId.get(invoice.id) ?? null,
        checkoutOptions: {
          ach: {
            checkoutTotalCents: achAmounts.checkoutTotalCents,
            parentProcessingRecoveryAmountCents: achAmounts.parentProcessingRecoveryAmountCents,
            applicationFeeAmountCents: achAmounts.applicationFeeAmountCents,
            paymentMethodConfigurationReady: Boolean(getStripePaymentMethodConfigurationId("ach")),
          },
          instantBank: {
            checkoutTotalCents: instantBankAmounts.checkoutTotalCents,
            parentProcessingRecoveryAmountCents: instantBankAmounts.parentProcessingRecoveryAmountCents,
            applicationFeeAmountCents: instantBankAmounts.applicationFeeAmountCents,
            paymentMethodConfigurationReady: Boolean(getStripePaymentMethodConfigurationId("link_bank")),
          },
          card: {
            checkoutTotalCents: cardAmounts.checkoutTotalCents,
            parentProcessingRecoveryAmountCents: cardAmounts.parentProcessingRecoveryAmountCents,
            applicationFeeAmountCents: cardAmounts.applicationFeeAmountCents,
            paymentMethodConfigurationReady: Boolean(getStripePaymentMethodConfigurationId("card")),
          },
          beeSuitePaymentOperationsFeeAmountCents: achAmounts.beeSuitePaymentOperationsFeeAmountCents,
          beeSuitePaymentOperationsFeeWaived: waiveBeeSuitePaymentOperationsFee,
        },
      };
    });
    const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId: user.tenantId }));
    const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: user.tenantId }));
    const parentCheckoutReadiness = stripeCheckoutReadiness({
      customFields: familyCenter?.customFields,
      stripeConfigured,
      webhookConfigured: stripeWebhookConfigured || process.env.STRIPE_REQUIRE_WEBHOOK_FOR_CHECKOUT === "false",
      allowPlatformOnlyPayments: process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true",
    });

    return (
      <ParentPortalWorkspace
        family={parentPortalFamily}
        billingAccount={billingAccount ? {
          id: billingAccount.id,
          balanceCents: billingAccount.balanceCents,
          autopayPlaceholder: billingAccount.autopayPlaceholder,
          paymentMethodManagement: paymentMethodManagementSummary({
            autopayPlaceholder: billingAccount.autopayPlaceholder,
            customFields: billingAccount.customFields,
          }),
        } : null}
        invoices={invoicesWithCheckout}
        checkoutReadiness={parentCheckoutReadiness}
        payments={billingAccount?.payments ?? []}
        ledgerEntries={billingAccount?.ledgerEntries ?? []}
        dailyReports={dailyReports}
        incidents={incidents}
        messages={signedMessages}
        documents={signedDocuments}
        media={signedMedia}
        announcements={announcements}
        uniformProducts={studentUniformProductOptions(uniformProducts)}
        currentGuardianId={linkedGuardian?.id ?? null}
        kioskCredentials={kioskCredentials}
        notificationPreferences={notificationPreferences}
      />
    );
  }

  if (slug === "teacher-portal") {
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId: user.id },
      select: { centerId: true, classroomId: true, customFields: true },
    });
    const teacherCenter = staffProfile?.centerId
      ? await prisma.center.findUnique({
          where: { id: staffProfile.centerId },
          select: { id: true, name: true, crmLocationId: true, city: true, state: true, postalCode: true, timezone: true, customFields: true },
        })
      : null;
    const teacherServiceDay = centerServiceDayWindow(today, teacherCenter);
    const teacherChildScopeWhere: Prisma.ChildWhereInput = allCenters
      ? {}
      : staffProfile?.classroomId
        ? { classroomId: staffProfile.classroomId }
        : staffProfile?.centerId
          ? { classroom: { is: { centerId: staffProfile.centerId } } }
          : { classroom: { is: { centerId: scopedCenterIds } } };
    const childWhereForTeacher: Prisma.ChildWhereInput = { AND: [teacherChildScopeWhere, currentlyEnrolledChildWhere()] };
    const classroomWhereForTeacher: Prisma.ClassroomWhereInput = allCenters
      ? {}
      : staffProfile?.classroomId
        ? { id: staffProfile.classroomId }
        : staffProfile?.centerId
          ? { centerId: staffProfile.centerId }
          : { centerId: scopedCenterIds };
    const children = await prisma.child.findMany({
      where: childWhereForTeacher,
      orderBy: [{ classroom: { name: "asc" } }, { fullName: "asc" }],
      take: 120,
      select: {
        id: true,
        fullName: true,
        ageGroup: true,
        enrollmentStatus: true,
        photoVideoPermission: true,
        classroom: { select: { id: true, name: true } },
        family: { select: { custodyNotes: true } },
      },
    });
    const classroomRatios = await prisma.classroom.findMany({
      where: classroomWhereForTeacher,
      orderBy: { name: "asc" },
      take: 80,
      select: {
        id: true,
        name: true,
        ageGroup: true,
        capacity: true,
        ratioRule: true,
        center: { select: { state: true, licensedCapacity: true, customFields: true } },
        _count: {
          select: {
            staff: { where: { user: { role: UserRole.TEACHER } } },
          },
        },
      },
    });
    const childIds = children.map((child) => child.id);
    const [attendanceRecords, checkLogs, dailyReports] = childIds.length
      ? await Promise.all([
          prisma.attendanceRecord.findMany({
            where: { childId: { in: childIds }, date: { gte: teacherServiceDay.start, lt: teacherServiceDay.end } },
            orderBy: { date: "desc" },
            select: { childId: true, date: true, status: true },
          }),
          prisma.checkInOutLog.findMany({
            where: { childId: { in: childIds }, occurredAt: { gte: teacherServiceDay.start, lt: teacherServiceDay.end } },
            orderBy: { occurredAt: "desc" },
            select: { childId: true, type: true, occurredAt: true },
          }),
          prisma.dailyReport.findMany({
            where: { childId: { in: childIds }, date: { gte: teacherServiceDay.start, lt: teacherServiceDay.end } },
            orderBy: { date: "desc" },
            select: {
              childId: true,
              date: true,
              sentAt: true,
              _count: { select: { meals: true, naps: true, diapers: true, activities: true } },
            },
          }),
        ])
      : [[], [], []];
    const attendanceByChild = new Map<string, { status: string; date: Date }>();
    for (const record of attendanceRecords) {
      if (record.childId && !attendanceByChild.has(record.childId)) {
        attendanceByChild.set(record.childId, { status: record.status, date: record.date });
      }
    }
    const latestCheckLogByChild = latestLogMap(checkLogs);
    const latestDailyReportByChild = new Map<string, (typeof dailyReports)[number]>();
    for (const report of dailyReports) {
      if (report.childId && !latestDailyReportByChild.has(report.childId)) {
        latestDailyReportByChild.set(report.childId, report);
      }
    }
    const roster = children.map((child) => {
      const attendance = attendanceByChild.get(child.id);
      const latestLog = latestCheckLogByChild.get(child.id);
      const dailyReport = latestDailyReportByChild.get(child.id);
      return {
        ...child,
        attendance: {
          status: attendance?.status ?? "not_marked",
          latestLogType: latestLog?.type ?? null,
          latestLogAt: latestLog?.occurredAt.toISOString() ?? null,
          lastMarkedAt: attendance?.date.toISOString() ?? null,
        },
        dailyReport: dailyReport ? {
          status: dailyReport.sentAt ? "sent" as const : "draft" as const,
          latestReportAt: dailyReport.date.toISOString(),
          sentAt: dailyReport.sentAt?.toISOString() ?? null,
          entries: {
            meals: dailyReport._count.meals,
            naps: dailyReport._count.naps,
            diapers: dailyReport._count.diapers,
            activities: dailyReport._count.activities,
          },
        } : null,
      };
    });

    const teacherClockState = staffProfile ? readStaffClockState(staffProfile.customFields) : null;
    const teacherClockSummary = staffProfile ? readStaffClockSummary(staffProfile.customFields) : null;

    return (
      <TeacherMobileWorkspace
        roster={roster}
        teacherName={user.name}
        kioskAccess={staffProfile?.centerId ? {
          centerId: staffProfile.centerId,
          centerName: teacherCenter ? formatCenterName(teacherCenter) : "Assigned school",
          kioskPath: kioskPathForCenter(staffProfile.centerId, "staff"),
          hasStaffKioskCode: Boolean(readStaffKioskPinHash(staffProfile.customFields)),
          clockStatus: teacherClockState?.status ?? "clocked_out",
          lastActionAt: teacherClockState?.lastActionAt ?? null,
          timeClockSummary: {
            totalMinutes: teacherClockSummary?.totalMinutes ?? 0,
            closedShiftCount: teacherClockSummary?.closedShiftCount ?? 0,
            openShiftMinutes: teacherClockSummary?.openShiftMinutes ?? 0,
            openShiftStartedAt: teacherClockSummary?.openShiftStartedAt ?? null,
          },
        } : null}
        classroomRatios={classroomRatios.map((classroom) => ({
          classroomId: classroom.id,
          name: classroom.name,
          capacity: classroom.capacity,
          ratioRule: resolveClassroomRatioRule({
            ratioRule: classroom.ratioRule,
            ageGroup: classroom.ageGroup,
            state: classroom.center.state,
            licensingRatioRules: readCenterLicensingConfiguration(classroom.center.customFields, {
              centerState: classroom.center.state,
              licensedCapacity: classroom.center.licensedCapacity,
            }).ratioRules.value,
          }),
          assignedStaff: classroom._count.staff,
        }))}
        teacherChecklistCompletedIds={readCompletedSetupChecklistIds(setupChecklistUser?.customFields, "teacher_profile")}
      />
    );
  }

  if (slug === "messages") {
    const teacherMessageScope = user.role === UserRole.TEACHER && !allCenters;
    const teacherStaffProfile = teacherMessageScope
      ? await prisma.staffProfile.findUnique({
          where: { userId: user.id },
          select: { classroomId: true },
        })
      : null;
    const familyScopeWhere: Prisma.FamilyWhereInput = teacherMessageScope
      ? teacherStaffProfile?.classroomId
        ? { children: { some: { AND: [{ classroomId: teacherStaffProfile.classroomId }, currentlyEnrolledChildWhere()] } } }
        : { id: "__no_teacher_classroom__" }
      : allCenters
        ? { children: { some: currentlyEnrolledChildWhere() } }
        : { centerId: scopedCenterIds, children: { some: currentlyEnrolledChildWhere() } };
    const messageWhere = buildVisibleMessageWhere({
      userId: user.id,
      familyScopeWhere,
      allCenters,
      teacherMessageScope,
    });
    const classroomWhere: Prisma.ClassroomWhereInput = allCenters ? {} : { centerId: scopedCenterIds };
    const [messages, families, templates, staffUsers, classrooms, notificationPreferenceUsers, total, unread, priority, aiReview] = await Promise.all([
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
          assignedTo: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.family.findMany({
        where: familyScopeWhere,
        orderBy: { name: "asc" },
        take: 500,
        select: {
          id: true,
          name: true,
          billingEmail: true,
          centerId: true,
          customFields: true,
          guardians: {
            select: {
              phone: true,
              preferredCommunication: true,
            },
          },
          children: {
            where: currentlyEnrolledChildWhere(),
            select: {
              classroomId: true,
              enrollmentStatus: true,
            },
          },
        },
      }),
      prisma.messageTemplate.findMany({
        where: {
          tenantId: user.tenantId,
          isActive: true,
          ...(allCenters ? {} : { OR: [{ centerId: null }, { centerId: scopedCenterIds }] }),
        },
        orderBy: [{ centerId: "asc" }, { category: "asc" }, { name: "asc" }],
        take: 100,
      }),
      prisma.user.findMany({
        where: {
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN, UserRole.TEACHER] },
          ...(allCenters
            ? {}
            : {
                OR: [
                  { staffProfile: { centerId: scopedCenterIds } },
                  { accessGrants: { some: { isActive: true, centerId: scopedCenterIds } } },
                ],
              }),
        },
        orderBy: { name: "asc" },
        take: 250,
        select: { id: true, name: true, email: true, role: true },
      }),
      prisma.classroom.findMany({
        where: classroomWhere,
        orderBy: [{ center: { name: "asc" } }, { name: "asc" }],
        take: 500,
        select: {
          id: true,
          name: true,
          ageGroup: true,
          centerId: true,
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
      prisma.user.findMany({
        where: notificationPreferenceUserWhere,
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 500,
        select: { id: true, name: true, email: true, role: true },
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
    const canManageNotificationDefaults = canManageOperations(user);
    const notificationPreferenceUserIds = notificationPreferenceUsers.map((item) => item.id);
    const notificationPreferences = await prisma.notificationPreference.findMany({
      where: canManageNotificationDefaults
        ? {
            tenantId: user.tenantId,
            OR: [
              { userId: { in: notificationPreferenceUserIds.length ? notificationPreferenceUserIds : [user.id] } },
              { role: { in: Object.values(UserRole) } },
            ],
          }
        : {
            tenantId: user.tenantId,
            OR: [{ userId: user.id }, { role: user.role }],
          },
      orderBy: [{ userId: "desc" }, { role: "asc" }, { type: "asc" }],
    });

    const signedMessages = await Promise.all(messages.map(async (message) => ({
      ...message,
      attachments: await signMessageAttachmentsFromMetadata(message.metadata),
    })));
    const demoMode = showDemoFallbackData && messages.length === 0;
    const visibleMessages = demoMode ? executiveParentMessageDemoRows : signedMessages;
    const centerLabelById = new Map(centers.map((center) => [center.id, formatCenterName(center)]));
    const familyOptions = families.map((family) => ({
      id: family.id,
      name: family.name,
      billingEmail: family.billingEmail,
      centerId: family.centerId,
      centerLabel: family.centerId ? centerLabelById.get(family.centerId) ?? null : null,
      classroomIds: family.children.map((child) => child.classroomId).filter((value): value is string => Boolean(value)),
      statuses: Array.from(new Set(family.children.map((child) => child.enrollmentStatus).filter((value): value is string => Boolean(value)))),
      tags: extractFamilyTags(family.customFields),
      smsRecipientCount: uniqueSmsRecipients(
        family.guardians
          .filter((guardian) => guardian.preferredCommunication === "sms")
          .map((guardian) => guardian.phone),
      ).length,
    }));
    const templateOptions = templates.length
      ? templates.map((template) => ({
          id: template.id,
          name: template.name,
          subject: template.subject,
          body: template.body,
          category: template.category,
          channel: template.channel,
          mergeFields: normalizeMergeFields(template.mergeFields),
        }))
      : defaultMessageTemplates;
    type MessageThread = {
      key: string;
      familyName: string;
      centerLabel: string | null;
      assignedTo: { name: string; email: string } | null;
      unread: number;
      priority: number;
      lastMessageAt: Date | string;
      messages: Array<{
        id: string;
        subject: string | null;
        body: string;
        channel: string;
        priority: string;
        createdAt: Date | string;
        sender: { name: string; email: string } | null;
        attachments?: Awaited<ReturnType<typeof signMessageAttachmentsFromMetadata>>;
      }>;
    };
    const threadMap = signedMessages.reduce((map, message) => {
        const key = message.threadKey ?? (message.familyId ? `family:${message.familyId}` : `internal:${message.id}`);
        const existing = map.get(key) ?? {
          key,
          familyName: message.family?.name ?? "Internal thread",
          centerLabel: message.family?.centerId ? centerLabelById.get(message.family.centerId) ?? null : null,
          assignedTo: message.assignedTo ?? null,
          unread: 0,
          priority: 0,
          lastMessageAt: message.createdAt,
          messages: [],
        };
        existing.assignedTo = existing.assignedTo ?? message.assignedTo ?? null;
        existing.unread += message.readAt ? 0 : 1;
        existing.priority += ["high", "urgent"].includes(message.priority) ? 1 : 0;
        if (new Date(message.createdAt).getTime() > new Date(existing.lastMessageAt).getTime()) {
          existing.lastMessageAt = message.createdAt;
        }
        existing.messages.push({
          id: message.id,
          subject: message.subject,
          body: message.body,
          channel: message.channel,
          priority: message.priority,
          createdAt: message.createdAt,
          sender: message.sender,
          attachments: message.attachments,
        });
        return map;
      }, new Map<string, MessageThread>());
    const threads = Array.from(threadMap.values())
      .map((thread) => ({
        ...thread,
        messages: thread.messages
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          .slice(-5),
      }))
      .sort((left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime())
      .slice(0, 20);

    return (
      <MessagesPage
        data={{
          messages: visibleMessages,
          threads,
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
          familyOptions: demoMode ? [] : familyOptions,
          templates: templateOptions,
          mergeFields: messageMergeFields,
          staffOptions: staffUsers,
          segmentOptions: {
            centers: centers.map((center) => ({
              id: center.id,
              label: formatCenterName(center),
            })),
            classrooms: classrooms.map((classroom) => ({
              id: classroom.id,
              label: `${classroom.center.crmLocationId ?? classroom.center.name} - ${classroom.name}`,
              centerId: classroom.centerId,
            })),
            statuses: Array.from(new Set(families.flatMap((family) => family.children.map((child) => child.enrollmentStatus).filter((value): value is string => Boolean(value)))))
              .sort()
              .map((status) => ({ value: status, label: status.replaceAll("_", " ") })),
            tags: Array.from(new Set(families.flatMap((family) => extractFamilyTags(family.customFields))))
              .sort()
              .map((tag) => ({ value: tag, label: tag })),
          },
          notificationPreferences,
          notificationPreferenceTypes,
          notificationPreferenceUsers,
          notificationPreferenceRoles: notificationPreferenceRoleOptions,
          currentUserId: user.id,
          currentRole: user.role,
          canManageRoleDefaults: canManageNotificationDefaults,
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

    const demoMode = showDemoFallbackData && announcements.length === 0;
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
      OR: [{ tenantId: user.tenantId }, { brand: { is: { tenantId: user.tenantId } } }],
    };
    const [campaigns, total, active, draft, paused, scheduled, sent] = await Promise.all([
      prisma.campaign.findMany({
        where: campaignWhere,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
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
      prisma.campaign.count({ where: { ...campaignWhere, status: "scheduled" } }),
      prisma.campaign.count({ where: { ...campaignWhere, status: "sent" } }),
    ]);

    return <CampaignsPage data={{ campaigns, stats: { total, active, draft, paused, scheduled, sent } }} />;
  }

  if (slug === "automations") {
    const automationWhere: Prisma.AutomationWhereInput = {
      OR: [{ tenantId: user.tenantId }, { brand: { is: { tenantId: user.tenantId } } }],
    };
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
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
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    return <AutomationsPage data={{ automations, stats: { total, active, paused, recentRuns } }} />;
  }

  if (slug === "billing-invoices") {
    const billingAccountWhere: Prisma.BillingAccountWhereInput = allCenters
      ? {}
      : { family: { is: { centerId: scopedCenterIds } } };
    const invoiceWhere: Prisma.InvoiceWhereInput = allCenters
      ? {}
      : { billingAccount: { family: { is: { centerId: scopedCenterIds } } } };
    const workbenchFamilyWhere: Prisma.FamilyWhereInput = {
      centerId: scopedCenterIds,
      children: { some: currentlyEnrolledChildWhere() },
    };
    const [
      invoices,
      ledgerEntries,
      total,
      open,
      paid,
      openRows,
      ledgerRollupRows,
      billingAccountRows,
      billingFamilies,
      billingProducts,
      tuitionPlans,
      billingStripeConfigured,
      billingStripeWebhookConfigured,
    ] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          billingAccount: {
            select: {
              id: true,
              balanceCents: true,
              autopayPlaceholder: true,
              customFields: true,
              family: { select: { id: true, name: true, billingEmail: true, centerId: true } },
            },
          },
          _count: { select: { items: true } },
        },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          billingAccount: billingAccountWhere,
        },
        orderBy: { effectiveAt: "desc" },
        take: 50,
        include: {
          billingAccount: {
            select: {
              family: { select: { id: true, name: true, billingEmail: true, centerId: true } },
            },
          },
        },
      }),
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.invoice.count({ where: { ...invoiceWhere, status: PaymentStatus.OPEN } }),
      prisma.invoice.count({ where: { ...invoiceWhere, status: PaymentStatus.PAID } }),
      prisma.invoice.findMany({ where: { ...invoiceWhere, status: PaymentStatus.OPEN }, select: { totalCents: true, dueDate: true } }),
      prisma.ledgerEntry.findMany({
        where: { billingAccount: billingAccountWhere },
        orderBy: { effectiveAt: "desc" },
        take: 1000,
        select: {
          billingAccountId: true,
          type: true,
          amountCents: true,
          balanceAfterCents: true,
          effectiveAt: true,
          invoiceId: true,
          paymentId: true,
        },
      }),
      prisma.billingAccount.findMany({
        where: billingAccountWhere,
        orderBy: { family: { name: "asc" } },
        select: {
          id: true,
          balanceCents: true,
          family: { select: { name: true } },
        },
      }),
      prisma.family.findMany({
        where: workbenchFamilyWhere,
        orderBy: { name: "asc" },
        take: 1000,
        select: {
          id: true,
          centerId: true,
          name: true,
          billingEmail: true,
          updatedAt: true,
          guardians: {
            select: { id: true, fullName: true, email: true, userId: true },
            orderBy: { fullName: "asc" },
          },
          billingAccount: {
            select: {
              id: true,
              balanceCents: true,
              autopayPlaceholder: true,
              customFields: true,
              invoices: {
                where: { status: PaymentStatus.OPEN },
                orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
                take: 20,
                select: { id: true, number: true, status: true, dueDate: true, totalCents: true },
              },
            },
          },
          children: {
            where: currentlyEnrolledChildWhere(),
            orderBy: { fullName: "asc" },
            select: { id: true, fullName: true, ageGroup: true, enrollmentStatus: true, customFields: true },
          },
        },
      }),
      prisma.product.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }], take: 100 }),
      prisma.tuitionPlan.findMany({ orderBy: [{ ageGroup: "asc" }, { name: "asc" }], take: 100 }),
      getStripeSecretKey({ tenantId: user.tenantId }).then(Boolean),
      getStripeWebhookSecret({ tenantId: user.tenantId }).then(Boolean),
    ]);
    const allowPlatformOnlyPayments = process.env.STRIPE_ALLOW_PLATFORM_ONLY_PAYMENTS === "true";
    const arReport = openRows.reduce(
      (report, invoice) => {
        const daysPastDue = Math.floor((startOfDay.getTime() - new Date(invoice.dueDate).getTime()) / 86_400_000);
        if (daysPastDue <= 0) report.currentCents += invoice.totalCents;
        else if (daysPastDue <= 30) report.oneToThirtyCents += invoice.totalCents;
        else if (daysPastDue <= 60) report.thirtyOneToSixtyCents += invoice.totalCents;
        else report.sixtyOnePlusCents += invoice.totalCents;
        return report;
      },
      {
        currentCents: 0,
        oneToThirtyCents: 0,
        thirtyOneToSixtyCents: 0,
        sixtyOnePlusCents: 0,
        chargesCents: 0,
        paymentsCents: 0,
        agencyPaymentsCents: 0,
        creditsCents: 0,
      },
    );
    for (const entry of ledgerRollupRows) {
      if (entry.amountCents > 0) arReport.chargesCents += entry.amountCents;
      if (entry.type === "payment" || entry.type === "agency_payment") arReport.paymentsCents += Math.abs(entry.amountCents);
      if (entry.type === "agency_payment") arReport.agencyPaymentsCents += Math.abs(entry.amountCents);
      if (entry.amountCents < 0 && entry.type !== "payment" && entry.type !== "agency_payment") arReport.creditsCents += Math.abs(entry.amountCents);
    }
    const reconciliation = buildLedgerReconciliationReport({
      accounts: billingAccountRows.map((account) => ({
        id: account.id,
        balanceCents: account.balanceCents,
        familyName: account.family.name,
      })),
      entries: ledgerRollupRows,
    });
    const schedulerDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12));
    const currentMonthlyPeriod = normalizeRecurringBillingPeriod(null, schedulerDate, "monthly");
    const currentWeeklyPeriod = defaultRecurringBillingPeriod(null, schedulerDate, "weekly");
    const recurringScheduler = billingFamilies.reduce(
      (summary, family) => {
        for (const child of family.children) {
          const assignment = tuitionAssignmentFromCustomFields(child.customFields);
          if (!assignment.enabled) continue;
          const cadence = normalizeBillingCadence(assignment.cadence);
          const billingPeriod = cadence === "weekly" ? currentWeeklyPeriod : currentMonthlyPeriod;
          const billingDay = normalizeRecurringBillingDay(assignment.billingDay, cadence);
          const currentDay = cadence === "weekly" ? utcBillingWeekday(schedulerDate) : schedulerDate.getUTCDate();
          summary.activeAssignments += 1;
          if (cadence === "weekly") summary.weeklyAssignments += 1;
          else summary.monthlyAssignments += 1;
          if (shouldCreateRecurringTuitionInvoice({
            enabled: assignment.enabled,
            planId: assignment.tuitionPlanId,
            amountCents: assignment.amountCents ?? 0,
            startsPeriod: assignment.startsPeriod,
            billingPeriod,
            billingDay,
            currentDay,
          })) {
            summary.dueToday += 1;
          }
        }
        return summary;
      },
      {
        activeAssignments: 0,
        monthlyAssignments: 0,
        weeklyAssignments: 0,
        dueToday: 0,
        currentMonthlyPeriod,
        currentWeeklyPeriod,
        cronSchedule: "Daily at 13:15 UTC",
      },
    );
    const requestedBillingFamilyId = firstSearchParam(searchParams.familyId) || "";
    const requestedBillingCenterId = firstSearchParam(searchParams.centerId) || "";
    const requestedBillingSearch = firstSearchParam(searchParams.q) || "";

    return (
      <BillingInvoicesPage
        data={{
          initialSelection: {
            familyId: requestedBillingFamilyId,
            centerId: requestedBillingCenterId,
            searchQuery: requestedBillingSearch,
          },
          workbench: {
            families: billingFamilies.map((family) => ({
              ...family,
              billingAccount: family.billingAccount
                ? {
                    id: family.billingAccount.id,
                    balanceCents: family.billingAccount.balanceCents,
                    autopayPlaceholder: family.billingAccount.autopayPlaceholder,
                    paymentMethodManagement: paymentMethodManagementSummary({
                      autopayPlaceholder: family.billingAccount.autopayPlaceholder,
                      customFields: family.billingAccount.customFields,
                    }),
                    openInvoices: family.billingAccount.invoices.map((invoice) => ({
                      id: invoice.id,
                      number: invoice.number,
                      status: invoice.status,
                      dueDate: invoice.dueDate,
                      totalCents: invoice.totalCents,
                    })),
                  }
                : null,
              children: family.children.map((child) => ({
                id: child.id,
                fullName: child.fullName,
                ageGroup: child.ageGroup,
                enrollmentStatus: child.enrollmentStatus,
                tuitionAssignment: tuitionAssignmentFromCustomFields(child.customFields),
              })),
            })),
            centers: centers.map((center) => ({
              id: center.id,
              name: center.name,
              crmLocationId: center.crmLocationId,
              dashboardOptions: dashboardOptionsFromCustomFields(center.customFields),
              checkoutReadiness: stripeCheckoutReadiness({
                customFields: center.customFields,
                stripeConfigured: billingStripeConfigured,
                webhookConfigured: billingStripeWebhookConfigured,
                allowPlatformOnlyPayments,
              }),
            })),
            products: billingProducts,
            tuitionPlans,
          },
          invoices: invoices.map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            dueDate: invoice.dueDate,
            totalCents: invoice.totalCents,
            billingAccount: {
              id: invoice.billingAccount.id,
              balanceCents: invoice.billingAccount.balanceCents,
              paymentMethodManagement: paymentMethodManagementSummary({
                autopayPlaceholder: invoice.billingAccount.autopayPlaceholder,
                customFields: invoice.billingAccount.customFields,
              }),
              family: invoice.billingAccount.family,
            },
            _count: invoice._count,
          })),
          ledgerEntries,
          stats: { total, open, paid, outstandingCents: openRows.reduce((sum, invoice) => sum + invoice.totalCents, 0) },
          arReport,
          reconciliation,
          recurringScheduler,
        }}
      />
    );
  }

  if (slug === "payments") {
    const billingAccountWhere: Prisma.BillingAccountWhereInput = allCenters
      ? {}
      : { family: { is: { centerId: scopedCenterIds } } };
    const paymentWhere: Prisma.PaymentWhereInput = allCenters
      ? {}
      : { billingAccount: { family: { is: { centerId: scopedCenterIds } } } };
    const invoiceWhere: Prisma.InvoiceWhereInput = allCenters
      ? {}
      : { billingAccount: { family: { is: { centerId: scopedCenterIds } } } };
    const [paymentRows, total, paid, failed, draft, payoutCenters, paymentMethodAccounts, dueOpenInvoices] = await Promise.all([
      prisma.payment.findMany({
        where: paymentWhere,
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        take: 100,
        include: {
          billingAccount: {
            select: {
              family: { select: { id: true, name: true, billingEmail: true, centerId: true } },
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
      prisma.billingAccount.findMany({
        where: billingAccountWhere,
        select: {
          id: true,
          autopayPlaceholder: true,
          customFields: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          ...invoiceWhere,
          status: PaymentStatus.OPEN,
          totalCents: { gt: 0 },
          dueDate: { lte: today },
        },
        select: {
          totalCents: true,
          billingAccount: {
            select: {
              autopayPlaceholder: true,
              customFields: true,
            },
          },
        },
        take: 500,
      }),
    ]);
    const paymentInvoiceIds = Array.from(new Set(paymentRows
      .map((payment) => {
        const fields = payment.customFields && typeof payment.customFields === "object" && !Array.isArray(payment.customFields)
          ? payment.customFields as Record<string, unknown>
          : {};
        return typeof fields.invoiceId === "string" ? fields.invoiceId : null;
      })
      .filter((invoiceId): invoiceId is string => typeof invoiceId === "string")));
    const paymentInvoices = paymentInvoiceIds.length
      ? await prisma.invoice.findMany({
          where: { id: { in: paymentInvoiceIds } },
          select: { id: true, number: true, status: true },
        })
      : [];
    const paymentInvoicesById = new Map(paymentInvoices.map((invoice) => [invoice.id, invoice]));
    const payments = paymentRows.map((payment) => {
      const fields = payment.customFields && typeof payment.customFields === "object" && !Array.isArray(payment.customFields)
        ? payment.customFields as Record<string, unknown>
        : {};
      const invoiceId = typeof fields.invoiceId === "string" ? fields.invoiceId : null;
      const invoice = invoiceId ? paymentInvoicesById.get(invoiceId) : null;
      const dunning = paymentDunningSummary({
        paymentStatus: payment.status,
        customFields: fields,
        failedAt: typeof fields.dunningLastAttemptAt === "string" ? fields.dunningLastAttemptAt : null,
        relatedInvoiceStatus: invoice?.status ?? null,
      });

      return {
        ...payment,
        dunningStatus: dunning.status,
        dunningAttemptCount: dunning.attemptCount,
        dunningNextAttemptAt: dunning.nextAttemptAt,
        dunningLastAttemptAt: dunning.lastAttemptAt,
        failureMessage: dunning.failureMessage,
        invoiceNumber: invoice?.number ?? null,
        paymentReferenceLabel: invoice?.number
          ? `Invoice ${invoice.number}`
          : fields.paymentScope === "family_balance"
            ? "Family balance payment"
            : "No linked invoice",
      };
    });
    const dunningReady = payments.filter((payment) => payment.dunningStatus === "ready").length;
    const dunningWaiting = payments.filter((payment) => payment.dunningStatus === "waiting").length;
    const dunningMaxed = payments.filter((payment) => payment.dunningStatus === "maxed").length;
    const paymentMethodSummaries = paymentMethodAccounts.map((account) => paymentMethodManagementSummary({
      autopayPlaceholder: account.autopayPlaceholder,
      customFields: account.customFields,
    }));
    const savedPaymentMethods = paymentMethodSummaries.filter((summary) => summary.hasSavedPaymentMethod).length;
    const stripeCustomers = paymentMethodSummaries.filter((summary) => summary.hasStripeCustomer).length;
    const autopayEnabled = paymentMethodSummaries.filter((summary) => summary.autopayStatus === "enabled").length;
    const autopayPending = paymentMethodSummaries.filter((summary) => summary.autopayStatus === "pending").length;
    const dueAutopayInvoices = dueOpenInvoices.filter((invoice) => {
      const summary = paymentMethodManagementSummary({
        autopayPlaceholder: invoice.billingAccount.autopayPlaceholder,
        customFields: invoice.billingAccount.customFields,
      });
      return summary.autopayStatus === "enabled" && summary.hasStripeCustomer && summary.hasSavedPaymentMethod;
    });
    const autopayDueCents = dueAutopayInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
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
    const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId: user.tenantId }));
    const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: user.tenantId }));

    return (
      <PaymentsPage
        data={{
          payments,
          stats: {
            total,
            paid,
            failed,
            draft,
            stripeConfigured,
            webhookConfigured: stripeWebhookConfigured,
            payoutReadyCenters,
            payoutStartedCenters,
            dunningReady,
            dunningWaiting,
            dunningMaxed,
            paymentMethodAccounts: paymentMethodAccounts.length,
            stripeCustomers,
            savedPaymentMethods,
            autopayEnabled,
            autopayPending,
            autopayDueInvoices: dueAutopayInvoices.length,
            autopayDueCents,
          },
        }}
      />
    );
  }

  if (slug === "terminal-store") {
    return (
      <TerminalStorePage
        data={{
          items: terminalStoreCatalog,
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          defaultCenterId: user.primaryCenterId ?? centers[0]?.id ?? null,
        }}
      />
    );
  }

  if (slug === "analytics") {
    const requestedRange = firstSearchParam(searchParams.range) || "365";
    const requestedStart = firstSearchParam(searchParams.start) || "";
    const requestedEnd = firstSearchParam(searchParams.end) || "";
    const requestedCenterId = firstSearchParam(searchParams.centerId) || "all";
    const reportFilters = normalizeReportFilters({
      range: requestedRange,
      start: requestedStart,
      end: requestedEnd,
      centerId: requestedCenterId,
    }, today);
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
    const [leads, enrolled, waitlisted, tours, openInvoices, openRows, incidentsPending, unreadMessages, stageCounts, fte, reports] = await Promise.all([
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
      buildAnalyticsReportData(user, reportFilters, today),
    ]);

    return (
      <AnalyticsPage
        data={{
          reports,
          filters: {
            range: requestedRange,
            start: requestedStart || reports.range.startDate.slice(0, 10),
            end: requestedEnd || reports.range.endDate.slice(0, 10),
            centerId: requestedCenterId,
          },
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
    const reviewWhere: Prisma.ReviewWhereInput = allCenters
      ? { tenantId: user.tenantId }
      : { tenantId: user.tenantId, OR: [{ centerId: scopedCenterIds }, { centerId: null }] };
    const surveyWhere: Prisma.SurveyWhereInput = allCenters
      ? { tenantId: user.tenantId }
      : { tenantId: user.tenantId, OR: [{ centerId: scopedCenterIds }, { centerId: null }] };
    const [reviews, surveys] = await Promise.all([
      prisma.review.findMany({
        where: reviewWhere,
        orderBy: [{ rating: "desc" }, { source: "asc" }],
        take: 100,
        include: {
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
      prisma.survey.findMany({
        where: surveyWhere,
        orderBy: [{ status: "asc" }, { name: "asc" }],
        take: 100,
        include: {
          center: { select: { name: true, crmLocationId: true } },
          _count: { select: { responses: true } },
          responses: {
            orderBy: { submittedAt: "desc" },
            take: 3,
            select: {
              id: true,
              score: true,
              comment: true,
              respondentName: true,
              submittedAt: true,
            },
          },
        },
      }),
    ]);
    const averageRating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;

    return (
      <ReputationPage
        data={{
          centers: centers.map((center) => ({ id: center.id, name: center.name, crmLocationId: center.crmLocationId })),
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
    const centerNameById = new Map(centers.map((center) => [center.id, formatCenterName(center)]));
    const [summaries, suggestions, pendingReview, aiLeads, aiFamilies] = await Promise.all([
      prisma.aiSummary.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.aiSuggestion.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.aiSuggestion.count({ where: { status: "pending_review" } }),
      prisma.lead.findMany({
        where: leadWhere,
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          centerId: true,
          familyName: true,
          childName: true,
          programInterest: true,
          stage: true,
          score: true,
          createdAt: true,
          center: { select: { name: true, crmLocationId: true, city: true, state: true } },
        },
      }),
      prisma.family.findMany({
        where: { centerId: scopedCenterIds, children: { some: currentlyEnrolledChildWhere() } },
        orderBy: { name: "asc" },
        take: 200,
        select: {
          id: true,
          centerId: true,
          name: true,
          guardians: {
            orderBy: { fullName: "asc" },
            take: 2,
            select: { fullName: true, email: true },
          },
          _count: { select: { children: { where: currentlyEnrolledChildWhere() } } },
        },
      }),
    ]);

    return (
      <AiCommandPage
        data={{
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          leads: aiLeads.map((lead) => ({
            id: lead.id,
            centerId: lead.centerId,
            centerName: formatCenterName(lead.center),
            familyName: lead.familyName,
            childName: lead.childName,
            programInterest: lead.programInterest,
            stage: lead.stage,
            score: lead.score,
            createdAt: lead.createdAt.toISOString(),
          })),
          families: aiFamilies.map((family) => ({
            id: family.id,
            centerId: family.centerId,
            centerName: family.centerId ? centerNameById.get(family.centerId) ?? "Visible school" : "No school",
            name: family.name,
            guardianLabel: family.guardians.map((guardian) => guardian.fullName || guardian.email).filter(Boolean).join(", ") || "No guardian listed",
            childCount: family._count.children,
          })),
          summaries: summaries.map((summary) => ({
            ...summary,
            createdAt: summary.createdAt.toISOString(),
          })),
          suggestions: suggestions.map((suggestion) => ({
            id: suggestion.id,
            type: suggestion.type,
            suggestion: suggestion.suggestion,
            status: suggestion.status,
            guardrailNote: suggestion.guardrailNote,
            createdAt: suggestion.createdAt.toISOString(),
          })),
          stats: { summaries: summaries.length, suggestions: suggestions.length, pendingReview },
        }}
      />
    );
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
    const canManageControls = (user.role === UserRole.PLATFORM_OWNER || user.role === UserRole.BRAND_ADMIN) && canAccessAllCenters(user);
    const [settings, customizations, assets, brands, ownerGroups, supportRequests] = await Promise.all([
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
      prisma.brand.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      }),
      prisma.ownerGroup.findMany({
        where: tenantWide
          ? { tenantId: user.tenantId }
          : { tenantId: user.tenantId, centers: { some: { id: scopedCenterIds } } },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true },
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: {
          tenantId: user.tenantId,
          action: "tenant_controls.support_access.requested",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    const customizationRows = customizations.map((setting) => ({
      id: setting.id,
      scopeType: setting.scopeType,
      brandId: setting.brandId,
      ownerGroupId: setting.ownerGroupId,
      centerId: setting.centerId,
      brandName: setting.brandName,
      logoUrlPlaceholder: setting.logoUrlPlaceholder,
      faviconUrlPlaceholder: setting.faviconUrlPlaceholder,
      mascotUrlPlaceholder: setting.mascotUrlPlaceholder,
      primaryColor: setting.primaryColor,
      accentColor: setting.accentColor,
      themeMode: setting.themeMode,
      emailSenderPlaceholder: setting.emailSenderPlaceholder,
      customDomainPlaceholder: setting.customDomainPlaceholder,
      parentPortalName: setting.parentPortalName,
      loginScreenTitle: setting.loginScreenTitle,
      notificationFooterText: setting.notificationFooterText,
      legalFooterText: setting.legalFooterText,
      termsUrl: setting.termsUrl,
      privacyUrl: setting.privacyUrl,
      customCss: setting.customCss,
      brand: setting.brand,
      ownerGroup: setting.ownerGroup,
      center: setting.center,
      containerLabel: setting.center?.crmLocationId ?? setting.center?.name ?? setting.ownerGroup?.name ?? setting.brand?.name ?? "Tenant",
    }));
    const assetRows = assets.map((asset) => ({
      id: asset.id,
      assetType: asset.assetType,
      url: asset.url,
      storageKey: asset.storageKey,
      altText: asset.altText,
      brandId: asset.brandId,
      ownerGroupId: asset.ownerGroupId,
      centerId: asset.centerId,
      brand: asset.brand,
      ownerGroup: asset.ownerGroup,
      center: asset.center,
      containerLabel: asset.center?.crmLocationId ?? asset.center?.name ?? asset.ownerGroup?.name ?? asset.brand?.name ?? "Tenant",
    }));

    return (
      <WhiteLabelPage
        data={{
          settings,
          customizations: customizationRows,
          assets: assetRows,
          canManageControls,
          controlCustomizations: customizationRows,
          controlAssets: assetRows,
          brands: brands.map((brand) => ({ id: brand.id, label: `${brand.name} (${brand.slug})` })),
          ownerGroups: ownerGroups.map((group) => ({ id: group.id, label: group.name })),
          centers: centers.map((center) => ({ id: center.id, label: formatCenterName(center) })),
          supportRequests: supportRequests.map((request) => ({
            id: request.id,
            action: request.action,
            resourceId: request.resourceId,
            createdAt: request.createdAt.toISOString(),
            actor: request.user?.name ?? request.user?.email ?? "System",
            metadata: request.metadata,
          })),
        }}
      />
    );
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
          phone: true,
          address: true,
          city: true,
          state: true,
          postalCode: true,
          customFields: true,
        },
      }),
    ]);

    const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId: user.tenantId }));
    const stripeWebhookConfigured = Boolean(await getStripeWebhookSecret({ tenantId: user.tenantId }));

    return (
      <BillingSettingsPage
        data={{
          products,
          tuitionPlans,
          subscriptions,
          centers: billingCenters,
          stripeConfigured,
          webhookConfigured: stripeWebhookConfigured,
          tuitionFeatureFeeBps: Number.parseInt(process.env.STRIPE_PAYMENT_OPS_FEE_BPS || "150", 10) || 150,
          parentProcessingRecoveryApproved: isStripeParentProcessingRecoveryApproved(),
          parentSurchargeBps: getStripeCardProcessingRecoveryBps(),
          tuitionFeatureFeeFixedCents: Number.parseInt(process.env.STRIPE_PAYMENT_OPS_FEE_FIXED_CENTS || "0", 10) || 0,
          parentSurchargeFixedCents: getStripeCardProcessingRecoveryFixedCents(),
        }}
      />
    );
  }

  if (slug === "corporate-billing") {
    const kidCitySoftwareInvoice = await getKidCitySoftwareInvoiceSnapshot(prisma);
    return <CorporateBillingPage data={{ kidCitySoftwareInvoice }} />;
  }

  if (slug === "notifications") {
    const now = new Date();
    const [notifications, openTasks, highIntentLeads, pendingIncidents, notificationPreferenceUsers] = await Promise.all([
      prisma.notification.findMany({
        where: {
          AND: [
            activeNotificationWhere(now),
            { OR: [{ userId: null }, { userId: user.id }] },
          ],
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
      prisma.user.findMany({
        where: notificationPreferenceUserWhere,
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 500,
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);
    const unread = notifications.filter((notification) => !notification.readAt).length;
    const canManageNotificationDefaults = canManageOperations(user);
    const notificationPreferenceUserIds = notificationPreferenceUsers.map((item) => item.id);
    const notificationPreferences = await prisma.notificationPreference.findMany({
      where: canManageNotificationDefaults
        ? {
            tenantId: user.tenantId,
            OR: [
              { userId: { in: notificationPreferenceUserIds.length ? notificationPreferenceUserIds : [user.id] } },
              { role: { in: Object.values(UserRole) } },
            ],
          }
        : {
            tenantId: user.tenantId,
            OR: [{ userId: user.id }, { role: user.role }],
          },
      orderBy: [{ userId: "desc" }, { role: "asc" }, { type: "asc" }],
    });

    return (
      <NotificationCenterPage
        data={{
          notifications,
          stats: { unread, openTasks, highIntentLeads, pendingIncidents },
          notificationPreferences,
          notificationPreferenceTypes,
          notificationPreferenceUsers,
          notificationPreferenceRoles: notificationPreferenceRoleOptions,
          currentUserId: user.id,
          currentRole: user.role,
          canManageRoleDefaults: canManageNotificationDefaults,
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
    const visibleUserIds = users.map((visibleUser) => visibleUser.id);
    const deviceSessionCutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deviceSessions = visibleUserIds.length
      ? await prisma.deviceSession.findMany({
          where: {
            tenantId: user.tenantId,
            userId: { in: visibleUserIds },
            OR: [
              { revokedAt: null },
              { lastSeenAt: { gte: deviceSessionCutoff } },
            ],
          },
          orderBy: { lastSeenAt: "desc" },
          take: 300,
          select: {
            id: true,
            label: true,
            deviceType: true,
            appMode: true,
            userAgent: true,
            ipAddress: true,
            lastSeenAt: true,
            revokedAt: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
            revokedBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        }).catch(() => [])
      : [];

    return (
      <TeamPermissionsPage
        data={{
          users,
          roleCounts: roleCounts.map((role) => ({ role: role.role, count: role._count._all })),
          deviceSessions: deviceSessions.map((session) => ({
            id: session.id,
            label: session.label,
            deviceType: session.deviceType,
            appMode: session.appMode,
            userAgent: session.userAgent,
            ipAddress: session.ipAddress,
            lastSeenAt: session.lastSeenAt.toISOString(),
            revokedAt: session.revokedAt?.toISOString() ?? null,
            createdAt: session.createdAt.toISOString(),
            user: {
              id: session.user.id,
              name: session.user.name,
              email: session.user.email,
              role: session.user.role,
            },
            revokedBy: session.revokedBy,
          })),
          currentDeviceSessionId: user.deviceSessionId,
          canManageDeviceSessions: canManageOperations(user),
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

  if (slug === "developer-dashboard") {
    const auditWhere: Prisma.AuditLogWhereInput = {
      tenantId: user.tenantId,
      ...(tenantWide ? {} : { centerId: scopedCenterIds }),
    };
    const deliveryWhere: Prisma.IntegrationDeliveryWhereInput = {
      tenantId: user.tenantId,
      ...(tenantWide ? {} : { OR: [{ centerId: scopedCenterIds }, { centerId: null }] }),
    };
    const importWhere: Prisma.ProcareImportBatchWhereInput = tenantWide ? {
      center: { organization: { tenantId: user.tenantId } },
    } : {
      centerId: scopedCenterIds,
    };
    const [
      auditEvents,
      operationMutations,
      integrationDeliveries,
      failedDeliveries,
      webhookErrors,
      procareImports,
      integrations,
      deliveries,
      webhooks,
      imports,
      auditLogs,
    ] = await Promise.all([
      prisma.auditLog.count({ where: auditWhere }),
      prisma.auditLog.count({ where: { ...auditWhere, action: { startsWith: "operations." } } }),
      prisma.integrationDelivery.count({ where: deliveryWhere }),
      prisma.integrationDelivery.count({ where: { ...deliveryWhere, status: "failed" } }),
      prisma.stripeWebhookEvent.count({
        where: {
          OR: [
            { error: { not: null } },
            { status: { in: ["failed", "error"] } },
          ],
        },
      }),
      prisma.procareImportBatch.count({ where: importWhere }),
      prisma.integration.findMany({
        where: { tenantId: user.tenantId },
        orderBy: [{ status: "asc" }, { provider: "asc" }],
        take: 100,
        select: { id: true, provider: true, status: true, lastSyncAt: true },
      }),
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
          createdAt: true,
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
      prisma.stripeWebhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          type: true,
          status: true,
          objectId: true,
          error: true,
          processedAt: true,
          createdAt: true,
        },
      }),
      prisma.procareImportBatch.findMany({
        where: importWhere,
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          filename: true,
          status: true,
          createdAt: true,
          center: { select: { name: true, crmLocationId: true } },
          uploadedBy: { select: { name: true, email: true } },
          _count: { select: { rows: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
    ]);

    return (
      <DeveloperDashboardPage
        data={{
          canManageOperations: canManageOperations(user),
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          stats: {
            auditEvents,
            operationMutations,
            integrationDeliveries,
            failedDeliveries,
            webhookErrors,
            procareImports,
          },
          integrations,
          deliveries,
          webhooks,
          imports,
          auditLogs,
        }}
      />
    );
  }

  if (slug === "integrations") {
    const deliveryWhere: Prisma.IntegrationDeliveryWhereInput = user.role === UserRole.PLATFORM_OWNER
      ? {}
      : tenantWide
        ? { tenantId: user.tenantId }
        : { centerId: scopedCenterIds };
    const [totalDeliveries, deliveredDeliveries, pendingDeliveries, failedDeliveries, skippedDeliveries, recentDeliveries, integrationRecords, integrationCredentials] = await Promise.all([
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
      prisma.integration.findMany({
        where: { tenantId: user.tenantId },
        select: {
          id: true,
          provider: true,
          status: true,
          configPlaceholder: true,
          lastSyncAt: true,
        },
      }),
      prisma.integrationCredential.findMany({
        where: { tenantId: user.tenantId },
        select: { provider: true, key: true, lastFour: true },
      }),
    ]);
    const setupIntegrations = buildIntegrationSetupViews(integrationRecords, process.env, integrationCredentials);

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
          setupIntegrations,
          canManageSetup: user.role === UserRole.PLATFORM_OWNER || user.role === UserRole.BRAND_ADMIN || user.role === UserRole.REGIONAL_MANAGER,
          integrations: setupIntegrations.map((integration) => ({
            name: integration.name,
            purpose: integration.purpose,
            status: integration.status,
            detail: integration.detail,
          })),
        }}
      />
    );
  }

  if (slug === "center-dashboard") {
    const center = centers.find((item) => item.id === user.primaryCenterId) ?? centers[0];
    const centerDay = centerServiceDayWindow(today, center);
    const centerWhere = center ? { centerId: center.id } : { centerId: "__none__" };
    const [leads, highIntentLeads, staff, classrooms, toursUpcoming, openTasks, recentLeads, fteReports, ftePrefills, staffClockProfiles] = await Promise.all([
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
      center ? buildFtePrefills([center]) : [],
      center
        ? prisma.staffProfile.findMany({
            where: { centerId: center.id, user: { role: UserRole.TEACHER, isActive: true } },
            select: { customFields: true },
            take: 500,
          })
        : [],
    ]);
    const currentFteWeekStart = startOfFteWeek(today);
    const currentWeekFteReport = fteReports.find((report) => report.weekStart.getTime() === currentFteWeekStart.getTime());
    const latestFteReport = fteReports[0];
    const staffClockSummaries = staffClockProfiles.map((profile) =>
      readStaffClockSummary(profile.customFields, { startDate: centerDay.start, endDate: centerDay.end, now: today }),
    );
    const staffClockStates = staffClockProfiles.map((profile) => readStaffClockState(profile.customFields));

    return (
      <CenterDashboardPage
        data={{
          centerId: center?.id ?? null,
          centerName: center?.crmLocationId ?? center?.name ?? "No center assigned",
          place: [center?.city, center?.state].filter(Boolean).join(", "),
          fteCenters: center ? [{ id: center.id, name: formatCenterName(center), licensedCapacity: center.licensedCapacity }] : [],
          ftePrefills,
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
            staffClockedIn: staffClockStates.filter((state) => state.status === "clocked_in").length,
            staffHoursToday: staffClockSummaries.reduce((sum, summary) => sum + summary.totalMinutes, 0),
          },
          recentLeads,
        }}
      />
    );
  }

  if (slug === "classroom-dashboard") {
    const classroomWhere: Prisma.ClassroomWhereInput = { centerId: scopedCenterIds };
    const liveChildWhere: Prisma.ChildWhereInput = {
      AND: [
        currentlyEnrolledChildWhere(),
        { classroom: { is: classroomWhere } },
      ],
    };
    const [classrooms, classroomStaff, liveChildren] = await Promise.all([
      prisma.classroom.findMany({
        where: classroomWhere,
        orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { name: "asc" }],
        take: 150,
        include: {
          center: { select: { name: true, crmLocationId: true, state: true, licensedCapacity: true, customFields: true } },
          _count: {
            select: {
              children: { where: currentlyEnrolledChildWhere() },
              staff: { where: { user: { role: UserRole.TEACHER, isActive: true } } },
              dailyReports: true,
              incidents: true,
            },
          },
        },
      }),
      prisma.staffProfile.findMany({
        where: { centerId: scopedCenterIds, user: { role: UserRole.TEACHER, isActive: true } },
        orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { user: { name: "asc" } }],
        take: 250,
        select: {
          id: true,
          centerId: true,
          classroomId: true,
          title: true,
          user: { select: { name: true, email: true, isActive: true } },
          classroom: { select: { id: true, name: true } },
        },
      }),
      prisma.child.findMany({
        where: liveChildWhere,
        orderBy: [{ classroom: { name: "asc" } }, { fullName: "asc" }],
        take: 500,
        select: {
          id: true,
          fullName: true,
          ageGroup: true,
          classroomId: true,
          classroom: { select: { id: true, name: true, centerId: true } },
          liveLocation: {
            select: {
              currentClassroomId: true,
              areaName: true,
              status: true,
              movedAt: true,
              reason: true,
              currentClassroom: { select: { id: true, name: true } },
              movedBy: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const demoMode = showDemoFallbackData && classrooms.length === 0;
    const classroomAgeGroups = mergeAgeGroupOptions(
      centers.map((center) => dashboardOptionsFromCustomFields(center.customFields).ageGroups),
      classrooms.map((classroom) => classroom.ageGroup),
    );

    return (
      <ClassroomDashboardPage
        data={{
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          classrooms: demoMode
            ? executiveClassroomDemoRows
            : classrooms.map((classroom) => ({
                id: classroom.id,
                centerId: classroom.centerId,
                name: classroom.name,
                ageGroup: classroom.ageGroup,
                capacity: classroom.capacity,
                center: { name: classroom.center.name, crmLocationId: classroom.center.crmLocationId },
                _count: classroom._count,
                ratioRule: resolveClassroomRatioRule({
                  ratioRule: classroom.ratioRule,
                  ageGroup: classroom.ageGroup,
                  state: classroom.center.state,
                  licensingRatioRules: readCenterLicensingConfiguration(classroom.center.customFields, {
                    centerState: classroom.center.state,
                    licensedCapacity: classroom.center.licensedCapacity,
                  }).ratioRules.value,
                }),
              })),
          staff: demoMode ? [] : classroomStaff,
          liveTrackerClassrooms: (demoMode ? executiveClassroomDemoRows : classrooms.map((classroom) => ({
            id: classroom.id,
            centerId: classroom.centerId,
            name: classroom.name,
            ageGroup: classroom.ageGroup,
            capacity: classroom.capacity,
            center: { name: classroom.center.name, crmLocationId: classroom.center.crmLocationId },
            _count: classroom._count,
            ratioRule: resolveClassroomRatioRule({
              ratioRule: classroom.ratioRule,
              ageGroup: classroom.ageGroup,
              state: classroom.center.state,
              licensingRatioRules: readCenterLicensingConfiguration(classroom.center.customFields, {
                centerState: classroom.center.state,
                licensedCapacity: classroom.center.licensedCapacity,
              }).ratioRules.value,
            }),
          }))).map((classroom) => ({
            id: classroom.id,
            centerId: classroom.centerId,
            centerName: classroom.center.crmLocationId ?? classroom.center.name,
            name: classroom.name,
            ageGroup: classroom.ageGroup,
            capacity: classroom.capacity,
            ratioRule: classroom.ratioRule,
            assignedStaff: classroom._count.staff,
          })),
          liveTrackerChildren: demoMode ? [] : liveChildren.map((child) => ({
            id: child.id,
            fullName: child.fullName,
            ageGroup: child.ageGroup,
            centerId: child.classroom?.centerId ?? null,
            assignedClassroomId: child.classroomId,
            assignedClassroomName: child.classroom?.name ?? null,
            currentClassroomId: child.liveLocation?.currentClassroomId ?? child.classroomId,
            currentClassroomName: child.liveLocation?.currentClassroom?.name ?? child.classroom?.name ?? null,
            areaName: child.liveLocation?.areaName ?? null,
            status: child.liveLocation?.status ?? "in_classroom",
            movedAt: child.liveLocation?.movedAt?.toISOString() ?? null,
            movedByName: child.liveLocation?.movedBy?.name ?? null,
            reason: child.liveLocation?.reason ?? null,
          })),
          ageGroups: classroomAgeGroups,
          canManageClassroomSetup: canManageOperations(user),
          canMoveChildren: canManageClassroomTasks(user),
          demoMode,
        }}
      />
    );
  }

  if (slug === "attendance") {
    const attendanceCenter = !allCenters
      ? centers.find((item) => item.id === user.primaryCenterId) ?? centers[0] ?? null
      : null;
    const attendanceDay = attendanceCenter
      ? centerServiceDayWindow(today, attendanceCenter)
      : { start: startOfDay, end: endOfDay };
    const attendanceWhere: Prisma.AttendanceRecordWhereInput = allCenters
      ? {}
      : { classroom: { is: { centerId: scopedCenterIds } } };
    const checkLogWhere: Prisma.CheckInOutLogWhereInput = {
      occurredAt: { gte: attendanceDay.start, lt: attendanceDay.end },
      ...(allCenters ? {} : { centerId: scopedCenterIds }),
    };
    const [records, total, present, absent, checkLogs] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: attendanceWhere,
        orderBy: { date: "desc" },
        take: 100,
        include: {
          child: { select: { id: true, fullName: true, ageGroup: true, family: { select: { id: true, name: true } } } },
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
      prisma.checkInOutLog.findMany({
        where: checkLogWhere,
        orderBy: { occurredAt: "desc" },
        take: 200,
        include: {
          child: { select: { id: true, fullName: true, ageGroup: true } },
          guardian: { select: { fullName: true, email: true } },
          classroom: { select: { name: true } },
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
    ]);

    const latestByChild = new Map<string, (typeof checkLogs)[number]>();
    for (const log of checkLogs) {
      const current = latestByChild.get(log.childId);
      if (!current || log.occurredAt > current.occurredAt) latestByChild.set(log.childId, log);
    }
    const metadataFor = (value: Prisma.JsonValue | null) =>
      value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const reconciliationLogs = checkLogs.map((log) => {
      const metadata = metadataFor(log.metadata);
      return {
        id: log.id,
        type: log.type,
        occurredAt: log.occurredAt,
        pickupName: log.pickupName,
        verificationStatus: log.verificationStatus,
        pinVerified: log.pinVerified,
        signatureCaptured: Boolean(log.signaturePlaceholder || metadata.signatureName),
        latePickup: metadata.latePickup === true,
        pickupAuthorizationWarning: metadata.pickupAuthorizationWarning === true,
        child: log.child,
        guardian: log.guardian,
        classroom: log.classroom,
        center: log.center,
      };
    });
    const stillCheckedIn = Array.from(latestByChild.values()).filter((log) => log.type === "check_in").length;

    return (
      <AttendancePage
        data={{
          records,
          stats: { total, present, absent, other: Math.max(total - present - absent, 0) },
          reconciliation: {
            serviceDate: startOfDay.toISOString(),
            checkIns: checkLogs.filter((log) => log.type === "check_in").length,
            checkOuts: checkLogs.filter((log) => log.type === "check_out").length,
            stillCheckedIn,
            latePickups: reconciliationLogs.filter((log) => log.latePickup).length,
            authorizationWarnings: reconciliationLogs.filter((log) => log.pickupAuthorizationWarning).length,
            signaturesCaptured: reconciliationLogs.filter((log) => log.signatureCaptured).length,
            pinVerified: reconciliationLogs.filter((log) => log.pinVerified).length,
            qrVerified: reconciliationLogs.filter((log) => log.verificationStatus === "qr_verified").length,
            staffVerified: reconciliationLogs.filter((log) => log.verificationStatus === "staff_verified").length,
            logs: reconciliationLogs,
          },
        }}
      />
    );
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

    const demoMode = showDemoFallbackData && reports.length === 0;
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
              family: { select: { id: true, name: true, centerId: true } },
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
          ? { ...currentlyEnrolledChildWhere(), photoVideoPermission: false }
          : { ...currentlyEnrolledChildWhere(), photoVideoPermission: false, family: { is: { centerId: scopedCenterIds } } },
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
    const staffWhere = visibleTeacherStaffWhere(scopedCenterIds);
    const certificationWhere: Prisma.CertificationWhereInput = allCenters
      ? { staff: { user: { role: UserRole.TEACHER, isActive: true } }, expiresAt: { lte: thirtyDays } }
      : { staff: { centerId: scopedCenterIds, user: { role: UserRole.TEACHER, isActive: true } }, expiresAt: { lte: thirtyDays } };
    const staff = await prisma.staffProfile.findMany({
      where: staffWhere,
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 200,
      include: {
        user: { select: { name: true, email: true, role: true, isActive: true, customFields: true } },
        center: { select: { id: true, name: true, crmLocationId: true, state: true, licensedCapacity: true, customFields: true } },
        classroom: { select: { id: true, name: true } },
        certifications: { orderBy: [{ expiresAt: "asc" }, { name: "asc" }] },
      },
    });
    const classrooms = await prisma.classroom.findMany({
      where: { centerId: scopedCenterIds },
      orderBy: [{ centerId: "asc" }, { ageGroup: "asc" }, { name: "asc" }],
      take: 300,
      select: { id: true, centerId: true, name: true, ageGroup: true },
    });
    const schedules = await prisma.staffSchedule.findMany({
      where: { centerId: scopedCenterIds, startsAt: { gte: startOfDay }, staff: { user: { role: UserRole.TEACHER, isActive: true } } },
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
    const staffWithProfilePhotos = await Promise.all(
      sortedStaff.map(async (profile) => ({
        ...profile,
        user: {
          ...profile.user,
          profilePhotoUrl: await signedProfilePhotoUrl(profile.user.customFields),
        },
      })),
    );
    const activeStaff = staffWithProfilePhotos.filter((profile) => profile.user.isActive);
    const previousStaff = staffWithProfilePhotos.filter((profile) => !profile.user.isActive);
    const total = activeStaff.length;
    const activeUsers = activeStaff.length;
    const expiringCerts = await prisma.certification.count({ where: certificationWhere });
    const backgroundPending = activeStaff.filter((profile) => profile.backgroundCheckStatus !== "placeholder_clear").length;
    const staffChecklistItems = buildRequiredDocumentChecklist({
      families: [],
      staff: activeStaff,
      now: today,
    });
    const staffChecklist = {
      items: staffChecklistItems,
      summary: summarizeRequiredDocumentChecklist(staffChecklistItems),
    };

    return (
      <StaffPage
        data={{
          timeClockSummaryGeneratedAt: today.toISOString(),
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          classrooms,
          schedules,
          staff: activeStaff,
          previousStaff,
          canManageCompensation: canManageStaffCompensation(user),
          stats: { total, activeUsers, expiringCerts, backgroundPending, onboardingActionNeeded: staffChecklist.summary.actionNeeded },
          staffChecklist,
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

    return (
      <FormsPage
        data={{
          forms,
          submissions: submissions.map((submission) => ({
            ...submission,
            reviewStatus: registrationReviewFromData(submission.data).status,
            registrationPayment: registrationPaymentFromData(submission.data),
            summary: registrationSubmissionSummary(submission.data),
          })),
        }}
      />
    );
  }

  if (slug === "documents") {
    if (user.role === UserRole.TEACHER && !allCenters) {
      const staffProfile = await prisma.staffProfile.findUnique({
        where: { userId: user.id },
        select: { centerId: true, classroomId: true },
      });
      const teacherChildScopeWhere: Prisma.ChildWhereInput = staffProfile?.classroomId
        ? { classroomId: staffProfile.classroomId }
        : staffProfile?.centerId
          ? { classroom: { is: { centerId: staffProfile.centerId } } }
          : { id: "__no_teacher_child_scope__" };
      const teacherChildWhere: Prisma.ChildWhereInput = { AND: [teacherChildScopeWhere, currentlyEnrolledChildWhere()] };
      const teacherChildren = await prisma.child.findMany({
        where: teacherChildWhere,
        orderBy: [{ classroom: { name: "asc" } }, { fullName: "asc" }],
        take: 120,
        select: {
          id: true,
          fullName: true,
          preferredName: true,
          ageGroup: true,
          enrollmentStatus: true,
          photoVideoPermission: true,
          fieldTripPermission: true,
          napNotes: true,
          feedingNotes: true,
          pottyNotes: true,
          classroom: { select: { name: true } },
          family: { select: { name: true, custodyNotes: true } },
          allergies: { select: { id: true, allergen: true, severity: true, actionPlan: true }, orderBy: { severity: "desc" } },
          medicalNotes: {
            select: { id: true, category: true, note: true, restricted: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      const teacherChildIds = teacherChildren.map((child) => child.id);
      const teacherDocuments = teacherChildIds.length
        ? await prisma.document.findMany({
            where: { childId: { in: teacherChildIds } },
            orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
            take: 200,
            include: {
              family: { select: { name: true, custodyNotes: true } },
              child: { select: { fullName: true, family: { select: { centerId: true, custodyNotes: true } } } },
            },
          })
        : [];
      const visibleTeacherDocuments = teacherDocuments.filter(teacherCanViewDocument);
      const signedTeacherDocuments = await signDocumentRecords(visibleTeacherDocuments);
      const documentsByChildId = new Map<string, typeof signedTeacherDocuments>();
      for (const document of signedTeacherDocuments) {
        if (!document.childId) continue;
        const current = documentsByChildId.get(document.childId) ?? [];
        current.push(document);
        documentsByChildId.set(document.childId, current);
      }

      return (
        <TeacherDocumentsPage
          data={{
            children: teacherChildren.map((child) => ({
              ...child,
              documents: documentsByChildId.get(child.id) ?? [],
            })),
            stats: {
              children: teacherChildren.length,
              allergies: teacherChildren.reduce((sum, child) => sum + child.allergies.length, 0),
              medicalNotes: teacherChildren.reduce((sum, child) => sum + child.medicalNotes.length, 0),
              documents: signedTeacherDocuments.length,
            },
          }}
        />
      );
    }

    const documentWhere: Prisma.DocumentWhereInput = allCenters
      ? {}
      : {
          OR: [
            { family: { is: { centerId: scopedCenterIds } } },
            { child: { is: { family: { is: { centerId: scopedCenterIds } } } } },
          ],
        };
    const [documents, total, expiring, restricted, pending, signatureFamilies, checklistFamilies, checklistStaff] = await Promise.all([
      prisma.document.findMany({
        where: documentWhere,
        orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          family: { select: { name: true, custodyNotes: true } },
          child: { select: { fullName: true, family: { select: { centerId: true, custodyNotes: true } } } },
        },
      }),
      prisma.document.count({ where: documentWhere }),
      prisma.document.count({ where: { ...documentWhere, expiresAt: { lte: thirtyDays } } }),
      prisma.document.count({ where: { ...documentWhere, restricted: true } }),
      prisma.document.count({ where: { ...documentWhere, status: DocumentStatus.REQUESTED } }),
      prisma.family.findMany({
        where: allCenters
          ? { children: { some: currentlyEnrolledChildWhere() } }
          : { centerId: scopedCenterIds, children: { some: currentlyEnrolledChildWhere() } },
        orderBy: { name: "asc" },
        take: 250,
        select: {
          id: true,
          name: true,
          billingEmail: true,
          guardians: { select: { fullName: true, email: true }, orderBy: { fullName: "asc" } },
          children: { where: currentlyEnrolledChildWhere(), select: { id: true, fullName: true }, orderBy: { fullName: "asc" } },
        },
      }),
      prisma.family.findMany({
        where: allCenters
          ? { children: { some: currentlyEnrolledChildWhere() } }
          : { centerId: scopedCenterIds, children: { some: currentlyEnrolledChildWhere() } },
        orderBy: { name: "asc" },
        take: 250,
        select: {
          id: true,
          name: true,
          centerId: true,
          documents: { select: { id: true, name: true, type: true, status: true, expiresAt: true } },
          children: {
            where: currentlyEnrolledChildWhere(),
            select: {
              id: true,
              fullName: true,
              documents: { select: { id: true, name: true, type: true, status: true, expiresAt: true } },
            },
            orderBy: { fullName: "asc" },
          },
        },
      }),
      prisma.staffProfile.findMany({
        where: allCenters ? { user: { isActive: true } } : { centerId: scopedCenterIds, user: { isActive: true } },
        orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { user: { name: "asc" } }],
        take: 250,
        select: {
          id: true,
          title: true,
          user: { select: { name: true } },
          center: { select: { name: true, crmLocationId: true, state: true, licensedCapacity: true, customFields: true } },
          certifications: { select: { id: true, name: true, status: true, expiresAt: true } },
        },
      }),
    ]);
    const signedDocuments = await signDocumentRecords(documents);
    const centersById = new Map(centers.map((center) => [center.id, { name: center.name, crmLocationId: center.crmLocationId }]));
    const requiredChecklistItems = buildRequiredDocumentChecklist({
      families: checklistFamilies.map((family) => ({
        ...family,
        center: family.centerId ? centersById.get(family.centerId) ?? null : null,
      })),
      staff: checklistStaff,
      now: today,
    });
    const requiredChecklist = {
      items: requiredChecklistItems,
      summary: summarizeRequiredDocumentChecklist(requiredChecklistItems),
    };

    return <DocumentsPage data={{ documents: signedDocuments, stats: { total, expiring, restricted, pending }, requiredChecklist, signatureFamilies }} />;
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
      ? { child: currentlyEnrolledChildWhere() }
      : { child: { ...currentlyEnrolledChildWhere(), family: { is: { centerId: scopedCenterIds } } } };
    const medicalWhere: Prisma.ChildMedicalNoteWhereInput = allCenters
      ? { restricted: true, child: currentlyEnrolledChildWhere() }
      : { restricted: true, child: { ...currentlyEnrolledChildWhere(), family: { is: { centerId: scopedCenterIds } } } };

    const medicationWhere: Prisma.MedicationLogWhereInput = allCenters
      ? { child: currentlyEnrolledChildWhere() }
      : { child: { ...currentlyEnrolledChildWhere(), family: { is: { centerId: scopedCenterIds } } } };
    const childWhere: Prisma.ChildWhereInput = allCenters
      ? currentlyEnrolledChildWhere()
      : { ...currentlyEnrolledChildWhere(), family: { is: { centerId: scopedCenterIds } } };
    const emergencyDrillWhere: Prisma.EmergencyDrillLogWhereInput = allCenters
      ? {}
      : { centerId: scopedCenterIds };
    const complianceTaskWhere: Prisma.ComplianceTaskWhereInput = allCenters
      ? {}
      : { centerId: scopedCenterIds };
    const openComplianceTaskWhere: Prisma.ComplianceTaskWhereInput = {
      ...complianceTaskWhere,
      status: { notIn: ["completed", "canceled"] },
    };
    const complianceStaffWhere: Prisma.UserWhereInput = {
      tenantId: user.tenantId,
      isActive: true,
      role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN, UserRole.TEACHER] },
      ...(allCenters
        ? {}
        : {
            OR: [
              { staffProfile: { centerId: scopedCenterIds } },
              { accessGrants: { some: { isActive: true, centerId: scopedCenterIds } } },
            ],
          }),
    };

    const [
      pendingIncidents,
      expiringCertifications,
      expiringDocuments,
      allergyCount,
      restrictedMedicalNotes,
      medicationLogCount,
      emergencyDrillCount,
      openComplianceTaskCount,
      certifications,
      allergies,
      medicationLogs,
      medicationChildren,
      emergencyDrillLogs,
      complianceTasks,
      complianceReminderCandidates,
      complianceStaffUsers,
    ] = await Promise.all([
      prisma.incidentReport.count({ where: incidentWhere }),
      prisma.certification.count({ where: certificationWhere }),
      prisma.document.count({ where: documentWhere }),
      prisma.allergy.count({ where: allergyWhere }),
      prisma.childMedicalNote.count({ where: medicalWhere }),
      prisma.medicationLog.count({ where: medicationWhere }),
      prisma.emergencyDrillLog.count({ where: emergencyDrillWhere }),
      prisma.complianceTask.count({ where: openComplianceTaskWhere }),
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
      prisma.medicationLog.findMany({
        where: medicationWhere,
        orderBy: { administeredAt: "desc" },
        take: 50,
        include: {
          child: { select: { fullName: true, family: { select: { name: true, centerId: true } } } },
          administeredBy: { select: { name: true, email: true } },
        },
      }),
      prisma.child.findMany({
        where: childWhere,
        orderBy: [{ family: { name: "asc" } }, { fullName: "asc" }],
        take: 500,
        select: {
          id: true,
          fullName: true,
          family: { select: { name: true, centerId: true, custodyNotes: true } },
        },
      }),
      prisma.emergencyDrillLog.findMany({
        where: emergencyDrillWhere,
        orderBy: { conductedAt: "desc" },
        take: 20,
        include: {
          center: { select: { name: true, crmLocationId: true } },
          createdBy: { select: { name: true, email: true } },
        },
      }),
      prisma.complianceTask.findMany({
        where: complianceTaskWhere,
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        take: 50,
        include: {
          center: { select: { name: true, crmLocationId: true } },
          assignedTo: { select: { name: true, email: true } },
          createdBy: { select: { name: true, email: true } },
        },
      }),
      prisma.complianceTask.findMany({
        where: openComplianceTaskWhere,
        take: 1000,
        select: { status: true, dueAt: true, reminderAt: true },
      }),
      prisma.user.findMany({
        where: complianceStaffWhere,
        orderBy: { name: "asc" },
        take: 300,
        select: {
          id: true,
          name: true,
          email: true,
          staffProfile: { select: { centerId: true } },
          accessGrants: {
            where: { isActive: true, ...(allCenters ? {} : { centerId: scopedCenterIds }) },
            select: { centerId: true },
            take: 1,
          },
        },
      }),
    ]);
    const licensingCenters = centers.map((center) => ({
      id: center.id,
      name: center.name,
      crmLocationId: center.crmLocationId,
      state: center.state,
      licensedCapacity: center.licensedCapacity,
      licensingConfiguration: readCenterLicensingConfiguration(center.customFields, {
        centerState: center.state,
        licensedCapacity: center.licensedCapacity,
      }),
    }));
    const complianceCentersById = new Map(centers.map((center) => [center.id, { name: center.name, crmLocationId: center.crmLocationId }]));

    return (
      <CompliancePage
        data={{
          centers: licensingCenters,
          canManageLicensing: canManageOperations(user),
          stats: {
            pendingIncidents,
            expiringCertifications,
            expiringDocuments,
            allergies: allergyCount,
            restrictedMedicalNotes,
            medicationLogs: medicationLogCount,
            emergencyDrills: emergencyDrillCount,
            openComplianceTasks: openComplianceTaskCount,
            dueComplianceReminders: complianceReminderCandidates.filter((task) => complianceTaskNeedsReminder({ ...task, now: today })).length,
          },
          certifications,
          allergies,
          medicationLogs,
          medicationChildren: medicationChildren.map((child) => ({
            id: child.id,
            fullName: child.fullName,
            familyName: child.family.name,
            centerLabel: child.family.centerId
              ? complianceCentersById.get(child.family.centerId)?.crmLocationId ?? complianceCentersById.get(child.family.centerId)?.name ?? null
              : null,
          })),
          emergencyDrillLogs,
          complianceTasks,
          complianceStaffOptions: complianceStaffUsers.map((staff) => ({
            id: staff.id,
            name: staff.name,
            email: staff.email,
            centerId: staff.staffProfile?.centerId ?? staff.accessGrants[0]?.centerId ?? null,
          })),
        }}
      />
    );
  }

  if (slug === "help") {
    const supportAuditWhere: Prisma.AuditLogWhereInput = {
      tenantId: user.tenantId,
      action: { contains: "support" },
      ...(canManageOperations(user)
        ? tenantWide
          ? {}
          : { OR: [{ centerId: scopedCenterIds }, { userId: user.id }] }
        : { userId: user.id }),
    };
    const documentScopeWhere: Prisma.DocumentWhereInput = {
      expiresAt: {
        gte: today,
        lte: thirtyDays,
      },
      OR: [
        { family: { centerId: scopedCenterIds } },
        { child: { family: { centerId: scopedCenterIds } } },
      ],
    };
    const userNotificationWhere: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...activeNotificationWhere(today),
    };
    const [
      unreadNotifications,
      notifications,
      openTasks,
      unreadMessages,
      expiringDocuments,
      supportEvents,
    ] = await Promise.all([
      prisma.notification.count({
        where: userNotificationWhere,
      }),
      prisma.notification.findMany({
        where: userNotificationWhere,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 12,
        select: {
          id: true,
          title: true,
          body: true,
          type: true,
          priority: true,
          createdAt: true,
        },
      }),
      prisma.task.count({
        where: {
          status: { not: "done" },
          lead: { centerId: scopedCenterIds },
        },
      }),
      prisma.message.count({
        where: {
          readAt: null,
          family: { centerId: scopedCenterIds },
        },
      }),
      prisma.document.count({ where: documentScopeWhere }),
      prisma.auditLog.findMany({
        where: supportAuditWhere,
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          createdAt: true,
          metadata: true,
          user: { select: { name: true, email: true } },
          center: { select: { name: true, crmLocationId: true } },
        },
      }),
    ]);

    return (
      <HelpPage
        data={{
          canManageOperations: canManageOperations(user),
          centers: centers.map((center) => ({ id: center.id, name: formatCenterName(center) })),
          stats: {
            unreadNotifications,
            openTasks,
            unreadMessages,
            expiringDocuments,
          },
          notifications,
          supportEvents,
        }}
      />
    );
  }

  return null;
}

export default async function SlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  return renderAuthenticatedModulePage(slug, resolvedSearchParams);
}

export async function renderAuthenticatedModulePage(
  slug: string,
  resolvedSearchParams: Record<string, string | string[] | undefined> = {},
) {
  if (slug === "forgot-password" || slug === "onboarding") {
    return <AuthLikePage type={slug} nextPath={safeAuthNextPath(resolvedSearchParams.next)} />;
  }

  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) {
    redirect(`/login?next=/${encodeURIComponent(slug)}`);
  }
  if (requiresPasswordResetGate(user)) {
    redirect(`/reset-password?force=1&next=/${encodeURIComponent(slug)}`);
  }

  if (slug === "teacher-portal" && !canAccessModule(user, slug)) {
    redirect(canAccessModule(user, "classroom-dashboard") ? "/classroom-dashboard" : "/dashboard");
  }

  if (!canAccessModule(user, slug)) {
    notFound();
  }

  const livePage = await renderLivePage(slug, user, resolvedSearchParams);
  if (livePage) {
    return <AppShell currentUser={user}>{livePage}</AppShell>;
  }

  notFound();
}
