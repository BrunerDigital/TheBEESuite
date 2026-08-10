import { EnrollmentStage, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { centerServiceDayWindow, readCenterTimeZone } from "@/lib/attendance-state";
import { getLeadScopeWhere, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REPORT_DEFINITIONS, type ReportKind } from "@/lib/reporting-analytics-shared";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { readSchoolEin } from "@/lib/school-tax-id";
import { formatStaffDecimalHours, readStaffClockState, readStaffClockSummary } from "@/lib/staff-kiosk";
import { zonedDateKey } from "@/lib/zoned-date-time";

export { REPORT_DEFINITIONS } from "@/lib/reporting-analytics-shared";
export type { ReportKind } from "@/lib/reporting-analytics-shared";
export type ReportFormat = "csv" | "pdf";

export type ReportCenterOption = {
  id: string;
  name: string;
  label: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  address?: string | null;
  phone?: string | null;
  schoolEin?: string | null;
  timezone: string;
};

export type EnrollmentStatusReportRow = {
  childId: string;
  centerId: string;
  centerLabel: string;
  groupLabel: string;
  groupSortOrder: number;
  statusDate: string | null;
  childName: string;
  gender: string;
  dateOfBirth: string | null;
  ageInMonths: number | null;
  ageLabel: string;
  enrollmentStatus: string;
};

export type LeadSourceReportRow = {
  source: string;
  centerId: string;
  centerLabel: string;
  leads: number;
  tours: number;
  applications: number;
  enrolled: number;
  waitlisted: number;
  conversionRate: number;
};

export type FunnelStageReportRow = {
  stage: string;
  count: number;
  share: number;
};

export type AttendanceTrendReportRow = {
  date: string;
  centerId: string;
  centerLabel: string;
  present: number;
  absent: number;
  checkIns: number;
  checkOuts: number;
  attendanceRate: number;
};

export type BillingReportRow = {
  period: string;
  centerId: string;
  centerLabel: string;
  invoiceCents: number;
  paidCents: number;
  openCents: number;
  overdueCents: number;
  invoiceCount: number;
  paymentCount: number;
};

export type BillingReportInterval = "daily" | "weekly" | "monthly";

export type MessageAnalyticsReportRow = {
  centerId: string;
  centerLabel: string;
  parentMessages: number;
  staffReplies: number;
  unreadMessages: number;
  avgResponseHours: number | null;
  responseRate: number;
};

export type StaffHoursReportRow = {
  staffId: string;
  staffName: string;
  staffEmail: string;
  title: string;
  centerId: string;
  centerLabel: string;
  classroomName: string;
  status: "clocked_in" | "clocked_out";
  totalMinutes: number;
  closedShiftMinutes: number;
  openShiftMinutes: number;
  closedShiftCount: number;
  lastActionAt: string | null;
  openShiftStartedAt: string | null;
  activeUser: boolean;
};

export type AnalyticsReportData = {
  generatedAt: string;
  range: {
    startDate: string;
    endDate: string;
  };
  scope: {
    centerIds: string[];
    centerLabels: string[];
  };
  centers: ReportCenterOption[];
  enrollmentStatus: EnrollmentStatusReportRow[];
  leadSources: LeadSourceReportRow[];
  funnelStages: FunnelStageReportRow[];
  attendanceTrends: AttendanceTrendReportRow[];
  billing: BillingReportRow[];
  weeklyBilling: BillingReportRow[];
  weeklyPayments: BillingReportRow[];
  messages: MessageAnalyticsReportRow[];
  staffHours: StaffHoursReportRow[];
  totals: {
    leadCount: number;
    enrolledCount: number;
    leadConversionRate: number;
    presentCount: number;
    absentCount: number;
    attendanceRate: number;
    invoiceCents: number;
    paidCents: number;
    openCents: number;
    overdueCents: number;
    parentMessages: number;
    unreadMessages: number;
    avgResponseHours: number | null;
    staffHoursMinutes: number;
    staffOpenShiftMinutes: number;
    staffClockedIn: number;
    currentEnrollmentCount: number;
  };
};

export type AnalyticsReportFilters = {
  startDate?: Date | null;
  endDate?: Date | null;
  centerId?: string | null;
};

const noVisibleCenterId = "__no_visible_centers__";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function defaultReportRange(now = new Date()) {
  const endDate = endOfDay(now);
  const startDate = startOfDay(new Date(now));
  startDate.setDate(startDate.getDate() - 365);
  return { startDate, endDate };
}

export function parseReportDate(value: string | null) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeReportFilters(input: {
  start?: string | null;
  end?: string | null;
  range?: string | null;
  centerId?: string | null;
}, now = new Date()): AnalyticsReportFilters {
  const range = input.range || "";
  const endDate = parseReportDate(input.end ?? null) ?? endOfDay(now);
  let startDate = parseReportDate(input.start ?? null);
  if (!startDate && range && range !== "all") {
    const days = Math.max(1, Math.min(Number(range) || 90, 366));
    startDate = startOfDay(new Date(endDate));
    startDate.setDate(startDate.getDate() - (days - 1));
  }
  return {
    startDate: startDate ? startOfDay(startDate) : undefined,
    endDate: endOfDay(endDate),
    centerId: input.centerId && input.centerId !== "all" ? input.centerId : null,
  };
}

function centerIdFilter(centerIds: string[]) {
  return centerIds.length ? { in: centerIds } : { in: [noVisibleCenterId] };
}

function centerLabel(center: { name: string; crmLocationId: string | null }) {
  return center.crmLocationId ?? center.name;
}

function weeklyPeriodKey(value: Date | string, timeZone: string) {
  const localDateKey = zonedDateKey(value, timeZone);
  const localDate = new Date(`${localDateKey}T12:00:00.000Z`);
  const weekday = localDate.getUTCDay();
  localDate.setUTCDate(localDate.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  const weekStart = localDate.toISOString().slice(0, 10);
  localDate.setUTCDate(localDate.getUTCDate() + 6);
  return `${weekStart} to ${localDate.toISOString().slice(0, 10)}`;
}

function billingPeriodKey(value: Date | string, interval: BillingReportInterval, timeZone: string) {
  if (interval === "weekly") return weeklyPeriodKey(value, timeZone);
  const localDateKey = zonedDateKey(value, timeZone);
  return interval === "daily" ? localDateKey : localDateKey.slice(0, 7);
}

function periodKey(value: Date | string, daily: boolean) {
  const date = new Date(value);
  const iso = date.toISOString();
  return daily ? iso.slice(0, 10) : iso.slice(0, 7);
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addCents(current: number | undefined, amount: number) {
  return (current ?? 0) + amount;
}

function safeNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isPresentStatus(status: string) {
  const normalized = status.toLowerCase();
  return ["present", "checked_in", "checked-out", "checked_out", "in_attendance"].includes(normalized);
}

function isAbsentStatus(status: string) {
  return status.toLowerCase().includes("absent");
}

function exportCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

async function getAccessibleCenters(user: CurrentUser) {
  const centers = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, crmLocationId: true, address: true, city: true, state: true, postalCode: true, phone: true, timezone: true, customFields: true },
  });
  return centers.map((center) => ({
    id: center.id,
    name: center.name,
    label: centerLabel(center),
    city: center.city,
    state: center.state,
    postalCode: center.postalCode,
    address: center.address,
    phone: center.phone,
    schoolEin: readSchoolEin(center.customFields),
    timezone: readCenterTimeZone(center),
  }));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readEnrollmentReportGender(customFields: unknown) {
  const fields = record(customFields);
  const rawData = record(fields.rawData);
  const sourceFields = record(fields.sourceFields);
  const value = cleanText(
    fields.gender ?? fields.sex ?? fields.childGender
    ?? rawData.gender ?? rawData.Gender ?? rawData.sex ?? rawData.Sex
    ?? sourceFields.gender ?? sourceFields.sex,
  );
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "f" || normalized === "female") return "Female";
  if (normalized === "m" || normalized === "male") return "Male";
  if (normalized === "nonbinary" || normalized === "nonbinarygender") return "Nonbinary";
  return value || "Not set";
}

export function childAgeInMonths(dateOfBirth: Date, asOf: Date, timeZone = "UTC") {
  const [birthYear, birthMonth, birthDay] = zonedDateKey(dateOfBirth, "UTC").split("-").map(Number);
  const [asOfYear, asOfMonth, asOfDay] = zonedDateKey(asOf, timeZone).split("-").map(Number);
  return ((asOfYear - birthYear) * 12) + (asOfMonth - birthMonth) - (asOfDay < birthDay ? 1 : 0);
}

export function childAgeLabel(ageInMonths: number | null) {
  if (ageInMonths === null) return "DOB needs review";
  return `${Math.floor(ageInMonths / 12)} Yr - ${ageInMonths % 12} Mo`;
}

function enrollmentGroupSortOrder(label: string, ageInMonths: number | null) {
  const normalized = label.toLowerCase();
  if (/infant|baby/.test(normalized)) return 0;
  if (/\bone\b|toddler/.test(normalized)) return 12;
  if (/\btwo\b|twos|2['’]?s/.test(normalized)) return 24;
  if (/\bthree\b|threes|3['’]?s/.test(normalized)) return 36;
  if (/\bfour\b|fours|4['’]?s|preschool/.test(normalized)) return 48;
  if (/pre.?k|vpk/.test(normalized)) return 54;
  if (/school.?age|after.?school/.test(normalized)) return 60;
  return ageInMonths ?? 999;
}

type EnrollmentStatusChild = {
  id: string;
  fullName: string;
  dateOfBirth: Date;
  startDate: Date | null;
  ageGroup: string;
  enrollmentStatus: string;
  customFields: unknown;
  family: { centerId: string | null };
  classroom: { name: string; ageGroup: string; centerId: string } | null;
};

export function buildEnrollmentStatusReportRows(
  children: EnrollmentStatusChild[],
  centerById: Map<string, ReportCenterOption>,
  asOf: Date,
) {
  return children.flatMap((child): EnrollmentStatusReportRow[] => {
    const centerId = child.family.centerId;
    if (!centerId || !child.classroom || child.classroom.centerId !== centerId || !centerById.has(centerId)) return [];
    const fields = record(child.customFields);
    const missingDob = fields.dateOfBirthMissing === true || child.dateOfBirth.getUTCFullYear() <= 1900;
    const center = centerById.get(centerId)!;
    const ageInMonths = missingDob ? null : childAgeInMonths(child.dateOfBirth, asOf, center.timezone);
    if (ageInMonths !== null && (ageInMonths < 0 || ageInMonths > 120)) return [];
    const groupLabel = cleanText(child.classroom.name) || cleanText(child.classroom.ageGroup) || cleanText(child.ageGroup) || "Unassigned";
    return [{
      childId: child.id,
      centerId,
      centerLabel: center.label,
      groupLabel,
      groupSortOrder: enrollmentGroupSortOrder(groupLabel, ageInMonths),
      statusDate: child.startDate?.toISOString() ?? null,
      childName: child.fullName,
      gender: readEnrollmentReportGender(child.customFields),
      dateOfBirth: missingDob ? null : child.dateOfBirth.toISOString(),
      ageInMonths,
      ageLabel: childAgeLabel(ageInMonths),
      enrollmentStatus: child.enrollmentStatus,
    }];
  }).sort((left, right) =>
    left.centerLabel.localeCompare(right.centerLabel)
    || left.groupSortOrder - right.groupSortOrder
    || left.groupLabel.localeCompare(right.groupLabel)
    || String(left.statusDate ?? "9999").localeCompare(String(right.statusDate ?? "9999"))
    || left.childName.localeCompare(right.childName),
  );
}

function scopedCenterIds(centers: ReportCenterOption[], centerId?: string | null) {
  if (!centerId) return centers.map((center) => center.id);
  return centers.some((center) => center.id === centerId) ? [centerId] : [];
}

function dateFilter(startDate: Date, endDate: Date) {
  return { gte: startDate, lte: endDate };
}

function buildLeadReports(
  leads: Array<{
    centerId: string;
    leadSource: string | null;
    stage: EnrollmentStage;
    tours: Array<{ id: string }>;
    enrollments: Array<{ id: string }>;
  }>,
  centerById: Map<string, ReportCenterOption>,
) {
  const bySource = new Map<string, LeadSourceReportRow>();
  const stageCounts = new Map<string, number>();

  leads.forEach((lead) => {
    const source = lead.leadSource?.trim() || "Unknown";
    const center = centerById.get(lead.centerId);
    const key = `${lead.centerId}:${source}`;
    const row = bySource.get(key) ?? {
      source,
      centerId: lead.centerId,
      centerLabel: center?.label ?? "Unknown center",
      leads: 0,
      tours: 0,
      applications: 0,
      enrolled: 0,
      waitlisted: 0,
      conversionRate: 0,
    };
    row.leads += 1;
    row.tours += lead.tours.length ? 1 : 0;
    row.applications += lead.enrollments.length ? 1 : 0;
    row.enrolled += lead.stage === EnrollmentStage.ENROLLED ? 1 : 0;
    row.waitlisted += lead.stage === EnrollmentStage.WAITLISTED ? 1 : 0;
    row.conversionRate = percent(row.enrolled, row.leads);
    bySource.set(key, row);
    stageCounts.set(lead.stage, (stageCounts.get(lead.stage) ?? 0) + 1);
  });

  const totalLeads = leads.length;
  const funnelStages = Array.from(stageCounts.entries())
    .map(([stage, count]) => ({ stage, count, share: percent(count, totalLeads) }))
    .sort((a, b) => b.count - a.count);

  return {
    leadSources: Array.from(bySource.values()).sort((a, b) => b.leads - a.leads),
    funnelStages,
  };
}

function buildAttendanceReports({
  attendanceRecords,
  checkLogs,
  centerById,
  daily,
}: {
  attendanceRecords: Array<{
    date: Date;
    status: string;
    classroom: { centerId: string } | null;
    child: { family: { centerId: string | null } } | null;
  }>;
  checkLogs: Array<{
    occurredAt: Date;
    type: string;
    centerId: string | null;
    classroom: { centerId: string } | null;
    child: { family: { centerId: string | null } } | null;
  }>;
  centerById: Map<string, ReportCenterOption>;
  daily: boolean;
}) {
  const rows = new Map<string, AttendanceTrendReportRow>();
  const ensureRow = (dateValue: Date, centerId: string | null) => {
    const safeCenterId = centerId ?? noVisibleCenterId;
    const key = `${periodKey(dateValue, daily)}:${safeCenterId}`;
    const center = centerById.get(safeCenterId);
    const existing = rows.get(key);
    if (existing) return existing;
    const row = {
      date: periodKey(dateValue, daily),
      centerId: safeCenterId,
      centerLabel: center?.label ?? "Unknown center",
      present: 0,
      absent: 0,
      checkIns: 0,
      checkOuts: 0,
      attendanceRate: 0,
    };
    rows.set(key, row);
    return row;
  };

  attendanceRecords.forEach((record) => {
    const centerId = record.classroom?.centerId ?? record.child?.family.centerId ?? null;
    const row = ensureRow(record.date, centerId);
    if (isPresentStatus(record.status)) row.present += 1;
    if (isAbsentStatus(record.status)) row.absent += 1;
    row.attendanceRate = percent(row.present, row.present + row.absent);
  });

  checkLogs.forEach((log) => {
    const centerId = log.centerId ?? log.classroom?.centerId ?? log.child?.family.centerId ?? null;
    const row = ensureRow(log.occurredAt, centerId);
    if (log.type === "check_in") row.checkIns += 1;
    if (log.type === "check_out") row.checkOuts += 1;
  });

  return Array.from(rows.values()).sort((a, b) => `${b.date}:${b.centerLabel}`.localeCompare(`${a.date}:${a.centerLabel}`));
}

export function buildBillingReports({
  invoices,
  payments,
  centerById,
  interval,
  now,
}: {
  invoices: Array<{
    createdAt: Date;
    dueDate: Date;
    status: PaymentStatus;
    totalCents: number;
    isCurrentFamily: boolean;
    billingAccount: { family: { centerId: string | null } };
  }>;
  payments: Array<{
    paidAt: Date | null;
    status: PaymentStatus;
    amountCents: number;
    billingAccount: { family: { centerId: string | null } };
  }>;
  centerById: Map<string, ReportCenterOption>;
  interval: BillingReportInterval;
  now: Date;
}) {
  const rows = new Map<string, BillingReportRow>();
  const ensureRow = (dateValue: Date, centerId: string | null) => {
    const safeCenterId = centerId ?? noVisibleCenterId;
    const center = centerById.get(safeCenterId);
    const period = billingPeriodKey(dateValue, interval, center?.timezone ?? "UTC");
    const key = `${period}:${safeCenterId}`;
    const existing = rows.get(key);
    if (existing) return existing;
    const row = {
      period,
      centerId: safeCenterId,
      centerLabel: center?.label ?? "Unknown center",
      invoiceCents: 0,
      paidCents: 0,
      openCents: 0,
      overdueCents: 0,
      invoiceCount: 0,
      paymentCount: 0,
    };
    rows.set(key, row);
    return row;
  };

  invoices.forEach((invoice) => {
    const row = ensureRow(invoice.createdAt, invoice.billingAccount.family.centerId);
    row.invoiceCents = addCents(row.invoiceCents, invoice.totalCents);
    row.invoiceCount += 1;
    if (invoice.isCurrentFamily && (invoice.status === PaymentStatus.OPEN || invoice.status === PaymentStatus.FAILED)) {
      row.openCents = addCents(row.openCents, invoice.totalCents);
      if (invoice.dueDate < now) row.overdueCents = addCents(row.overdueCents, invoice.totalCents);
    }
  });

  payments.forEach((payment) => {
    if (!payment.paidAt || payment.status !== PaymentStatus.PAID) return;
    const row = ensureRow(payment.paidAt, payment.billingAccount.family.centerId);
    row.paidCents = addCents(row.paidCents, payment.amountCents);
    row.paymentCount += 1;
  });

  return Array.from(rows.values()).sort((a, b) => `${b.period}:${b.centerLabel}`.localeCompare(`${a.period}:${a.centerLabel}`));
}

function buildMessageReports(messages: Array<{
  id: string;
  createdAt: Date;
  readAt: Date | null;
  threadKey: string | null;
  family: { centerId: string | null } | null;
  sender: { role: UserRole } | null;
}>, centerById: Map<string, ReportCenterOption>) {
  const rows = new Map<string, MessageAnalyticsReportRow & { responseHoursTotal: number; respondedParentMessages: number }>();
  const byThread = new Map<string, typeof messages>();
  messages.forEach((message) => {
    const centerId = message.family?.centerId ?? noVisibleCenterId;
    const center = centerById.get(centerId);
    if (!rows.has(centerId)) {
      rows.set(centerId, {
        centerId,
        centerLabel: center?.label ?? "Unknown center",
        parentMessages: 0,
        staffReplies: 0,
        unreadMessages: 0,
        avgResponseHours: null,
        responseRate: 0,
        responseHoursTotal: 0,
        respondedParentMessages: 0,
      });
    }
    const threadKey = message.threadKey ?? `message:${message.id}`;
    byThread.set(threadKey, [...(byThread.get(threadKey) ?? []), message]);
  });

  byThread.forEach((threadMessages) => {
    const sorted = threadMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    sorted.forEach((message, index) => {
      const centerId = message.family?.centerId ?? noVisibleCenterId;
      const row = rows.get(centerId);
      if (!row) return;
      const isParent = message.sender?.role === UserRole.PARENT_GUARDIAN;
      if (isParent) {
        row.parentMessages += 1;
        const reply = sorted.slice(index + 1).find((candidate) => candidate.sender?.role && candidate.sender.role !== UserRole.PARENT_GUARDIAN);
        if (reply) {
          row.respondedParentMessages += 1;
          row.responseHoursTotal += Math.max(0, (reply.createdAt.getTime() - message.createdAt.getTime()) / 3_600_000);
        }
      } else {
        row.staffReplies += 1;
      }
      if (!message.readAt) row.unreadMessages += 1;
    });
  });

  return Array.from(rows.values())
    .map(({ responseHoursTotal, respondedParentMessages, ...row }) => ({
      ...row,
      avgResponseHours: respondedParentMessages ? Math.round((responseHoursTotal / respondedParentMessages) * 10) / 10 : null,
      responseRate: percent(respondedParentMessages, row.parentMessages),
    }))
    .sort((a, b) => b.parentMessages - a.parentMessages);
}

function buildStaffHoursReports(
  staffProfiles: Array<{
    id: string;
    title: string;
    customFields: unknown;
    centerId: string;
    user: { name: string; email: string; isActive: boolean };
    center: { name: string; crmLocationId: string | null; city?: string | null; state?: string | null; postalCode?: string | null; timezone?: string | null; customFields?: unknown };
    classroom: { name: string } | null;
  }>,
  input: {
    startDate: Date;
    endDate: Date;
    now: Date;
  },
) {
  return staffProfiles
    .map((staff) => {
      const clock = readStaffClockState(staff.customFields);
      const staffRangeStart = centerServiceDayWindow(input.startDate, staff.center);
      const staffRangeEnd = centerServiceDayWindow(input.endDate, staff.center);
      const summary = readStaffClockSummary(staff.customFields, {
        ...input,
        startDate: staffRangeStart.start,
        endDate: staffRangeEnd.end,
      });
      return {
        staffId: staff.id,
        staffName: staff.user.name,
        staffEmail: staff.user.email,
        title: staff.title,
        centerId: staff.centerId,
        centerLabel: centerLabel(staff.center),
        classroomName: staff.classroom?.name ?? "Unassigned",
        status: clock.status,
        totalMinutes: summary.totalMinutes,
        closedShiftMinutes: summary.closedShiftMinutes,
        openShiftMinutes: summary.openShiftMinutes,
        closedShiftCount: summary.closedShiftCount,
        lastActionAt: clock.lastActionAt,
        openShiftStartedAt: summary.openShiftStartedAt,
        activeUser: staff.user.isActive,
      };
    })
    .sort((left, right) =>
      left.centerLabel.localeCompare(right.centerLabel)
      || left.staffName.localeCompare(right.staffName),
    );
}

export async function buildAnalyticsReportData(
  user: CurrentUser,
  filters: AnalyticsReportFilters = {},
  now = new Date(),
): Promise<AnalyticsReportData> {
  const defaultRange = defaultReportRange(now);
  const startDate = filters.startDate ?? defaultRange.startDate;
  const endDate = filters.endDate ?? defaultRange.endDate;
  const centers = await getAccessibleCenters(user);
  const selectedCenterIds = scopedCenterIds(centers, filters.centerId);
  const selectedCenterFilter = centerIdFilter(selectedCenterIds);
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const rangeDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000));
  const daily = rangeDays <= 45;

  const leadWhere: Prisma.LeadWhereInput = {
    centerId: selectedCenterFilter,
    status: { notIn: ["closed", "merged"] },
    createdAt: dateFilter(startDate, endDate),
  };
  const familyCenterWhere = { family: { is: { centerId: selectedCenterFilter } } };
  const attendanceScope: Prisma.AttendanceRecordWhereInput = {
    date: dateFilter(startDate, endDate),
    OR: [
      { classroom: { is: { centerId: selectedCenterFilter } } },
      { child: { is: { family: { is: { centerId: selectedCenterFilter } } } } },
    ],
  };
  const checkLogScope: Prisma.CheckInOutLogWhereInput = {
    occurredAt: dateFilter(startDate, endDate),
    OR: [
      { centerId: selectedCenterFilter },
      { classroom: { is: { centerId: selectedCenterFilter } } },
      { child: { is: { family: { is: { centerId: selectedCenterFilter } } } } },
    ],
  };

  const [
    enrollmentChildren,
    leads,
    attendanceRecords,
    checkLogs,
    invoices,
    payments,
    messages,
    staffProfiles,
  ] = await Promise.all([
    prisma.child.findMany({
      where: {
        ...currentlyEnrolledChildWhere(),
        family: { is: { centerId: selectedCenterFilter } },
        classroom: { is: { centerId: selectedCenterFilter } },
        OR: [{ startDate: null }, { startDate: { lte: endDate } }],
      },
      orderBy: [{ classroom: { name: "asc" } }, { startDate: "asc" }, { fullName: "asc" }],
      take: 10_000,
      select: {
        id: true,
        fullName: true,
        dateOfBirth: true,
        startDate: true,
        ageGroup: true,
        enrollmentStatus: true,
        customFields: true,
        family: { select: { centerId: true } },
        classroom: { select: { name: true, ageGroup: true, centerId: true } },
      },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        centerId: true,
        leadSource: true,
        stage: true,
        tours: { select: { id: true } },
        enrollments: { select: { id: true } },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: attendanceScope,
      orderBy: { date: "desc" },
      take: 10_000,
      select: {
        date: true,
        status: true,
        classroom: { select: { centerId: true } },
        child: { select: { family: { select: { centerId: true } } } },
      },
    }),
    prisma.checkInOutLog.findMany({
      where: checkLogScope,
      orderBy: { occurredAt: "desc" },
      take: 10_000,
      select: {
        occurredAt: true,
        type: true,
        centerId: true,
        classroom: { select: { centerId: true } },
        child: { select: { family: { select: { centerId: true } } } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        billingAccount: { is: familyCenterWhere },
        OR: [
          { createdAt: dateFilter(startDate, endDate) },
          { dueDate: dateFilter(startDate, endDate) },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10_000,
      select: {
        createdAt: true,
        dueDate: true,
        status: true,
        totalCents: true,
        billingAccount: {
          select: {
            family: {
              select: {
                centerId: true,
                children: {
                  where: currentlyEnrolledChildWhere(),
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        paidAt: dateFilter(startDate, endDate),
        billingAccount: { is: familyCenterWhere },
      },
      orderBy: { paidAt: "desc" },
      take: 10_000,
      select: {
        paidAt: true,
        status: true,
        amountCents: true,
        billingAccount: { select: { family: { select: { centerId: true } } } },
      },
    }),
    prisma.message.findMany({
      where: {
        createdAt: dateFilter(startDate, endDate),
        family: { is: { centerId: selectedCenterFilter } },
      },
      orderBy: { createdAt: "asc" },
      take: 10_000,
      select: {
        id: true,
        createdAt: true,
        readAt: true,
        threadKey: true,
        family: { select: { centerId: true } },
        sender: { select: { role: true } },
      },
    }),
    prisma.staffProfile.findMany({
      where: {
        centerId: selectedCenterFilter,
        user: { role: UserRole.TEACHER, isActive: true },
      },
      orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { user: { name: "asc" } }],
      take: 5000,
      select: {
        id: true,
        title: true,
        customFields: true,
        centerId: true,
        user: { select: { name: true, email: true, isActive: true } },
        center: { select: { name: true, crmLocationId: true, city: true, state: true, postalCode: true, timezone: true, customFields: true } },
        classroom: { select: { name: true } },
      },
    }),
  ]);

  const enrollmentStatus = buildEnrollmentStatusReportRows(enrollmentChildren, centerById, endDate);
  const { leadSources, funnelStages } = buildLeadReports(leads, centerById);
  const attendanceTrends = buildAttendanceReports({ attendanceRecords, checkLogs, centerById, daily });
  const reportInvoices = invoices.map((invoice) => ({
    ...invoice,
    isCurrentFamily: invoice.billingAccount.family.children.length > 0,
  }));
  const billing = buildBillingReports({ invoices: reportInvoices, payments, centerById, interval: daily ? "daily" : "monthly", now });
  const weeklyBillingAndPayments = buildBillingReports({ invoices: reportInvoices, payments, centerById, interval: "weekly", now });
  const weeklyBilling = weeklyBillingAndPayments.filter((row) => row.invoiceCount > 0);
  const weeklyPayments = weeklyBillingAndPayments.filter((row) => row.paymentCount > 0);
  const messageRows = buildMessageReports(messages, centerById);
  const staffHours = buildStaffHoursReports(staffProfiles, { startDate, endDate, now });
  const enrolledCount = leads.filter((lead) => lead.stage === EnrollmentStage.ENROLLED).length;
  const presentCount = attendanceTrends.reduce((sum, row) => sum + row.present, 0);
  const absentCount = attendanceTrends.reduce((sum, row) => sum + row.absent, 0);
  const avgResponseRows = messageRows.filter((row) => row.avgResponseHours !== null);
  const avgResponseHours = avgResponseRows.length
    ? Math.round((avgResponseRows.reduce((sum, row) => sum + safeNumber(row.avgResponseHours), 0) / avgResponseRows.length) * 10) / 10
    : null;

  return {
    generatedAt: now.toISOString(),
    range: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    scope: {
      centerIds: selectedCenterIds,
      centerLabels: selectedCenterIds.map((centerId) => centerById.get(centerId)?.label ?? centerId),
    },
    centers,
    enrollmentStatus,
    leadSources,
    funnelStages,
    attendanceTrends,
    billing,
    weeklyBilling,
    weeklyPayments,
    messages: messageRows,
    staffHours,
    totals: {
      leadCount: leads.length,
      enrolledCount,
      leadConversionRate: percent(enrolledCount, leads.length),
      presentCount,
      absentCount,
      attendanceRate: percent(presentCount, presentCount + absentCount),
      invoiceCents: billing.reduce((sum, row) => sum + row.invoiceCents, 0),
      paidCents: billing.reduce((sum, row) => sum + row.paidCents, 0),
      openCents: billing.reduce((sum, row) => sum + row.openCents, 0),
      overdueCents: billing.reduce((sum, row) => sum + row.overdueCents, 0),
      parentMessages: messageRows.reduce((sum, row) => sum + row.parentMessages, 0),
      unreadMessages: messageRows.reduce((sum, row) => sum + row.unreadMessages, 0),
      avgResponseHours,
      staffHoursMinutes: staffHours.reduce((sum, row) => sum + row.totalMinutes, 0),
      staffOpenShiftMinutes: staffHours.reduce((sum, row) => sum + row.openShiftMinutes, 0),
      staffClockedIn: staffHours.filter((row) => row.status === "clocked_in").length,
      currentEnrollmentCount: enrollmentStatus.length,
    },
  };
}

export function rowsForReportKind(data: AnalyticsReportData, kind: ReportKind) {
  const traceability = {
    generatedAt: data.generatedAt,
    startDate: data.range.startDate,
    endDate: data.range.endDate,
    centers: data.scope.centerLabels,
    ...REPORT_DEFINITIONS[kind],
  };
  if (kind === "enrollment_status") {
    return {
      title: "Enrollment Status Summary",
      traceability,
      headers: ["Center", "Classroom / age group", "Status date", "Child's name", "Gender", "DOB", "Child's age", "Enrollment status"],
      rows: data.enrollmentStatus.map((row) => [
        row.centerLabel,
        row.groupLabel,
        row.statusDate?.slice(0, 10) ?? "Not set",
        row.childName,
        row.gender,
        row.dateOfBirth?.slice(0, 10) ?? "Needs review",
        row.ageLabel,
        row.enrollmentStatus.replaceAll("_", " "),
      ]),
    };
  }
  if (kind === "lead_funnel") {
    return {
      title: "Lead Source And Funnel Conversion",
      traceability,
      headers: ["Center", "Source", "Leads", "Tours", "Applications", "Enrolled", "Waitlisted", "Conversion"],
      rows: data.leadSources.map((row) => [
        row.centerLabel,
        row.source,
        row.leads,
        row.tours,
        row.applications,
        row.enrolled,
        row.waitlisted,
        `${row.conversionRate}%`,
      ]),
    };
  }
  if (kind === "attendance") {
    return {
      title: "Attendance And Absence Trends",
      traceability,
      headers: ["Period", "Center", "Present", "Absent", "Check-ins", "Check-outs", "Attendance rate"],
      rows: data.attendanceTrends.map((row) => [
        row.date,
        row.centerLabel,
        row.present,
        row.absent,
        row.checkIns,
        row.checkOuts,
        `${row.attendanceRate}%`,
      ]),
    };
  }
  if (kind === "billing") {
    return {
      title: "Billing Revenue And AR",
      traceability,
      headers: ["Period", "Center", "Invoices", "Invoice total", "Paid", "Current-family open AR", "Current-family overdue AR", "Payments"],
      rows: data.billing.map((row) => [
        row.period,
        row.centerLabel,
        row.invoiceCount,
        money(row.invoiceCents),
        money(row.paidCents),
        money(row.openCents),
        money(row.overdueCents),
        row.paymentCount,
      ]),
    };
  }
  if (kind === "weekly_billing") {
    return {
      title: "Weekly Billing Report",
      traceability,
      headers: ["Week", "Center", "Invoices", "Billed", "Current-family open AR", "Current-family overdue AR"],
      rows: data.weeklyBilling.map((row) => [
        row.period,
        row.centerLabel,
        row.invoiceCount,
        money(row.invoiceCents),
        money(row.openCents),
        money(row.overdueCents),
      ]),
    };
  }
  if (kind === "weekly_payments") {
    return {
      title: "Weekly Payment Report",
      traceability,
      headers: ["Week", "Center", "Payments", "Paid"],
      rows: data.weeklyPayments.map((row) => [
        row.period,
        row.centerLabel,
        row.paymentCount,
        money(row.paidCents),
      ]),
    };
  }
  if (kind === "messages") {
    return {
      title: "Parent Response Time And Message Analytics",
      traceability,
      headers: ["Center", "Parent messages", "Staff replies", "Unread", "Avg response hours", "Response rate"],
      rows: data.messages.map((row) => [
        row.centerLabel,
        row.parentMessages,
        row.staffReplies,
        row.unreadMessages,
        row.avgResponseHours ?? "No replies",
        `${row.responseRate}%`,
      ]),
    };
  }
  return {
    title: "Staff Hours And Time Clock",
    traceability,
    headers: [
      "Center",
      "Teacher",
      "Email",
      "Classroom",
      "Role",
      "Clock status",
      "Total decimal hours",
      "Closed shift decimal hours",
      "Open shift decimal hours",
      "Closed shifts",
      "Last action",
      "Open shift started",
      "Active user",
    ],
    rows: data.staffHours.map((row) => [
      row.centerLabel,
      row.staffName,
      row.staffEmail,
      row.classroomName,
      row.title,
      row.status === "clocked_in" ? "Clocked in" : "Clocked out",
      formatStaffDecimalHours(row.totalMinutes),
      formatStaffDecimalHours(row.closedShiftMinutes),
      formatStaffDecimalHours(row.openShiftMinutes),
      row.closedShiftCount,
      row.lastActionAt ?? "",
      row.openShiftStartedAt ?? "",
      row.activeUser ? "Active" : "Inactive",
    ]),
  };
}

export type ReportRows = ReturnType<typeof rowsForReportKind>;

export function reportRowsToCsv(input: ReportRows) {
  return [
    [input.title],
    ["Generated at", input.traceability.generatedAt],
    ["Date range", input.traceability.startDate, input.traceability.endDate],
    ["Centers", input.traceability.centers.join(" | ")],
    ["Source", input.traceability.source],
    ["Definition", input.traceability.definition],
    [],
    input.headers,
    ...input.rows,
  ].map((row) => row.map(exportCell).join(",")).join("\r\n");
}

function pdfEscape(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

function wrapText(text: string, length = 92) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > length) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function reportRowsToPdf(input: ReportRows, generatedAt = new Date(input.traceability.generatedAt)) {
  const reportHeader = [
    input.title,
    `Generated ${generatedAt.toISOString()}`,
    `Range ${input.traceability.startDate} to ${input.traceability.endDate}`,
    `Centers ${input.traceability.centers.join(" | ")}`,
    `Source ${input.traceability.source}`,
    `Definition ${input.traceability.definition}`,
  ].flatMap((line) => wrapText(line, 126));
  const columnHeader = input.headers.join(" | ");
  const rowLines = input.rows.flatMap((row) => wrapText(row.map((cell) => String(cell ?? "")).join(" | "), 126));
  const firstPageCapacity = 45;
  const nextPageCapacity = 50;
  const pageRows: string[][] = [];
  pageRows.push(rowLines.slice(0, firstPageCapacity));
  for (let offset = firstPageCapacity; offset < rowLines.length; offset += nextPageCapacity) {
    pageRows.push(rowLines.slice(offset, offset + nextPageCapacity));
  }
  if (!pageRows.length) pageRows.push([]);

  const pageCount = pageRows.length;
  const pageObjectIds = pageRows.map((_, index) => 4 + (index * 2));
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  pageRows.forEach((rows, index) => {
    const pageNumber = index + 1;
    const pageId = 4 + (index * 2);
    const contentId = pageId + 1;
    const contentLines = index === 0
      ? [...reportHeader, `Page ${pageNumber} of ${pageCount}`, columnHeader, ...rows]
      : [input.title, `Page ${pageNumber} of ${pageCount}`, columnHeader, ...rows];
    const stream = [
      "BT",
      "/F1 8 Tf",
      "32 578 Td",
      ...contentLines.map((line, lineIndex) => `${lineIndex === 0 ? "" : "0 -10 Td"}(${pdfEscape(line)}) Tj`),
      "ET",
    ].join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body);
}
