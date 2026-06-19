import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  buildAnalyticsReportData,
  normalizeReportFilters,
  reportRowsToCsv,
  reportRowsToPdf,
  rowsForReportKind,
  type ReportFormat,
  type ReportKind,
} from "@/lib/reporting-analytics";
import { canAccessModule } from "@/lib/rbac";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const reportKinds = new Set<ReportKind>(["lead_funnel", "attendance", "billing", "messages", "staff_hours"]);
const reportFormats = new Set<ReportFormat>(["csv", "pdf"]);

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canAccessModule(user, "analytics")) {
    return NextResponse.json({ ok: false, error: "Analytics reports are not allowed for this role." }, { status: 403 });
  }

  const reportParam = request.nextUrl.searchParams.get("report") as ReportKind | null;
  const formatParam = request.nextUrl.searchParams.get("format") as ReportFormat | null;
  const report = reportParam && reportKinds.has(reportParam) ? reportParam : "lead_funnel";
  const format = formatParam && reportFormats.has(formatParam) ? formatParam : "csv";
  const filters = normalizeReportFilters({
    range: request.nextUrl.searchParams.get("range"),
    start: request.nextUrl.searchParams.get("start"),
    end: request.nextUrl.searchParams.get("end"),
    centerId: request.nextUrl.searchParams.get("centerId"),
  });

  const data = await buildAnalyticsReportData(user, filters);
  const rows = rowsForReportKind(data, report);
  const filename = `${safeFilename(rows.title)}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "pdf") {
    const pdf = reportRowsToPdf(rows);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  return new NextResponse(reportRowsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}

export const GET = withApiLogging("GET", GETHandler);
