import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fteReminderCoverageWhere } from "../src/lib/fte-report-guardrails";

test("FTE reminders accept the exact selected week or a selected range covering it", () => {
  const reminderWeekStart = new Date("2026-07-20T00:00:00.000Z");

  assert.deepEqual(fteReminderCoverageWhere(reminderWeekStart), {
    OR: [
      { weekStart: reminderWeekStart },
      {
        weekStart: { lte: reminderWeekStart },
        weekEnd: { gte: reminderWeekStart },
      },
    ],
  });
});

test("FTE submissions persist the selected reporting period separately from submission time", () => {
  const route = readFileSync("src/app/api/fte-reports/route.ts", "utf8");
  const reminderRoute = readFileSync(
    "src/app/api/cron/fte-reminders/route.ts",
    "utf8",
  );
  const form = readFileSync("src/components/fte-report-form.tsx", "utf8");

  assert.match(route, /selectedReportWeekStart: weekStart\.toISOString/);
  assert.match(route, /selectedReportWeekEnd: weekEnd\?\.toISOString/);
  assert.match(
    reminderRoute,
    /fteReports: \{ none: fteReminderCoverageWhere\(dueState\.weekStart\) \}/,
  );
  assert.match(form, /for the selected week of/);
});
