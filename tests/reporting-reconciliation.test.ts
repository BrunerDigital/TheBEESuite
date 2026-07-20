import assert from "node:assert/strict";
import { test } from "node:test";
import { reportRowsToCsv, rowsForReportKind, type AnalyticsReportData } from "../src/lib/reporting-analytics";
import { evaluateSchoolReportingReconciliation, exportMatchesReportRows, fteDeepLinkMatches, rowsForVisibleCenters } from "../src/lib/reporting-reconciliation";

const twoSchoolRows = [
  { centerId: "school_a", value: 11 },
  { centerId: "school_b", value: 22 },
];

test("two-school fixtures isolate rows to the authorized school", () => {
  assert.deepEqual(rowsForVisibleCenters(twoSchoolRows, ["school_a"]), [{ centerId: "school_a", value: 11 }]);
  assert.deepEqual(rowsForVisibleCenters(twoSchoolRows, ["school_b"]), [{ centerId: "school_b", value: 22 }]);
  assert.deepEqual(rowsForVisibleCenters(twoSchoolRows, ["other_tenant"]), []);
});

const data: AnalyticsReportData = {
  generatedAt: "2026-07-20T14:00:00.000Z",
  range: { startDate: "2026-07-13T00:00:00.000Z", endDate: "2026-07-19T23:59:59.999Z" },
  centers: [{ id: "school_a", name: "School A", label: "IN | School A", timezone: "America/Indiana/Indianapolis" }],
  leadSources: [{ source: "Website", centerId: "school_a", centerLabel: "IN | School A", leads: 4, tours: 2, applications: 1, enrolled: 1, waitlisted: 0, conversionRate: 25 }],
  funnelStages: [{ stage: "ENROLLED", count: 1, share: 25 }],
  attendanceTrends: [], billing: [], messages: [], staffHours: [],
  totals: { leadCount: 4, enrolledCount: 1, leadConversionRate: 25, presentCount: 0, absentCount: 0, attendanceRate: 0, invoiceCents: 0, paidCents: 0, openCents: 0, overdueCents: 0, parentMessages: 0, unreadMessages: 0, avgResponseHours: null, staffHoursMinutes: 0, staffOpenShiftMinutes: 0, staffClockedIn: 0 },
};

test("CSV export rows are equivalent to the displayed report rows and retain traceability", () => {
  const report = rowsForReportKind(data, "lead_funnel");
  const csv = reportRowsToCsv(report);
  assert.equal(exportMatchesReportRows(report, csv), true);
  assert.match(csv, /Generated at/);
  assert.match(csv, /IN \| School A/);
  assert.match(csv, /BEE Suite CRM records/);
});

test("reconciliation harness checks totals, filters, scope, deep link, and freshness", () => {
  const result = evaluateSchoolReportingReconciliation({
    schoolName: "School A", centerId: "school_a", cutoffDate: "2026-07-19",
    sourceApprovedBy: "Synthetic Approver", sourceApprovedAt: "2026-07-20T13:30:00.000Z", definitionsAcceptedBy: "Synthetic Operations",
    sourceTotals: [{ metric: "Leads", approvedTotal: 4, reportedTotal: 4 }],
    filterChecks: [{ name: "weekly cutoff", passed: true }], scopeChecks: [{ name: "School B excluded", passed: true }], exportChecks: [{ name: "CSV equivalence", passed: true }],
    fteDeepLink: "/fte-reports?centerId=school_a&weekStart=2026-07-13", expectedFteWeekStart: "2026-07-13",
    dataAsOf: "2026-07-20T14:00:00.000Z", freshnessCheckedAt: "2026-07-20T14:05:00.000Z", maximumAgeMinutes: 15,
    humanAcceptedBy: "Synthetic Director", humanAcceptedAt: "2026-07-20T14:06:00.000Z",
  });
  assert.equal(result.passed, true);
  assert.equal(fteDeepLinkMatches("/fte-reports?centerId=school_b&weekStart=2026-07-13", "school_a", "2026-07-13"), false);
});
