import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateFteWeeks,
  latestFteReportsByCenter,
  latestFteReportsByCenterWeek,
  latestFteReportsForWeek,
} from "../src/lib/fte-report-rollups";

function report(overrides: Partial<{
  id: string;
  centerId: string;
  weekStart: string;
  updatedAt: string;
  fteCount: number;
  enrolledCount: number;
  status: string;
}> = {}) {
  return {
    id: overrides.id ?? "report_1",
    centerId: overrides.centerId ?? "center_a",
    weekStart: overrides.weekStart ?? "2026-06-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-04T15:00:00.000Z",
    fteCount: overrides.fteCount ?? 10,
    enrolledCount: overrides.enrolledCount ?? 12,
    status: overrides.status ?? "submitted",
  };
}

test("executive FTE rollups keep the latest report per school and week", () => {
  const rows = [
    report({ id: "a_submitted", centerId: "center_a", fteCount: 10, updatedAt: "2026-06-04T15:00:00.000Z", status: "submitted" }),
    report({ id: "a_corrected", centerId: "center_a", fteCount: 12, updatedAt: "2026-06-05T15:00:00.000Z", status: "corrected" }),
    report({ id: "b_approved", centerId: "center_b", fteCount: 8, enrolledCount: 9, updatedAt: "2026-06-04T18:00:00.000Z", status: "approved" }),
    report({ id: "a_previous", centerId: "center_a", weekStart: "2026-05-25T00:00:00.000Z", fteCount: 9, updatedAt: "2026-05-29T15:00:00.000Z" }),
  ];

  const latestByCenterWeek = latestFteReportsByCenterWeek(rows);
  assert.equal(latestByCenterWeek.length, 3);
  assert.equal(latestByCenterWeek.find((row) => row.centerId === "center_a" && row.weekStart.startsWith("2026-06-01"))?.id, "a_corrected");

  const weeks = aggregateFteWeeks(rows, 3);
  assert.deepEqual(weeks.at(-1), {
    weekStart: "2026-06-01",
    fteTotal: 20,
    enrolledTotal: 21,
    submittedCenters: 2,
    approvedReports: 1,
    correctedReports: 1,
    missingCenters: 1,
  });

  const currentWeek = latestFteReportsForWeek(rows, "2026-06-01T00:00:00.000Z");
  assert.equal(currentWeek.reduce((sum, row) => sum + row.fteCount, 0), 20);
});

test("latest FTE by center prefers the newest reporting week before update time", () => {
  const rows = [
    report({ id: "older_week_recently_fixed", weekStart: "2026-05-25T00:00:00.000Z", updatedAt: "2026-06-08T15:00:00.000Z", fteCount: 9 }),
    report({ id: "latest_week", weekStart: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-03T15:00:00.000Z", fteCount: 11 }),
  ];

  const [latest] = latestFteReportsByCenter(rows);
  assert.equal(latest.id, "latest_week");
  assert.equal(latest.fteCount, 11);
});
