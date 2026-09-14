import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import type { AuditHistoryActor } from "../../src/lib/audit-history-query";
export const auditNow = new Date("2026-09-14T01:00:00.000Z");
export function auditActor(overrides: Partial<AuditHistoryActor> = {}): AuditHistoryActor {
  return { role: "READ_ONLY_AUDITOR", tenantId: "tenant-a", centerIds: ["school-a"], authorizedCenterIds: ["school-a", "closed-a"], accessScope: "scoped",
    workspace: { mode: "all" } as AuditHistoryActor["workspace"], timeZone: "America/New_York", ...overrides };
}
export function matchesAuditWhere(row: unknown, where: unknown): boolean {
  if (where instanceof Date) return row instanceof Date && row.getTime() === where.getTime();
  if (where === null || typeof where !== "object") return row === where;
  if (Array.isArray(where)) throw new Error("Unexpected fake predicate array");
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND" || key === "OR") { const parts = Array.isArray(value) ? value : [value]; return key === "AND" ? parts.every(part => matchesAuditWhere(row, part)) : parts.some(part => matchesAuditWhere(row, part)); }
    if (key === "is") return matchesAuditWhere(row, value);
    if (key === "in") return Array.isArray(value) && value.some(item => matchesAuditWhere(row, item));
    if (key === "mode") { assert.equal(value, "insensitive"); return true; }
    if (key === "contains" || key === "startsWith") {
      if (typeof row !== "string" || typeof value !== "string") return false;
      const insensitive = (where as { mode?: string }).mode === "insensitive";
      return (insensitive ? row.toLowerCase() : row)[key === "contains" ? "includes" : "startsWith"](insensitive ? value.toLowerCase() : value);
    }
    if (["lt", "lte", "gt", "gte"].includes(key)) {
      const a = row instanceof Date ? row.getTime() : row, b = value instanceof Date ? value.getTime() : value;
      assert.ok((typeof a === "string" && typeof b === "string") || (typeof a === "number" && typeof b === "number"));
      return key === "lt" ? a < b : key === "lte" ? a <= b : key === "gt" ? a > b : a >= b;
    }
    assert.ok(["id", "tenantId", "centerId", "createdAt", "user", "action", "resource", "resourceId", "name", "email", "organization"].includes(key), "Unexpected predicate " + key);
    return row !== null && typeof row === "object" && Object.hasOwn(row, key) && matchesAuditWhere((row as Record<string, unknown>)[key], value);
  });
}
export function auditFixture(count = 121) {
  const centers = [
    { id: "school-a", name: "Fake School", crmLocationId: null, status: "active", organization: { tenantId: "tenant-a" } },
    { id: "closed-a", name: "Fake School", crmLocationId: null, status: "closed", organization: { tenantId: "tenant-a" } },
    { id: "school-b", name: "Fake Foreign School", crmLocationId: null, status: "active", organization: { tenantId: "tenant-b" } },
  ];
  const event = (id: string, centerId: string | null = "school-a", tenantId = "tenant-a", overrides: Record<string, unknown> = {}) => ({
    id, tenantId, centerId, userId: "internal-user", metadata: { privateMedical: "DO_NOT_SERIALIZE", credential: "FAKE_SECRET_SENTINEL" },
    action: "record.reviewed", resource: "Document", resourceId: "fake-record-" + id, createdAt: new Date("2026-09-13T12:00:00.000Z"),
    center: centers.find(center => center.id === centerId) ?? null, user: { name: "Fake Reviewer", email: "reviewer@example.test", tenantId }, ...overrides,
  });
  const rows = Array.from({ length: count }, (_, index) => event("event-" + String(index).padStart(5, "0")));
  const calls: { model: string; args: unknown }[] = [];
  const filtered = (where: unknown) => rows.filter(row => matchesAuditWhere(row, where));
  const db = {
    center: { async findMany(args: { where: unknown }) { calls.push({ model: "center", args }); return structuredClone(centers.filter(center => matchesAuditWhere(center, args.where))); } },
    tenant: { async findMany(args: unknown) { calls.push({ model: "tenant", args }); return ["tenant-a", "tenant-b", "tenant-empty"].map(id => ({ id })); } },
    auditLog: {
      async count(args: { where: unknown }) { calls.push({ model: "count", args }); return filtered(args.where).length; },
      async groupBy(args: { where: unknown; by: ["action" | "resource"] }) { calls.push({ model: "group", args }); return [...new Set(filtered(args.where).map(row => row[args.by[0]]))].sort().map(value => ({ [args.by[0]]: value })); },
      async findMany(args: { where: unknown; select: Record<string, unknown>; skip?: number; take: number; orderBy: unknown }) {
        calls.push({ model: "events", args }); assert.equal(args.select.metadata, undefined); assert.equal(args.select.userId, undefined);
        assert.deepEqual(args.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
        return structuredClone(filtered(args.where).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)).slice(args.skip ?? 0, (args.skip ?? 0) + args.take));
      },
    },
  } as unknown as Pick<Prisma.TransactionClient, "center" | "auditLog" | "tenant">;
  return { db, rows, centers, event, calls };
}
