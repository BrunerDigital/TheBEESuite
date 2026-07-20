import type { ReportRows } from "@/lib/reporting-analytics";

export type ReconciliationCheck = { name: string; passed: boolean; evidence?: string };
export type SourceTotalCheck = { metric: string; approvedTotal: number; reportedTotal: number; tolerance?: number };

export type SchoolReportingReconciliation = {
  schoolName: string;
  centerId: string;
  cutoffDate: string;
  sourceApprovedBy: string;
  sourceApprovedAt: string;
  definitionsAcceptedBy: string;
  sourceTotals: SourceTotalCheck[];
  filterChecks: ReconciliationCheck[];
  scopeChecks: ReconciliationCheck[];
  exportChecks: ReconciliationCheck[];
  fteDeepLink: string;
  expectedFteWeekStart: string;
  dataAsOf: string;
  freshnessCheckedAt: string;
  maximumAgeMinutes: number;
  humanAcceptedBy: string;
  humanAcceptedAt: string;
};

export type ReconciliationResult = {
  passed: boolean;
  variances: Array<{ metric: string; variance: number; tolerance: number }>;
  failures: string[];
  ageMinutes: number | null;
};

export function rowsForVisibleCenters<T extends { centerId: string }>(rows: readonly T[], visibleCenterIds: readonly string[]) {
  const visible = new Set(visibleCenterIds);
  return rows.filter((row) => visible.has(row.centerId));
}

export function fteDeepLinkMatches(link: string, centerId: string, weekStart: string) {
  const url = new URL(link, "https://thebeesuite.test");
  return url.pathname === "/fte-reports"
    && url.searchParams.get("centerId") === centerId
    && url.searchParams.get("weekStart") === weekStart;
}

export function csvDataTable(csv: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  const blankIndex = records.findIndex((record) => record.every((value) => value === ""));
  return blankIndex >= 0 ? records.slice(blankIndex + 1) : [];
}

export function exportMatchesReportRows(report: ReportRows, csv: string) {
  const table = csvDataTable(csv);
  const expected = [report.headers, ...report.rows.map((row) => row.map((cell) => String(cell ?? "")))];
  return JSON.stringify(table) === JSON.stringify(expected);
}

export function evaluateSchoolReportingReconciliation(packet: SchoolReportingReconciliation): ReconciliationResult {
  const failures: string[] = [];
  const variances = packet.sourceTotals.map((check) => ({
    metric: check.metric,
    variance: check.reportedTotal - check.approvedTotal,
    tolerance: check.tolerance ?? 0,
  }));
  for (const variance of variances) {
    if (Math.abs(variance.variance) > variance.tolerance) failures.push(`${variance.metric} does not reconcile.`);
  }
  for (const [label, checks] of [
    ["Filter", packet.filterChecks],
    ["Scope", packet.scopeChecks],
    ["Export", packet.exportChecks],
  ] as const) {
    for (const check of checks) if (!check.passed) failures.push(`${label} check failed: ${check.name}.`);
  }
  if (!fteDeepLinkMatches(packet.fteDeepLink, packet.centerId, packet.expectedFteWeekStart)) failures.push("FTE deep link does not match the school and week.");

  const dataAsOf = Date.parse(packet.dataAsOf);
  const checkedAt = Date.parse(packet.freshnessCheckedAt);
  const ageMinutes = Number.isFinite(dataAsOf) && Number.isFinite(checkedAt) ? Math.max(0, (checkedAt - dataAsOf) / 60_000) : null;
  if (ageMinutes === null || ageMinutes > packet.maximumAgeMinutes) failures.push("Freshness timestamp is missing, invalid, or stale.");
  if (!packet.cutoffDate || !packet.sourceApprovedBy || !packet.sourceApprovedAt) failures.push("Approved source totals and cutoff date are required.");
  if (!packet.definitionsAcceptedBy) failures.push("Metric definitions require acceptance.");
  if (!packet.humanAcceptedBy || !packet.humanAcceptedAt) failures.push("Human acceptance is required.");
  return { passed: failures.length === 0, variances, failures, ageMinutes };
}
