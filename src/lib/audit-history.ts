import type { LinkedRecordPagination } from "./record-pagination";

export type AuditHistoryFilters = { q: string; action: string; resource: string; centerId: string; start: string; end: string; asOf: string; page: string };
export type AuditHistoryRow = {
  id: string; action: string; resource: string; resourceId: string | null; createdAt: string;
  user: { name: string; email: string } | null; actorUnavailable: boolean;
  center: { id: string; label: string } | null;
};
export type AuditHistoryData = {
  logs: AuditHistoryRow[]; filters: AuditHistoryFilters; timeZone: string;
  stats: { total: number; sensitive: number; leadActions: number }; pagination: LinkedRecordPagination;
  actions: string[]; resources: string[]; centers: { id: string; label: string }[]; globalAvailable: boolean;
};
export class AuditHistoryError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); this.name = "AuditHistoryError"; }
}
const filterKeys = ["q", "action", "resource", "centerId", "start", "end", "asOf", "page"] as const;
function validDay(value: string) {
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "9999-12-31"
    && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function parseAuditHistoryFilters(input: Record<string, string | string[] | undefined> | URLSearchParams, now = new Date()): AuditHistoryFilters {
  const result = Object.fromEntries(filterKeys.map(key => {
    const raw = input instanceof URLSearchParams ? input.getAll(key) : input[key];
    if (Array.isArray(raw) && raw.length > (input instanceof URLSearchParams ? 1 : 0)) throw new AuditHistoryError("Use one value for each audit filter. Reset filters and try again.");
    const value = (Array.isArray(raw) ? raw[0] : raw) ?? "";
    if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) throw new AuditHistoryError("An audit filter is invalid. Reset filters and try again.");
    return [key, value.trim()];
  })) as AuditHistoryFilters;
  if (result.q.length > 120 || result.action.length > 191 || result.resource.length > 191
    || (result.centerId && !/^[A-Za-z0-9_-]{1,191}$/.test(result.centerId))
    || (result.page && (!/^[1-9]\d{0,8}$/.test(result.page)))) throw new AuditHistoryError("An audit filter is too long or invalid. Reset filters and try again.");
  if ((result.start && !validDay(result.start)) || (result.end && !validDay(result.end)) || (result.start && result.end && result.start > result.end)) {
    throw new AuditHistoryError("Choose valid dates with the start on or before the end.");
  }
  if (result.asOf && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result.asOf)
    || !Number.isFinite(Date.parse(result.asOf)) || new Date(result.asOf).toISOString() !== result.asOf || Date.parse(result.asOf) > now.getTime())) {
    throw new AuditHistoryError("This audit snapshot is invalid. Refresh the results and try again.");
  }
  result.asOf ||= now.toISOString(); result.page ||= "1";
  return result;
}
export function auditHistoryHref(filters: AuditHistoryFilters, page = Number(filters.page), exportCsv = false) {
  const params = new URLSearchParams();
  for (const key of filterKeys) if (key !== "page" && filters[key]) params.set(key, filters[key]);
  if (!exportCsv && page > 1) params.set("page", String(page));
  return `${exportCsv ? "/api/audit-logs/export" : "/audit-logs"}?${params}`;
}
export function auditCenterLabel(log: AuditHistoryRow) { return log.center?.label || "Tenant-wide"; }
export function auditActorLabel(log: AuditHistoryRow) { return log.user?.name || (log.actorUnavailable ? "Unavailable actor" : "System"); }
export function auditCsvRow(values: string[]) {
  return values.map(value => {
    const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",") + "\r\n";
}
