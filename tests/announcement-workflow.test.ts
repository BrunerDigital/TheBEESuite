import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, UserRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { AnnouncementWorkflowError, loadAnnouncementForActor, saveAnnouncement } from "../src/lib/announcement-persistence";
import { announcementCreateId, announcementDraftSignature, announcementRecordSignature, isSchoolParentAudience, legacyParentAudienceLabels, readAnnouncementReceipt, schoolParentAudience, type AnnouncementRecord } from "../src/lib/announcement-workflow";
import { parentAnnouncementAudienceWhere } from "../src/lib/announcement-scope";
import { readAnnouncementPage } from "../src/lib/announcement-page";
import { matchesPrismaWhere } from "./helpers/matches-prisma-where";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const record = (extra = {}): AnnouncementRecord => ({ id: "fake-announcement", centerId: "fake-school", title: "Fake school notice", body: "Fake message for families.", audience: schoolParentAudience, status: "draft", sendAt: null, ...extra });
type Actor = Parameters<typeof saveAnnouncement>[0]["actor"];
type Input = Record<string, unknown>;
function fixture(initial: AnnouncementRecord[] = []) {
  const center = { id: "fake-school", status: "active", organization: { tenantId: "fake-tenant" } };
  const actor: Actor = { id: "fake-author", email: "author@example.invalid", role: UserRole.CENTER_DIRECTOR, identityTenantId: "fake-tenant", tenantId: "fake-tenant", sessionVersion: 3, deviceSessionId: "fake-device", centerIds: [center.id], workspace: { mode: "center", activeCenterId: center.id } as Actor["workspace"] };
  const user = { id: actor.id, email: actor.email, tenantId: actor.identityTenantId, role: actor.role, isActive: true, sessionVersion: 3, mustResetPassword: false, staffProfile: { centerId: center.id, center: structuredClone(center) } as object | null, accessGrants: [] as object[] };
  const device = { id: actor.deviceSessionId, userId: actor.id, tenantId: actor.identityTenantId, revokedAt: null as Date | null };
  let rows = structuredClone(initial), audits: Input[] = [], queue = Promise.resolve();
  const controls = { failAudit: false, beforeUpdate: null as (() => void) | null };
  const calls: Array<{ model: string; where: unknown }> = [];
  const matchRecord = (row: AnnouncementRecord, where: Input) => Object.entries(where).every(([key, expected]) => {
    const actual = row[key as keyof AnnouncementRecord];
    if (key === "audience" && expected && typeof expected === "object" && "equals" in expected) {
      const value = (expected as { equals: unknown }).equals;
      return value === Prisma.AnyNull ? actual === null : JSON.stringify(actual) === JSON.stringify(value);
    }
    return actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;
  });
  const tx = {
    center: { async findFirst({ where }: { where: Input }) { calls.push({ model: "center", where }); return where.id === center.id && center.status !== "closed" ? structuredClone(center) : null; } },
    user: { async findFirst({ where }: { where: unknown }) { calls.push({ model: "user", where }); return matchesPrismaWhere(user, where) ? { id: user.id } : null; } },
    deviceSession: { async findFirst({ where }: { where: unknown }) { calls.push({ model: "device", where }); return matchesPrismaWhere(device, where) ? { id: device.id } : null; } },
    announcement: {
      async findUnique({ where }: { where: Input }) { return structuredClone(rows.find(row => row.id === where.id) ?? null); },
      async findFirst({ where }: { where: Input }) { return structuredClone(rows.find(row => matchRecord(row, where)) ?? null); },
      async create({ data }: { data: AnnouncementRecord }) { assert.ok(!rows.some(row => row.id === data.id)); rows.push(structuredClone(data)); return structuredClone(data); },
      async updateMany({ where, data }: { where: Input; data: Partial<AnnouncementRecord> }) { controls.beforeUpdate?.(); const found = rows.find(row => matchRecord(row, where)); if (!found) return { count: 0 }; Object.assign(found, structuredClone(data)); return { count: 1 }; },
    },
    auditLog: {
      async findFirst({ where }: { where: Input }) { return audits.find(row => matchesPrismaWhere(row, where)) ?? null; },
      async create({ data }: { data: Input }) { if (controls.failAudit) throw new Error("Fake audit storage failure"); audits.push({ ...data, id: `fake-audit-${audits.length}` }); return data; },
    },
  };
  const database = { async $transaction(callback: (db: typeof tx) => Promise<unknown>, options: object) {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    const result = queue.then(async () => { const before = structuredClone({ rows, audits }); try { return await callback(tx); } catch (error) { rows = before.rows; audits = before.audits; throw error; } });
    queue = result.then(() => {}, () => {}); return result;
  } } as unknown as Parameters<typeof saveAnnouncement>[0]["database"];
  // Construct the production DTO without forbidden legacy fields.
  const run = (input: Input = {}) => { const r = record(); return saveAnnouncement({ database, actor, input: { intent: "save", requestId, centerId: r.centerId, title: r.title, body: r.body, ...input } }); };
  return { actor, center, user, device, controls, calls, database, run, rows: () => rows, audits: () => audits };
}
const rejects = (run: () => Promise<unknown>, status: number) => assert.rejects(run, (error: unknown) => error instanceof AnnouncementWorkflowError && error.status === status);
const edit = (source: AnnouncementRecord, extra: Input = {}) => ({ id: source.id, expectedRecordSignature: announcementRecordSignature(source), centerId: source.centerId, title: source.title, body: source.body, ...extra });

test("stable creation and concurrent replay create exactly one draft and atomic audit", async () => {
  const f = fixture(); const [a, b] = await Promise.all([f.run(), f.run()]);
  assert.equal(a.id, announcementCreateId(requestId)); assert.deepEqual(a, b);
  assert.equal(f.rows().length, 1); assert.equal(f.audits().length, 1);
  assert.deepEqual(f.audits()[0].metadata, { portalOnly: true, deliveryDispatched: false });
  assert.equal(a.status, "draft"); assert.equal(a.sendAt, null);
});
test("replayed creation must match exact creator and unchanged draft", async () => {
  const f = fixture(); await f.run(); await rejects(() => f.run({ title: "Different" }), 409);
  f.actor.id = f.user.id = f.device.userId = "another-author";
  await rejects(() => f.run(), 409); assert.equal(f.audits().length, 1);
});
test("audit failure rolls back both creation and published edit", async () => {
  for (const source of [null, record({ status: "published", sendAt: new Date("2026-09-13T12:00:00Z") })]) {
    const f = fixture(source ? [source] : []); f.controls.failAudit = true;
    await assert.rejects(() => f.run(source ? edit(source, { title: "Changed", confirmPublishedEdit: true }) : {}), /Fake audit/);
    assert.deepEqual(f.rows(), source ? [source] : []); assert.equal(f.audits().length, 0);
  }
});
test("ordinary save preserves legacy audience, state and timestamp exactly", async () => {
  const source = record({ audience: { staffIds: ["fake-staff"] }, status: "scheduled", sendAt: new Date("2026-09-14T12:00:00Z") });
  const f = fixture([source]); const saved = await f.run(edit(source, { title: "Reviewed title" }));
  assert.deepEqual(saved, { ...source, title: "Reviewed title" });
});
test("unchanged and whitespace-only draft/published saves do not write or create audit noise", async () => {
  for (const status of ["draft", "published"]) {
    const source = record({ title: "  Retained legacy spaces  ", status }); const f = fixture([source]);
    for (const title of [source.title, source.title.trim()]) assert.deepEqual(await f.run(edit(source, { title })), source);
    assert.equal(f.audits().length, 0); assert.deepEqual(f.rows(), [source]);
  }
});
test("publish requires an exact saved parent draft and subsequent edits need confirmation", async () => {
  const source = record(); const f = fixture([source]);
  await rejects(() => f.run(edit(source, { intent: "publish", body: "Unsaved" })), 409);
  const published = await f.run(edit(source, { intent: "publish" }));
  assert.equal(published.status, "published"); assert.ok(published.sendAt instanceof Date);
  await rejects(() => f.run(edit(published, { title: "Changed" })), 400);
  const saved = await f.run(edit(published, { title: "Changed", confirmPublishedEdit: true }));
  assert.equal(saved.title, "Changed"); assert.deepEqual(saved.sendAt, published.sendAt);
  await rejects(() => f.run(edit(published, { intent: "publish" })), 409);
});
for (const audience of [{ staff: true }, { label: "parents", ids: ["fake"] }, ["parents"], {}, "parents"]) test(`targeted audience cannot broaden: ${JSON.stringify(audience)}`, async () => {
  const source = record({ audience }); const f = fixture([source]);
  await rejects(() => f.run(edit(source, { intent: "publish" })), 409); assert.deepEqual(f.rows(), [source]);
});
test("stale record and in-transaction conditional conflict cannot overwrite another save", async () => {
  const source = record(); const f = fixture([source]);
  const results = await Promise.allSettled([f.run(edit(source, { title: "First" })), f.run(edit(source, { title: "Second" }))]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "rejected"]); assert.equal(f.rows()[0].title, "First");
  const next = fixture([source]); next.controls.beforeUpdate = () => { next.rows()[0].body = "Concurrent edit"; };
  await rejects(() => next.run(edit(source, { title: "No overwrite" })), 409); assert.equal(next.audits().length, 0);
});
for (const [label, change] of Object.entries({
  inactive: (f: ReturnType<typeof fixture>) => { f.user.isActive = false; },
  role: (f: ReturnType<typeof fixture>) => { f.user.role = UserRole.TEACHER; },
  session: (f: ReturnType<typeof fixture>) => { f.user.sessionVersion++; },
  reset: (f: ReturnType<typeof fixture>) => { f.user.mustResetPassword = true; },
  device: (f: ReturnType<typeof fixture>) => { f.device.revokedAt = new Date(); },
  homeTenant: (f: ReturnType<typeof fixture>) => { f.user.tenantId = "foreign"; },
  school: (f: ReturnType<typeof fixture>) => { f.actor.centerIds = ["foreign"]; },
  targetTenant: (f: ReturnType<typeof fixture>) => { f.center.organization.tenantId = "foreign"; },
  closed: (f: ReturnType<typeof fixture>) => { f.center.status = "closed"; },
  assignment: (f: ReturnType<typeof fixture>) => { f.user.staffProfile = null; },
})) test(`current authority rejects ${label} before a write`, async () => { const f = fixture(); change(f); await rejects(() => f.run(), 403); assert.equal(f.rows().length, 0); assert.equal(f.audits().length, 0); });
test("exact active center grant substitutes for profile but wrong/expired grant does not", async () => {
  const f = fixture(); f.user.staffProfile = null;
  const grant = { tenantId: f.actor.identityTenantId, isActive: true, startsAt: null, endsAt: null as Date | null, scopeType: "CENTER", centerId: f.center.id, center: f.center, role: f.actor.role };
  f.user.accessGrants = [grant]; assert.ok(await f.run()); grant.endsAt = new Date("2020-01-01"); await rejects(() => f.run(), 403);
});
test("platform target uses separate home identity and target-school audit tenant", async () => {
  const f = fixture(); f.actor.role = f.user.role = UserRole.PLATFORM_OWNER;
  f.actor.identityTenantId = f.user.tenantId = f.device.tenantId = "fake-home";
  await f.run(); assert.equal(f.audits()[0].tenantId, "fake-tenant");
  assert.equal((f.calls.find(call => call.model === "user")!.where as Input).tenantId, "fake-home");
});
test("platform-wide creation is explicit and forbidden in a selected-school workspace", async () => {
  const f = fixture(); await rejects(() => f.run({ centerId: null, platformWide: true }), 403);
  f.actor.role = f.user.role = UserRole.PLATFORM_OWNER;
  await rejects(() => f.run({ centerId: null, platformWide: true }), 403);
  f.actor.workspace = { mode: "all" } as Actor["workspace"];
  await rejects(() => f.run({ centerId: null }), 400);
  assert.equal((await f.run({ centerId: null, platformWide: true })).centerId, null);
});
test("saved lookup and updates never reparent or leak a foreign school's body", async () => {
  const source = record({ centerId: "foreign" }); const f = fixture([source]);
  await rejects(() => loadAnnouncementForActor(f.database, f.actor, source.id), 403);
  await rejects(() => f.run(edit(source, { centerId: "fake-school" })), 403);
  assert.equal(await loadAnnouncementForActor(f.database, f.actor, "missing"), null);
});
test("server ignores no implicit legacy status/audience/time editing contract", async () => {
  const f = fixture(); for (const key of ["status", "audience", "sendAt", "expiresAt"]) await rejects(() => f.run({ [key]: "arbitrary" }), 400);
  for (const input of [{ requestId: "invalid" }, { title: " " }, { body: "x".repeat(10001) }, { intent: "delete" }]) await rejects(() => f.run(input), 400);
  assert.equal(f.rows().length, 0);
});
test("parent query and publisher accept exactly the same whole-school audience shapes", () => {
  const filter = parentAnnouncementAudienceWhere();
  assert.deepEqual(filter, { OR: [{ audience: { equals: Prisma.AnyNull } }, ...legacyParentAudienceLabels.map(label => ({ audience: { equals: { label } } }))] });
  assert.ok(isSchoolParentAudience(null)); for (const label of legacyParentAudienceLabels) assert.ok(isSchoolParentAudience({ label }));
  assert.ok(!isSchoolParentAudience({ label: "parents", childIds: ["fake"] }));
  assert.match(readFileSync("src/app/[slug]/page.tsx", "utf8"), /status: \{ in: \["active", "sent", "published"\] \},\s+AND: \[parentAnnouncementAudienceWhere\(\)\]/);
});
test("receipts bind exact identity, title/body, audience, intent and retained publication time", () => {
  const source = record({ audience: null, status: "published", sendAt: new Date("2026-09-13T12:00:00Z") });
  const expected = { id: source.id, requestId: "", intent: "save" as const, draft: source, source };
  const response = { ok: true, entity: "announcement", portalOnly: true, intent: "save", record: JSON.parse(JSON.stringify(source)) };
  assert.ok(readAnnouncementReceipt(response, expected));
  for (const field of [{ id: "wrong" }, { centerId: "wrong" }, { audience: schoolParentAudience }, { title: "wrong" }, { status: "draft" }, { sendAt: null }]) assert.equal(readAnnouncementReceipt({ ...response, record: { ...response.record, ...field } }, expected), null);
  assert.equal(readAnnouncementReceipt({ ...response, portalOnly: false }, expected), null);
  assert.equal(announcementDraftSignature(source), announcementDraftSignature({ ...source }));
});
test("saved history uses full count, exact scope, deterministic ties and real next/previous pages", async () => {
  const where = { centerId: { in: ["fake-school"] } }; let selected: Input | null = null;
  const database = { announcement: { async count(input: Input) { assert.deepEqual(input, { where }); return 101; }, async findMany(input: Input) { selected = input; return []; } } } as unknown as Parameters<typeof readAnnouncementPage>[0];
  const page = await readAnnouncementPage(database, where, "3");
  assert.equal(page.pagination.total, 101); assert.equal(page.pagination.from, 101); assert.equal(page.pagination.previousHref, "/announcements?page=2"); assert.equal(page.pagination.nextHref, null);
  assert.deepEqual((selected as unknown as Input).orderBy, [{ sendAt: "desc" }, { title: "asc" }, { id: "asc" }]);
  assert.equal((selected as unknown as Input).skip, 100); assert.equal((selected as unknown as Input).take, 50);
});
