import type { Prisma } from "@prisma/client";
import { canAccessAllCenters, type CurrentUser } from "./auth";
import { canAccessModule } from "./rbac";
import { recordPagination } from "./record-pagination";
import { zonedDateInputToUtc, zonedDateKey } from "./zoned-date-time";
import { AuditHistoryError, auditActorLabel, auditCenterLabel, auditCsvRow, auditHistoryHref, type AuditHistoryData, type AuditHistoryFilters, type AuditHistoryRow } from "./audit-history";

type Reader = Pick<Prisma.TransactionClient, "auditLog" | "center" | "tenant">;
export type AuditHistoryActor = Pick<CurrentUser, "role" | "tenantId" | "centerIds" | "authorizedCenterIds" | "accessScope" | "workspace" | "timeZone">;
const noScope: Prisma.AuditLogWhereInput = { id: { in: [] } };
export const auditHistorySelect = {
  id: true, tenantId: true, centerId: true, action: true, resource: true, resourceId: true, createdAt: true,
  user: { select: { name: true, email: true, tenantId: true } },
  center: { select: { id: true, name: true, crmLocationId: true, organization: { select: { tenantId: true } } } },
} satisfies Prisma.AuditLogSelect;
export const auditHistoryOrder = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.AuditLogOrderByWithRelationInput[];
type Row = Prisma.AuditLogGetPayload<{ select: typeof auditHistorySelect }>;
type Scope = { where: Prisma.AuditLogWhereInput; centers: { id: string; label: string; tenantId: string }[]; actorTenantIds: string[]; globalAvailable: boolean; platformGlobal: boolean; tenantId: string };

export async function readAuditHistoryScope(db: Reader, actor: AuditHistoryActor): Promise<Scope> {
  if (!canAccessModule(actor, "audit-logs") || actor.accessScope === "none" || !actor.tenantId || !actor.workspace || !["center", "all", "fixed"].includes(actor.workspace.mode)) {
    throw new AuditHistoryError("Select an authorized workspace to view audit history.", 403);
  }
  const globalAvailable = actor.workspace.mode === "all" && canAccessAllCenters(actor);
  const platformGlobal = globalAvailable && actor.role === "PLATFORM_OWNER" && actor.accessScope === "platform";
  const candidateIds = [...new Set(actor.workspace.mode === "center" ? actor.centerIds : actor.authorizedCenterIds ?? actor.centerIds)];
  const rows = candidateIds.length ? await db.center.findMany({
    where: { id: { in: candidateIds }, ...(platformGlobal ? {} : { organization: { tenantId: actor.tenantId } }) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, crmLocationId: true, organization: { select: { tenantId: true } } },
  }) : [];
  const centers = rows.map(row => ({ id: row.id, label: row.crmLocationId || row.name, tenantId: row.organization.tenantId }));
  const labelCounts = new Map<string, number>();
  for (const center of centers) labelCounts.set(center.label, (labelCounts.get(center.label) ?? 0) + 1);
  for (const center of centers) if (labelCounts.get(center.label)! > 1) center.label += ` · ${center.id.slice(-8)}`;
  const groups = new Map<string, string[]>();
  for (const center of centers) groups.set(center.tenantId, [...(groups.get(center.tenantId) ?? []), center.id]);
  const terms: Prisma.AuditLogWhereInput[] = [...groups].map(([tenantId, ids]) => ({ tenantId, centerId: { in: ids } }));
  if (globalAvailable) terms.push({ centerId: null, ...(platformGlobal ? {} : { tenantId: actor.tenantId }) });
  const actorTenantIds = platformGlobal ? (await db.tenant.findMany({ select: { id: true } })).map(row => row.id)
    : [...new Set(centers.map(center => center.tenantId).concat(globalAvailable ? [actor.tenantId] : []))];
  return { where: terms.length ? { OR: terms } : noScope, centers, actorTenantIds, globalAvailable, platformGlobal, tenantId: actor.tenantId };
}

export function auditHistoryWhere(scope: Scope, filters: AuditHistoryFilters, timeZone: string): Prisma.AuditLogWhereInput {
  if (filters.centerId && (filters.centerId === "global" ? !scope.globalAvailable : !scope.centers.some(center => center.id === filters.centerId))) {
    throw new AuditHistoryError("That school is not available in this workspace. Reset the school filter.", 403);
  }
  const createdAt: Prisma.DateTimeFilter = { lte: new Date(filters.asOf) };
  if (filters.start) {
    const day = zonedDateInputToUtc(filters.start, timeZone);
    if (!day || zonedDateKey(day, timeZone) !== filters.start) throw new AuditHistoryError("Choose a valid start date.");
    createdAt.gte = day;
  }
  if (filters.end) {
    const day = zonedDateInputToUtc(filters.end, timeZone, true);
    if (!day || zonedDateKey(day, timeZone) !== filters.end) throw new AuditHistoryError("Choose a valid end date.");
    createdAt.lte = new Date(Math.min(day.getTime(), Date.parse(filters.asOf)));
  }
  const terms: Prisma.AuditLogWhereInput[] = [scope.where, { createdAt }];
  if (filters.centerId) terms.push({ centerId: filters.centerId === "global" ? null : filters.centerId });
  if (filters.action) terms.push({ action: filters.action });
  if (filters.resource) terms.push({ resource: filters.resource });
  if (filters.q) {
    const contains = { contains: filters.q, mode: "insensitive" as const };
    // Actor search must not become a name/email oracle across tenant relations.
    const actorTerms: Prisma.AuditLogWhereInput[] = scope.actorTenantIds
      .map(tenantId => ({ tenantId, user: { is: { tenantId, OR: [{ name: contains }, { email: contains }] } } }));
    terms.push({ OR: [{ action: contains }, { resource: contains }, { resourceId: contains },
      { centerId: { in: scope.centers.filter(center => center.label.toLowerCase().includes(filters.q.toLowerCase())).map(center => center.id) } }, ...actorTerms] });
  }
  return { AND: terms };
}

export function auditHistoryView(row: Row, scope: Scope): AuditHistoryRow {
  const permitted = row.centerId === null ? !row.center && scope.globalAvailable && (scope.platformGlobal || row.tenantId === scope.tenantId)
    : scope.centers.some(center => center.id === row.centerId && center.tenantId === row.tenantId)
      && row.center?.id === row.centerId && row.center.organization.tenantId === row.tenantId;
  if (!permitted) throw new AuditHistoryError("Audit scope changed. Refresh the workspace and try again.", 409);
  const safeActor = row.user && row.user.tenantId === row.tenantId ? row.user : null;
  return { id: row.id, action: row.action, resource: row.resource, resourceId: row.resourceId, createdAt: row.createdAt.toISOString(),
    user: safeActor ? { name: safeActor.name, email: safeActor.email } : null, actorUnavailable: Boolean(row.user && !safeActor),
    center: row.center ? { id: row.center.id, label: scope.centers.find(center => center.id === row.centerId)!.label } : null };
}

export async function readAuditHistoryPage(db: Reader, actor: AuditHistoryActor, filters: AuditHistoryFilters): Promise<AuditHistoryData> {
  const scope = await readAuditHistoryScope(db, actor), timeZone = actor.timeZone || "America/New_York";
  const where = auditHistoryWhere(scope, filters, timeZone);
  const base = { AND: [scope.where, { createdAt: { lte: new Date(filters.asOf) } }] } satisfies Prisma.AuditLogWhereInput;
  const [total, leadActions, sensitive, actions, resources] = await Promise.all([
    db.auditLog.count({ where }), db.auditLog.count({ where: { AND: [where, { action: { startsWith: "lead." } }] } }),
    db.auditLog.count({ where: { AND: [where, { OR: [{ action: { contains: "restricted", mode: "insensitive" } }, { action: { contains: "sensitive", mode: "insensitive" } }, { resource: { contains: "Incident", mode: "insensitive" } }] }] } }),
    db.auditLog.groupBy({ by: ["action"], where: base, orderBy: { action: "asc" } }),
    db.auditLog.groupBy({ by: ["resource"], where: base, orderBy: { resource: "asc" } }),
  ]);
  const pagination = recordPagination(filters.page, total, 50), canonical = { ...filters, page: String(pagination.page) };
  const rows = await db.auditLog.findMany({ where, select: auditHistorySelect, orderBy: auditHistoryOrder, skip: pagination.skip, take: pagination.pageSize });
  return { logs: rows.map(row => auditHistoryView(row, scope)), filters: canonical, timeZone, stats: { total, leadActions, sensitive },
    actions: actions.map(row => row.action), resources: resources.map(row => row.resource), centers: scope.centers.map(({ id, label }) => ({ id, label })), globalAvailable: scope.globalAvailable,
    pagination: { ...pagination, previousHref: pagination.page > 1 ? auditHistoryHref(canonical, pagination.page - 1) : null,
      nextHref: pagination.page < pagination.totalPages ? auditHistoryHref(canonical, pagination.page + 1) : null } };
}

// Below the hosting response-size limit; complete or fail, never a truncated CSV.
export const AUDIT_CSV_MAX_ROWS = 10_000;
export const AUDIT_CSV_MAX_BYTES = 3_000_000;
export async function readAuditHistoryCsv(db: Reader, actor: AuditHistoryActor, filters: AuditHistoryFilters, limits = { rows: AUDIT_CSV_MAX_ROWS, bytes: AUDIT_CSV_MAX_BYTES }) {
  const scope = await readAuditHistoryScope(db, actor), where = auditHistoryWhere(scope, filters, actor.timeZone || "America/New_York");
  const total = await db.auditLog.count({ where });
  const tooLarge = () => new AuditHistoryError("This export is too large. Narrow the school or date filters, then export again. No partial file was created.", 413);
  if (total > limits.rows) throw tooLarge();
  const chunks: string[] = []; let bytes = 0, count = 0, anchor: { id: string; createdAt: Date } | null = null;
  const append = (line: string) => { bytes += Buffer.byteLength(line, "utf8"); if (bytes > limits.bytes) throw tooLarge(); chunks.push(line); };
  append(auditCsvRow(["When (UTC)", "Actor Name", "Actor Email", "Action", "School", "School ID", "Resource", "Resource ID"]));
  while (count < total) {
    const rows: Row[] = await db.auditLog.findMany({ where: { AND: [where, ...(anchor ? [{ OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }] : [])] },
      select: auditHistorySelect, orderBy: auditHistoryOrder, take: Math.min(250, total - count) });
    if (!rows.length) throw new AuditHistoryError("The audit snapshot could not be completed. Refresh and try again.", 409);
    for (const row of rows) { const view = auditHistoryView(row, scope); append(auditCsvRow([view.createdAt, auditActorLabel(view), view.user?.email || "", view.action, auditCenterLabel(view), view.center?.id || "", view.resource, view.resourceId || ""])); }
    count += rows.length; anchor = rows[rows.length - 1];
  }
  return { csv: chunks.join(""), rows: count, bytes };
}
