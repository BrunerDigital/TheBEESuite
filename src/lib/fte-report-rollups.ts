export type FteDateValue = Date | string | null | undefined;

export type FteRollupReport = {
  centerId: string;
  weekStart: FteDateValue;
  updatedAt: FteDateValue;
  fteCount: number;
  enrolledCount: number;
  status: string;
};

export type FteWeekRollup = {
  weekStart: string;
  fteTotal: number;
  enrolledTotal: number;
  submittedCenters: number;
  approvedReports: number;
  correctedReports: number;
  missingCenters: number;
};

export function fteDateKey(value: FteDateValue) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function dateTime(value: FteDateValue) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isNewerReport(candidate: FteRollupReport, existing: FteRollupReport) {
  const weekDelta = dateTime(candidate.weekStart) - dateTime(existing.weekStart);
  if (weekDelta !== 0) return weekDelta > 0;
  return dateTime(candidate.updatedAt) > dateTime(existing.updatedAt);
}

export function compareFteReportRecency(left: FteRollupReport, right: FteRollupReport) {
  const weekDelta = dateTime(right.weekStart) - dateTime(left.weekStart);
  if (weekDelta !== 0) return weekDelta;
  return dateTime(right.updatedAt) - dateTime(left.updatedAt);
}

export function latestFteReportsByCenterWeek<T extends FteRollupReport>(reports: readonly T[]) {
  const latest = new Map<string, T>();

  for (const report of reports) {
    const week = fteDateKey(report.weekStart);
    if (!week) continue;
    const key = `${report.centerId}:${week}`;
    const existing = latest.get(key);
    if (!existing || isNewerReport(report, existing)) latest.set(key, report);
  }

  return Array.from(latest.values()).sort(compareFteReportRecency);
}

export function latestFteReportsByCenter<T extends FteRollupReport>(reports: readonly T[]) {
  const latest = new Map<string, T>();

  for (const report of reports) {
    if (!fteDateKey(report.weekStart)) continue;
    const existing = latest.get(report.centerId);
    if (!existing || isNewerReport(report, existing)) latest.set(report.centerId, report);
  }

  return Array.from(latest.values()).sort(compareFteReportRecency);
}

export function latestFteReportsForWeek<T extends FteRollupReport>(reports: readonly T[], weekStart: FteDateValue) {
  const week = fteDateKey(weekStart);
  if (!week) return [];
  return latestFteReportsByCenterWeek(reports).filter((report) => fteDateKey(report.weekStart) === week);
}

export function aggregateFteWeeks<T extends FteRollupReport>(
  reports: readonly T[],
  centerCount: number,
  weekLimit = 8,
): FteWeekRollup[] {
  const grouped = new Map<string, T[]>();

  for (const report of latestFteReportsByCenterWeek(reports)) {
    const week = fteDateKey(report.weekStart);
    if (!week) continue;
    const rows = grouped.get(week) ?? [];
    rows.push(report);
    grouped.set(week, rows);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-weekLimit)
    .map(([weekStart, rows]) => {
      const submittedCenters = new Set(rows.map((report) => report.centerId)).size;
      return {
        weekStart,
        fteTotal: rows.reduce((sum, report) => sum + report.fteCount, 0),
        enrolledTotal: rows.reduce((sum, report) => sum + report.enrolledCount, 0),
        submittedCenters,
        approvedReports: rows.filter((report) => report.status === "approved").length,
        correctedReports: rows.filter((report) => report.status === "corrected").length,
        missingCenters: Math.max(centerCount - submittedCenters, 0),
      };
    });
}
