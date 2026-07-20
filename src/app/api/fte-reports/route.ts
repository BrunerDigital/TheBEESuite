import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canManageOperations, getCurrentUser, getLeadScopeWhere } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  ageGroupTotal,
  calculateFteCount,
  defaultFteWeekEnd,
  isExecutiveFteManager,
  isFteCenterInVisibleScope,
  normalizeFteStatus,
  resolveFteCenterId,
  validateFtePeriod,
} from "@/lib/fte-report-guardrails";
import { appendRowToGoogleSheet, spreadsheetIdFromUrl, type GoogleSheetValue } from "@/lib/google-sheets";
import { credentialEnvValue, getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const FTE_SHEET_HEADERS = [
  "Submitted At",
  "Week Start",
  "Week End",
  "School Name",
  "Location Data",
  "CRM Location ID",
  "Accounts Receivable",
  "Amount of Self-Payer Bill",
  "Amount of Subsidy Bill",
  "Total Amount Billed",
  "Total FTE's (FTE)",
  "Total currently enrolled",
  "License Capacity",
  "Occupancy Percent",
  "Payroll Amount",
  "Payroll %",
  "# New Starts",
  "# Withdrawn",
  "# Children preregistered",
  "Full Time",
  "Part Time",
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

function nullableFloatValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : null;
}

function nullableIntValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function recordFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function roundAmount(value: number | null) {
  return value === null ? null : Math.max(0, Math.round(value * 100) / 100);
}

function percent(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return Math.max(0, Math.round((numerator / denominator) * 10_000) / 100);
}

function parseDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function csvValue(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const reportInclude = {
  center: {
    select: {
      name: true,
      crmLocationId: true,
      ownerGroup: { select: { name: true, ownerType: true } },
    },
  },
  submittedBy: { select: { name: true, email: true } },
} satisfies Prisma.FteReportInclude;

function reportMetadata(report: { sourceMetadata?: unknown }) {
  return recordFromJson(report.sourceMetadata);
}

function reportLocationData(report: Prisma.FteReportGetPayload<{ include: typeof reportInclude }>) {
  const metadata = reportMetadata(report);
  return metadataText(metadata.locationData) || report.center.ownerGroup?.name || report.center.ownerGroup?.ownerType || "";
}

function reportCsvRow(report: Prisma.FteReportGetPayload<{ include: typeof reportInclude }>) {
  const metadata = reportMetadata(report);
  return [
    report.updatedAt.toISOString(),
    report.weekStart.toISOString().slice(0, 10),
    report.weekEnd?.toISOString().slice(0, 10) ?? "",
    report.center.crmLocationId ?? report.center.name,
    reportLocationData(report),
    report.center.crmLocationId ?? "",
    metadataNumber(metadata.accountReceivableAmount) ?? "",
    metadataNumber(metadata.selfPayerBillAmount) ?? "",
    metadataNumber(metadata.subsidyBillAmount) ?? "",
    metadataNumber(metadata.totalBilledAmount) ?? "",
    report.fteCount,
    report.enrolledCount,
    metadataNumber(metadata.licenseCapacity) ?? "",
    metadataNumber(metadata.occupancyPercent) ?? "",
    metadataNumber(metadata.payrollAmount) ?? "",
    metadataNumber(metadata.payrollPercent) ?? "",
    metadataNumber(metadata.newStarts) ?? "",
    metadataNumber(metadata.withdrawals) ?? "",
    metadataNumber(metadata.preregisteredChildren) ?? "",
    report.fullTimeCount,
    report.partTimeCount,
    report.infants,
    report.toddlers,
    report.twos,
    report.preschool,
    report.preK,
    report.schoolAge,
    report.status,
    report.submittedBy?.email ?? "",
    report.notes ?? "",
  ];
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

async function forwardToFteSheet(row: GoogleSheetValue[], tenantId: string | null) {
  const tenantCredentials = await getTenantIntegrationCredentialMap(tenantId, "google_sheets");
  const webhookUrl = process.env.FTE_GOOGLE_SHEETS_WEBHOOK_URL?.trim() || credentialEnvValue(tenantCredentials, "GOOGLE_SHEETS_WEBHOOK_URL");
  const spreadsheetId = googleSpreadsheetId();

  if (spreadsheetId || tenantCredentials.GOOGLE_SHEETS_SPREADSHEET_ID || tenantCredentials.GOOGLE_SHEETS_SPREADSHEET_URL) {
    const result = await appendRowToGoogleSheet({
      spreadsheetId: spreadsheetId || undefined,
      sheetName: process.env.FTE_GOOGLE_SHEETS_SHEET_NAME || "FTE Reports",
      headers: FTE_SHEET_HEADERS,
      row,
      tenantId,
      credentials: tenantCredentials,
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

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "FTE reporting is not allowed for this role." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedCenterId = clean(searchParams.get("centerId"));
  const requestedStatus = clean(searchParams.get("status"));
  const format = clean(searchParams.get("format"));
  const requestedWeekStart = parseDate(searchParams.get("weekStart"));
  const visibleCenters = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    select: { id: true },
  });
  const visibleCenterIds = visibleCenters.map((center) => center.id);

  if (!visibleCenterIds.length) {
    return NextResponse.json({ ok: false, error: "No assigned center found for this account." }, { status: 403 });
  }
  if (requestedCenterId && !isFteCenterInVisibleScope(visibleCenterIds, requestedCenterId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const reports = await prisma.fteReport.findMany({
    where: {
      centerId: requestedCenterId || { in: visibleCenterIds },
      ...(requestedWeekStart ? { weekStart: requestedWeekStart } : {}),
      ...(requestedStatus ? { status: requestedStatus } : {}),
    },
    orderBy: [{ weekStart: "desc" }, { updatedAt: "desc" }],
    take: format === "csv" ? 1000 : 250,
    include: reportInclude,
  });

  if (format === "csv") {
    const lines = [
      FTE_SHEET_HEADERS.map(csvValue).join(","),
      ...reports.map((report) => reportCsvRow(report).map(csvValue).join(",")),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bee-suite-fte-reports-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    reports: reports.map((report) => {
      const metadata = reportMetadata(report);
      return {
        id: report.id,
        centerId: report.centerId,
        centerName: report.center.crmLocationId ?? report.center.name,
        locationData: reportLocationData(report),
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
        accountReceivableAmount: metadataNumber(metadata.accountReceivableAmount),
        selfPayerBillAmount: metadataNumber(metadata.selfPayerBillAmount),
        subsidyBillAmount: metadataNumber(metadata.subsidyBillAmount),
        totalBilledAmount: metadataNumber(metadata.totalBilledAmount),
        enrolledCount: report.enrolledCount,
        fullTimeCount: report.fullTimeCount,
        partTimeCount: report.partTimeCount,
        fteCount: report.fteCount,
        licenseCapacity: metadataNumber(metadata.licenseCapacity),
        occupancyPercent: metadataNumber(metadata.occupancyPercent),
        payrollAmount: metadataNumber(metadata.payrollAmount),
        payrollPercent: metadataNumber(metadata.payrollPercent),
        newStarts: metadataNumber(metadata.newStarts),
        withdrawals: metadataNumber(metadata.withdrawals),
        preregisteredChildren: metadataNumber(metadata.preregisteredChildren),
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
        updatedAt: report.updatedAt,
      };
    }),
  });
}

async function POSTHandler(request: NextRequest) {
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
    ? await prisma.fteReport.findUnique({ where: { id }, select: { id: true, centerId: true, status: true } })
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
  const visibleCenters = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    select: { id: true },
  });
  const visibleCenterIds = visibleCenters.map((center) => center.id);
  if (!isFteCenterInVisibleScope(visibleCenterIds, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      licensedCapacity: true,
      ownerGroup: { select: { name: true, ownerType: true } },
      organization: { select: { tenantId: true } },
    },
  });
  if (!center) return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });

  if (existingById && !isFteCenterInVisibleScope(visibleCenterIds, existingById.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this report." }, { status: 403 });
  }

  const fullTimeCount = intValue(body.fullTimeCount);
  const partTimeCount = intValue(body.partTimeCount);
  const accountReceivableAmount = nullableFloatValue(body.accountReceivableAmount);
  const selfPayerBillAmount = nullableFloatValue(body.selfPayerBillAmount);
  const subsidyBillAmount = nullableFloatValue(body.subsidyBillAmount);
  const totalBilledAmount = nullableFloatValue(body.totalBilledAmount) ??
    (selfPayerBillAmount !== null || subsidyBillAmount !== null
      ? roundAmount((selfPayerBillAmount ?? 0) + (subsidyBillAmount ?? 0))
      : null);
  const licenseCapacity = nullableIntValue(body.licenseCapacity) ?? center.licensedCapacity ?? null;
  const occupancyPercent = nullableFloatValue(body.occupancyPercent) ?? percent(intValue(body.enrolledCount), licenseCapacity);
  const payrollAmount = nullableFloatValue(body.payrollAmount);
  const payrollPercent = nullableFloatValue(body.payrollPercent) ?? percent(payrollAmount, totalBilledAmount);
  const newStarts = nullableIntValue(body.newStarts) ?? 0;
  const withdrawals = nullableIntValue(body.withdrawals) ?? 0;
  const preregisteredChildren = nullableIntValue(body.preregisteredChildren) ?? 0;
  const locationData = clean(body.locationData) || center.ownerGroup?.name || center.ownerGroup?.ownerType || "";
  const calculatedFte = calculateFteCount(fullTimeCount, partTimeCount);
  const fteCount = body.fteCount === "" || body.fteCount === undefined || body.fteCount === null
    ? calculatedFte
    : floatValue(body.fteCount);
  const existingByWeek = weekStart && !id
    ? await prisma.fteReport.findUnique({
        where: { centerId_weekStart: { centerId, weekStart } },
        select: { id: true, centerId: true, status: true },
      })
    : null;
  const reportToUpdate = existingById ?? existingByWeek;
  if (reportToUpdate?.status === "approved" && !isExecutiveFteManager(user.role)) {
    return NextResponse.json(
      { ok: false, error: "Approved FTE reports require executive correction before they can be changed." },
      { status: 403 },
    );
  }
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
      locationData,
      accountReceivableAmount,
      selfPayerBillAmount,
      subsidyBillAmount,
      totalBilledAmount,
      licenseCapacity,
      occupancyPercent,
      payrollAmount,
      payrollPercent,
      newStarts,
      withdrawals,
      preregisteredChildren,
      prefillSource: clean(body.source),
      enrollmentVariance: enrolledCount - ageGroupCount,
      requestedCenterId,
      resolvedCenterId: centerId,
    },
  };

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
    locationData,
    report.center.crmLocationId ?? "",
    accountReceivableAmount ?? "",
    selfPayerBillAmount ?? "",
    subsidyBillAmount ?? "",
    totalBilledAmount ?? "",
    report.fteCount,
    report.enrolledCount,
    licenseCapacity ?? "",
    occupancyPercent ?? "",
    payrollAmount ?? "",
    payrollPercent ?? "",
    newStarts,
    withdrawals,
    preregisteredChildren,
    report.fullTimeCount,
    report.partTimeCount,
    report.infants,
    report.toddlers,
    report.twos,
    report.preschool,
    report.preK,
    report.schoolAge,
    report.status,
    report.submittedBy?.email ?? user.email,
    report.notes ?? "",
  ], center.organization.tenantId);

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
      accountReceivableAmount,
      selfPayerBillAmount,
      subsidyBillAmount,
      totalBilledAmount,
      payrollAmount,
      payrollPercent,
      newStarts,
      withdrawals,
      preregisteredChildren,
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
      locationData,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      accountReceivableAmount,
      selfPayerBillAmount,
      subsidyBillAmount,
      totalBilledAmount,
      enrolledCount: report.enrolledCount,
      fullTimeCount: report.fullTimeCount,
      partTimeCount: report.partTimeCount,
      fteCount: report.fteCount,
      licenseCapacity,
      occupancyPercent,
      payrollAmount,
      payrollPercent,
      newStarts,
      withdrawals,
      preregisteredChildren,
      status: report.status,
      updated: Boolean(reportToUpdate),
    },
    integrations: {
      googleSheets: fteSheetResult,
    },
  });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
