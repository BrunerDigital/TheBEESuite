import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeReportFilters,
  parseReportDate,
  reportRowsToCsv,
  reportRowsToPdf,
  rowsForReportKind,
  type AnalyticsReportData,
} from "../src/lib/reporting-analytics";

const emptyReportData: AnalyticsReportData = {
  generatedAt: "2026-06-08T12:00:00.000Z",
  range: { startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-08T23:59:59.999Z" },
  centers: [{ id: "center_1", name: "Main", label: "FL | Tampa" }],
  leadSources: [
    {
      centerId: "center_1",
      centerLabel: "FL | Tampa",
      source: "Website",
      leads: 10,
      tours: 6,
      applications: 4,
      enrolled: 3,
      waitlisted: 1,
      conversionRate: 30,
    },
  ],
  funnelStages: [{ stage: "ENROLLED", count: 3, share: 30 }],
  attendanceTrends: [],
  billing: [],
  messages: [],
  totals: {
    leadCount: 10,
    enrolledCount: 3,
    leadConversionRate: 30,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0,
    invoiceCents: 0,
    paidCents: 0,
    openCents: 0,
    overdueCents: 0,
    parentMessages: 0,
    unreadMessages: 0,
    avgResponseHours: null,
  },
};

test("report filters normalize quick ranges and center ids", () => {
  const filters = normalizeReportFilters(
    { range: "30", centerId: "center_1" },
    new Date("2026-06-08T12:00:00.000Z"),
  );

  assert.equal(filters.centerId, "center_1");
  assert.ok(filters.startDate);
  assert.ok(filters.endDate);
  assert.equal(filters.endDate.getHours(), 23);
  assert.equal(filters.endDate.getMinutes(), 59);
  assert.equal(filters.startDate.getHours(), 0);
  assert.equal(Math.round((filters.endDate.getTime() - filters.startDate.getTime()) / 86_400_000), 31);
});

test("report date parser keeps date-only values on the selected local day", () => {
  const date = parseReportDate("2026-06-08");

  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 5);
  assert.equal(date.getDate(), 8);
  assert.equal(date.getHours(), 0);
});

test("lead funnel report exports CSV rows", () => {
  const report = rowsForReportKind(emptyReportData, "lead_funnel");
  const csv = reportRowsToCsv(report);

  assert.match(csv, /Lead Source And Funnel Conversion/);
  assert.match(csv, /Website/);
  assert.match(csv, /30%/);
});

test("report PDF export returns a PDF buffer", () => {
  const report = rowsForReportKind(emptyReportData, "lead_funnel");
  const pdf = reportRowsToPdf(report, new Date("2026-06-08T12:00:00.000Z"));

  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString(), /%%EOF/);
});
