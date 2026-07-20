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
  centers: [{ id: "center_1", name: "Main", label: "FL | Tampa", timezone: "America/New_York" }],
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
  staffHours: [
    {
      staffId: "staff_1",
      staffName: "Lead Teacher",
      staffEmail: "lead@example.com",
      title: "Lead Teacher",
      centerId: "center_1",
      centerLabel: "FL | Tampa",
      classroomName: "Pre-K",
      status: "clocked_out",
      totalMinutes: 510,
      closedShiftMinutes: 510,
      openShiftMinutes: 0,
      closedShiftCount: 1,
      lastActionAt: "2026-06-04T20:30:00.000Z",
      openShiftStartedAt: null,
      activeUser: true,
    },
  ],
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
    staffHoursMinutes: 510,
    staffOpenShiftMinutes: 0,
    staffClockedIn: 0,
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
  assert.equal(Math.round((filters.endDate.getTime() - filters.startDate.getTime()) / 86_400_000), 30);
  assert.equal(filters.startDate.getDate(), 10);
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

test("staff hours report exports clock totals", () => {
  const report = rowsForReportKind(emptyReportData, "staff_hours");
  const csv = reportRowsToCsv(report);

  assert.match(csv, /Staff Hours And Time Clock/);
  assert.match(csv, /Lead Teacher/);
  assert.match(csv, /8.50/);
});

test("report PDF export returns a PDF buffer", () => {
  const report = rowsForReportKind(emptyReportData, "lead_funnel");
  const pdf = reportRowsToPdf(report, new Date("2026-06-08T12:00:00.000Z"));

  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString(), /%%EOF/);
});
