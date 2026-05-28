import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  ageGroupTotal,
  calculateFteCount,
  defaultFteWeekEnd,
  normalizeFteStatus,
  resolveFteCenterId,
  validateFtePeriod,
} from "@/lib/fte-report-guardrails";
import { appendRowToGoogleSheet, spreadsheetIdFromUrl, type GoogleSheetValue } from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const FTE_SHEET_HEADERS = [
  "Submitted At",
  "Week Start",
  "Week End",
  "Center",
  "CRM Location ID",
  "Enrolled",
  "Full Time",
  "Part Time",
  "FTE",
  "Infants",
  "Toddlers",
  "Twos",
  "Preschool",
  "Pre-K",
  "School Age",
  "Status",
  "Submitted By",
  "Notes",
];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function intValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function floatValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : 0;
}

function parseDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function googleSpreadsheetId() {
  return (
    process.env.FTE_GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    spreadsheetIdFromUrl(process.env.FTE_GOOGLE_SHEETS_SPREADSHEET_URL) ||
    process.env.KIDCITY_FTE_SPREADSHEET_ID?.trim() ||
    spreadsheetIdFromUrl(process.env.KIDCITY_FTE_SPREADSHEET_URL) ||
    ""
  );
}

async function forwardToFteSheet(row: GoogleSheetValue[]) {
  const webhookUrl = process.env.FTE_GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const spreadsheetId = googleSpreadsheetId();

  if (spreadsheetId) {
    const result = await appendRowToGoogleSheet({
      spreadsheetId,
      sheetName: process.env.FTE_GOOGLE_SHEETS_SHEET_NAME || "FTE Reports",
      headers: FTE_SHEET_HEADERS,
      row,
    });
    if (!result.skipped) return result;
  }

  if (!webhookUrl) return { ok: true, skipped: true };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(FTE_SHEET_HEADERS.map((header, index) => [header, row[index] ?? ""]))),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok
      ? { ok: true, mode: "webhook" as const }
      : { ok: false, mode: "webhook" as const, error: `FTE webhook returned ${response.status}.` };
  } catch (error) {
    return {
      ok: false,
      mode: "webhook" as const,
      error: error instanceof Error ? error.message : "FTE webhook failed.",
    };
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "FTE reporting is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json();
  const id = clean(body.id);
  const requestedCenterId = clean(body.centerId);
  const weekStart = parseDate(body.weekStart);
  const weekEnd = parseDate(body.weekEnd) || (weekStart ? defaultFteWeekEnd(weekStart) : null);

  const existingById = id
    ? await prisma.fteReport.findUnique({ where: { id }, select: { id: true, centerId: true } })
    : null;
  if (id && !existingById) return NextResponse.json({ ok: false, error: "FTE report not found." }, { status: 404 });

  const centerResolution = resolveFteCenterId({
    role: user.role,
    requestedCenterId,
    primaryCenterId: user.primaryCenterId,
    existingReportCenterId: existingById?.centerId,
  });
  if (!centerResolution.ok) {
    return NextResponse.json({ ok: false, error: centerResolution.error }, { status: centerResolution.status });
  }

  const centerId = centerResolution.centerId;
  const periodValidation = validateFtePeriod(weekStart, weekEnd);
  if (!periodValidation.ok) {
    return NextResponse.json({ ok: false, error: periodValidation.error }, { status: periodValidation.status });
  }
  if (!weekStart) return NextResponse.json({ ok: false, error: "Week start is required." }, { status: 400 });
  if (!canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, crmLocationId: true, organization: { select: { tenantId: true } } },
  });
  if (!center) return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });

  if (existingById && !canAccessCenter(user, existingById.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this report." }, { status: 403 });
  }

  const fullTimeCount = intValue(body.fullTimeCount);
  const partTimeCount = intValue(body.partTimeCount);
  const calculatedFte = calculateFteCount(fullTimeCount, partTimeCount);
  const fteCount = body.fteCount === "" || body.fteCount === undefined || body.fteCount === null
    ? calculatedFte
    : floatValue(body.fteCount);
  const existingByWeek = weekStart && !id
    ? await prisma.fteReport.findUnique({
        where: { centerId_weekStart: { centerId, weekStart } },
        select: { id: true, centerId: true },
      })
    : null;
  const reportToUpdate = existingById ?? existingByWeek;
  const selectedStatus = normalizeFteStatus({
    requestedStatus: body.status,
    role: user.role,
    isCorrection: Boolean(reportToUpdate),
  });
  const infants = intValue(body.infants);
  const toddlers = intValue(body.toddlers);
  const twos = intValue(body.twos);
  const preschool = intValue(body.preschool);
  const preK = intValue(body.preK);
  const schoolAge = intValue(body.schoolAge);
  const enrolledCount = intValue(body.enrolledCount);
  const ageGroupCount = ageGroupTotal({
    infants,
    toddlers,
    twos,
    preschool,
    preK,
    schoolAge,
  });

  const data = {
    centerId,
    submittedById: user.id,
    weekStart,
    weekEnd,
    enrolledCount,
    fullTimeCount,
    partTimeCount,
    fteCount,
    infants,
    toddlers,
    twos,
    preschool,
    preK,
    schoolAge,
    notes: clean(body.notes) || null,
    status: selectedStatus,
    source: "manual_dashboard",
    sourceMetadata: {
      enteredBy: user.email,
      enteredRole: user.role,
      app: "the_bee_suite",
      calculatedFte,
      ageGroupCount,
      enrollmentVariance: enrolledCount - ageGroupCount,
      requestedCenterId,
      resolvedCenterId: centerId,
    },
  };

  const reportInclude = {
    center: { select: { name: true, crmLocationId: true } },
    submittedBy: { select: { name: true, email: true } },
  } satisfies Prisma.FteReportInclude;
  type ReportWithRelations = Prisma.FteReportGetPayload<{ include: typeof reportInclude }>;
  const report: ReportWithRelations = reportToUpdate
    ? await prisma.fteReport.update({
        where: { id: reportToUpdate.id },
        data,
        include: reportInclude,
      })
    : await prisma.fteReport.create({
        data,
        include: reportInclude,
      });

  const fteSheetResult = await forwardToFteSheet([
    new Date().toISOString(),
    report.weekStart.toISOString().slice(0, 10),
    report.weekEnd?.toISOString().slice(0, 10) ?? "",
    report.center.crmLocationId ?? report.center.name,
    report.center.crmLocationId ?? "",
    report.enrolledCount,
    report.fullTimeCount,
    report.partTimeCount,
    report.fteCount,
    report.infants,
    report.toddlers,
    report.twos,
    report.preschool,
    report.preK,
    report.schoolAge,
    report.status,
    report.submittedBy?.email ?? user.email,
    report.notes ?? "",
  ]);

  const executiveUsers = await prisma.user.findMany({
    where: {
      tenantId: center.organization.tenantId,
      isActive: true,
      role: { in: [UserRole.PLATFORM_OWNER, UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER] },
    },
    select: { id: true },
    take: 50,
  });

  if (executiveUsers.length) {
    await prisma.notification.createMany({
      data: executiveUsers.map((executive) => ({
        userId: executive.id,
        title: `FTE submitted for ${report.center.crmLocationId ?? report.center.name}`,
        body: `${report.fteCount.toLocaleString()} FTE for week of ${report.weekStart.toISOString().slice(0, 10)}.`,
        type: "fte_report",
        priority: report.status === "corrected" ? "high" : "normal",
      })),
      skipDuplicates: true,
    });
  }

  await writeAuditLog(user, {
    centerId,
    action: reportToUpdate ? "fte_report.updated" : "fte_report.submitted",
    resource: "FteReport",
    resourceId: report.id,
    metadata: {
      weekStart: report.weekStart.toISOString(),
      fteCount: report.fteCount,
      status: report.status,
      ageGroupCount,
      enrollmentVariance: report.enrolledCount - ageGroupCount,
      googleSheets: fteSheetResult,
    },
  });

  return NextResponse.json({
    ok: true,
    report: {
      id: report.id,
      centerId: report.centerId,
      centerName: report.center.crmLocationId ?? report.center.name,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      enrolledCount: report.enrolledCount,
      fullTimeCount: report.fullTimeCount,
      partTimeCount: report.partTimeCount,
      fteCount: report.fteCount,
      status: report.status,
      updated: Boolean(reportToUpdate),
    },
    integrations: {
      googleSheets: fteSheetResult,
    },
  });
}
