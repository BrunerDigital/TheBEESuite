import assert from "node:assert/strict";
import test from "node:test";
import { AuditHistoryError, auditCsvRow, auditHistoryHref, parseAuditHistoryFilters } from "../src/lib/audit-history";
import { auditHistoryView, auditHistoryWhere, readAuditHistoryCsv, readAuditHistoryPage, readAuditHistoryScope } from "../src/lib/audit-history-query";
import { auditActor, auditFixture, auditNow, matchesAuditWhere } from "./helpers/audit-history-fixture";

const filters = (input: Record<string, string | string[] | undefined> = {}) => parseAuditHistoryFilters(input, auditNow);
test("audit filters strictly validate duplicates syntax dates and future snapshots", () => {
  for (const input of [{ q: ["one"] }, { q: "x".repeat(121) }, { action: "a".repeat(192) }, { centerId: "../foreign" }, { q: "bad\u0001" },
    { start: "2026-02-30" }, { end: "2026-13-01" }, { start: "2026-09-14", end: "2026-09-13" }, { page: "1.5" }, { page: "0" },
    { asOf: "2026-09-15T00:00:00.000Z" }, { asOf: "2026-02-30T00:00:00.000Z" }, { asOf: "2026-09-13" }]) assert.throws(() => filters(input), AuditHistoryError);
  assert.throws(() => parseAuditHistoryFilters(new URLSearchParams("q=a&q=b"), auditNow), AuditHistoryError);
  const parsed = filters({ q: "  older  ", start: "2024-02-29", page: "3" }); assert.equal(parsed.q, "older"); assert.equal(parsed.asOf, auditNow.toISOString());
  const url = new URL(auditHistoryHref(parsed, 2), "https://example.test"); assert.equal(url.searchParams.get("page"), "2");
  assert.equal(new URL(auditHistoryHref(parsed, 3, true), url).searchParams.has("page"), false);
});
test("audit history reaches all older rows with deterministic equal-time pages and complete facets", async () => {
  const f = auditFixture(); f.rows[0].action = "older.only"; f.rows[0].resource = "HistoricRecord";
  const first = await readAuditHistoryPage(f.db, auditActor(), filters()); assert.equal(first.logs.length, 50); assert.equal(first.stats.total, 121); assert.ok(first.actions.includes("older.only"));
  const second = await readAuditHistoryPage(f.db, auditActor(), filters({ page: "2" })); const third = await readAuditHistoryPage(f.db, auditActor(), filters({ page: "3" }));
  assert.equal(new Set([...first.logs, ...second.logs, ...third.logs].map(row => row.id)).size, 121); assert.equal(third.pagination.from, 101); assert.equal(third.pagination.to, 121);
  const found = await readAuditHistoryPage(f.db, auditActor(), filters({ q: "older.only" })); assert.equal(found.logs[0].id, "event-00000"); assert.equal(found.stats.total, 1);
  f.rows.push(f.event("later-insert", "school-a", "tenant-a", { createdAt: new Date(auditNow.getTime() + 1) }));
  assert.deepEqual((await readAuditHistoryPage(f.db, auditActor(), filters({ page: "2" }))).logs, second.logs);
});
test("audit DTO has an exact safe shape and hides a mismatched tenant actor", async () => {
  const f = auditFixture(1); f.rows[0].user = { name: "Foreign Secret Name", email: "foreign@example.test", tenantId: "tenant-b" };
  const page = await readAuditHistoryPage(f.db, auditActor(), filters());
  assert.deepEqual(Object.keys(page.logs[0]).sort(), ["id", "action", "resource", "resourceId", "createdAt", "user", "actorUnavailable", "center"].sort());
  assert.equal(page.logs[0].user, null); assert.equal(page.logs[0].actorUnavailable, true);
  assert.doesNotMatch(JSON.stringify(page), /metadata|DO_NOT_SERIALIZE|FAKE_SECRET|internal-user|tenant-a|Foreign Secret|foreign@example/);
  assert.equal((await readAuditHistoryPage(f.db, auditActor(), filters({ q: "Foreign Secret" }))).stats.total, 0);
  assert.equal((await readAuditHistoryPage(f.db, auditActor(), filters({ q: "foreign@example.test" }))).stats.total, 0);
});
test("audit scope pairs each tenant and school and retains only authorized closed history", async () => {
  const f = auditFixture(0); f.rows.push(f.event("active"), f.event("closed", "closed-a"), f.event("foreign", "school-b", "tenant-b"), f.event("corrupt", "school-a", "tenant-b"), f.event("global", null));
  const all = await readAuditHistoryPage(f.db, auditActor(), filters()); assert.deepEqual(all.logs.map(row => row.id).sort(), ["active", "closed"]);
  assert.equal(new Set(all.centers.map(center => center.label)).size, 2, "Duplicate names have distinguishable labels and exact IDs");
  assert.equal(new Set(all.logs.map(log => log.center?.label)).size, 2, "Rows and every display/export preserve the disambiguated school");
  const selected = auditActor({ workspace: { mode: "center" } as never });
  assert.deepEqual((await readAuditHistoryPage(f.db, selected, filters())).logs.map(row => row.id), ["active"]);
  assert.deepEqual((await readAuditHistoryPage(f.db, auditActor({ workspace: { mode: "fixed" } as never }), filters())).logs.map(row => row.id).sort(), ["active", "closed"]);
  const scope = await readAuditHistoryScope(f.db, auditActor()); assert.equal(matchesAuditWhere(f.event("corrupt", "school-a", "tenant-b"), scope.where), false);
  assert.throws(() => auditHistoryView(f.event("corrupt", "school-a", "tenant-b"), scope), AuditHistoryError);
});
test("tenant globals require an explicitly broad all-locations workspace", async () => {
  const f = auditFixture(0); f.rows.push(f.event("global-a", null), f.event("global-b", null, "tenant-b"));
  for (const mode of ["center", "fixed", "all"] as const) {
    const page = await readAuditHistoryPage(f.db, auditActor({ accessScope: "tenant", workspace: { mode } as never }), filters());
    assert.deepEqual(page.logs.map(row => row.id), mode === "all" ? ["global-a"] : []);
  }
  const page = await readAuditHistoryPage(f.db, auditActor({ accessScope: "scoped" }), filters()); assert.equal(page.globalAvailable, false);
});
test("platform all scope preserves exact cross-tenant pairs and globals in tenants without schools", async () => {
  const f = auditFixture(0); f.rows.push(f.event("a"), f.event("b", "school-b", "tenant-b"), f.event("bad", "school-b", "tenant-a"),
    f.event("global-empty", null, "tenant-empty", { user: { name: "No School Actor", email: "empty@example.test", tenantId: "tenant-empty" } }));
  const actor = auditActor({ role: "PLATFORM_OWNER", accessScope: "platform", tenantId: "platform-home", authorizedCenterIds: ["school-a", "school-b"] });
  const page = await readAuditHistoryPage(f.db, actor, filters()); assert.deepEqual(page.logs.map(row => row.id).sort(), ["a", "b", "global-empty"]);
  assert.equal((await readAuditHistoryPage(f.db, actor, filters({ q: "No School Actor" }))).stats.total, 1);
});
test("unauthorized role pending empty and foreign school filters do not broaden audit reads", async () => {
  for (const role of ["PARENT_GUARDIAN", "AUTHORIZED_PICKUP", "TEACHER", "BILLING_ADMIN"] as const) {
    const f = auditFixture(); await assert.rejects(readAuditHistoryScope(f.db, auditActor({ role })), AuditHistoryError); assert.equal(f.calls.length, 0);
  }
  for (const workspace of [undefined, { mode: "pending" }]) {
    const f = auditFixture(); await assert.rejects(readAuditHistoryScope(f.db, auditActor({ workspace: workspace as never })), AuditHistoryError); assert.equal(f.calls.length, 0);
  }
  const f = auditFixture(); await assert.rejects(readAuditHistoryPage(f.db, auditActor(), filters({ centerId: "school-b" })), AuditHistoryError);
  assert.ok(f.calls.every(call => call.model === "center"));
  const empty = await readAuditHistoryPage(f.db, auditActor({ centerIds: [], authorizedCenterIds: [] }), filters()); assert.equal(empty.logs.length, 0); assert.equal(empty.stats.total, 0);
});
test("all composed filters remain AND-scoped including sensitive and actor queries", async () => {
  const f = auditFixture(0); f.rows.push(f.event("good", "closed-a", "tenant-a", { action: "lead.sensitive", resource: "Incident" }), f.event("foreign", "school-b", "tenant-b", { action: "lead.sensitive", resource: "Incident" }));
  const page = await readAuditHistoryPage(f.db, auditActor(), filters({ q: "reviewer", centerId: "closed-a", action: "lead.sensitive", resource: "Incident" }));
  assert.deepEqual(page.stats, { total: 1, sensitive: 1, leadActions: 1 }); assert.equal(page.logs[0].id, "good");
  const scope = await readAuditHistoryScope(f.db, auditActor()); assert.ok(Array.isArray(auditHistoryWhere(scope, filters({ q: "x" }), "America/New_York").AND));
});
test("school-local audit date filters include DST-short and long days exactly", async () => {
  for (const [day, start, end] of [["2026-03-08", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"], ["2026-11-01", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"]]) {
    const f = auditFixture(0), s = Date.parse(start), e = Date.parse(end);
    [s - 1, s, e - 1, e].forEach((at, i) => f.rows.push(f.event("row-" + i, "school-a", "tenant-a", { createdAt: new Date(at) })));
    const input = parseAuditHistoryFilters({ start: day, end: day }, new Date("2026-12-01T00:00:00Z"));
    assert.deepEqual((await readAuditHistoryPage(f.db, auditActor(), input)).logs.map(row => row.id).sort(), ["row-1", "row-2"]);
  }
});
test("CSV neutralizes formulas after whitespace and quotes delimiters newlines exactly", () => {
  for (const value of ["=1+1", " +cmd", "\t-2", "\r\n@formula"]) assert.ok(auditCsvRow([value]).startsWith('"\''));
  assert.equal(auditCsvRow(['a,"b"\nc']), '"a,""b""\nc"\r\n');
});
test("full audit CSV crosses internal pages without duplicates and excludes metadata", async () => {
  const f = auditFixture(501); f.rows[0].resourceId = "=DANGEROUS_FAKE_FORMULA()";
  const result = await readAuditHistoryCsv(f.db, auditActor(), filters({ page: "7" })); assert.equal(result.rows, 501); assert.equal(result.bytes, Buffer.byteLength(result.csv));
  assert.equal((result.csv.match(/fake-record-event-/g) ?? []).length, 500); assert.match(result.csv, /'\=DANGEROUS_FAKE_FORMULA/);
  assert.equal(f.calls.filter(call => call.model === "events").length, 3); assert.doesNotMatch(result.csv, /DO_NOT_SERIALIZE|FAKE_SECRET|internal-user|tenant-a/);
});
test("audit export fails wholly at row or UTF-8 byte limits and can retry narrowed", async () => {
  const f = auditFixture(3); await assert.rejects(readAuditHistoryCsv(f.db, auditActor(), filters(), { rows: 2, bytes: 10000 }), (error: unknown) => error instanceof AuditHistoryError && error.statusCode === 413);
  assert.equal(f.calls.filter(call => call.model === "events").length, 0);
  await assert.rejects(readAuditHistoryCsv(f.db, auditActor(), filters(), { rows: 3, bytes: 120 }), (error: unknown) => error instanceof AuditHistoryError && error.statusCode === 413);
  const result = await readAuditHistoryCsv(f.db, auditActor(), filters({ q: "event-00001" }), { rows: 2, bytes: 10000 }); assert.equal(result.rows, 1);
});
