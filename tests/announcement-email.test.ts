import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { previewAnnouncementEmail, sendAnnouncementEmail, announcementEmailStatus } from "../src/lib/announcement-email";
import { AnnouncementWorkflowError } from "../src/lib/announcement-persistence";
import { currentlyEnrolledStatusValues } from "../src/lib/enrollment-status";
import { APP_REVIEW_RESERVED_EMAILS } from "../src/lib/app-review-targeting";
import { matchesPrismaWhere } from "./helpers/matches-prisma-where";
type Input = Record<string, unknown>;
type Options = Parameters<typeof sendAnnouncementEmail>[0];
function fixture() {
  const actor: Options["actor"] = { id: "fake-author", email: "author@example.invalid", role: "BRAND_ADMIN", identityTenantId: "fake-tenant", tenantId: "fake-tenant", sessionVersion: 3, deviceSessionId: "fake-device", centerIds: ["fake-school"], workspace: { mode: "center", activeCenterId: "fake-school" } as Options["actor"]["workspace"] };
  const school = { id: "fake-school", name: "Fake School", crmLocationId: null, email: "school@example.invalid", status: "active", organization: { tenantId: actor.tenantId } };
  const user = { id: actor.id, email: actor.email, tenantId: actor.tenantId, role: actor.role, isActive: true, sessionVersion: 3, mustResetPassword: false };
  const device = { id: actor.deviceSessionId, userId: actor.id, tenantId: actor.tenantId, revokedAt: null as Date | null };
  const announcement = { id: "fake-announcement", centerId: school.id as string | null, title: "Fake update", body: "Only fake content.", audience: { label: "school_parent_portal" } as unknown, status: "published", sendAt: new Date("2026-09-13T12:00:00Z") };
  const family = (id: string) => ({ id, centerId: school.id, center: school, billingEmail: `${id}@example.invalid`, guardians: [{ email: `${id}@example.invalid` }], children: [{ enrollmentStatus: currentlyEnrolledStatusValues()[0] as string, classroomId: "fake-classroom" as string | null, classroom: { centerId: school.id, center: school } }] });
  const families = [family("fake-family")];
  let deliveries: Input[] = [], audits: Input[] = [], queue = Promise.resolve();
  const controls = { failReserve: false, failFinalize: false, failAudit: false };
  function match(row: unknown, where: unknown): boolean {
    if (where === null || typeof where !== "object" || where instanceof Date) return matchesPrismaWhere(row, where);
    const fields = where as Input;
    if ("path" in fields) { let value = row; for (const part of fields.path as string[]) value = value && typeof value === "object" ? (value as Input)[part] : undefined; return value === fields.equals; }
    if ("not" in fields) return !match(row, fields.not);
    if ("in" in fields) return (fields.in as unknown[]).includes(row);
    if ("some" in fields) return Array.isArray(row) && row.some(item => match(item, fields.some));
    return Object.entries(fields).every(([key, value]) => key === "OR" ? (value as unknown[]).some(part => match(row, part)) : key === "AND" ? (value as unknown[]).every(part => match(row, part)) : !!row && typeof row === "object" && Object.hasOwn(row, key) && match((row as Input)[key], value));
  }
  const tx = {
    user: { async findFirst({ where }: { where: unknown }) { return match(user, where) ? user : null; } },
    deviceSession: { async findFirst({ where }: { where: unknown }) { return match(device, where) ? device : null; } },
    center: { async findFirst({ where }: { where: unknown }) { return match(school, where) ? school : null; } },
    announcement: { async findUnique({ where }: { where: unknown }) { return match(announcement, where) ? structuredClone(announcement) : null; } },
    family: { async findMany({ where, orderBy, take }: { where: unknown; orderBy: unknown; take: number }) { assert.deepEqual(orderBy, { id: "asc" }); assert.equal(take, 1001); return structuredClone(families.filter(row => match(row, where)).toSorted((a, b) => a.id.localeCompare(b.id)).slice(0, take)); } },
    integrationDelivery: {
      async findFirst({ where }: { where: unknown }) { return structuredClone(deliveries.find(row => match(row, where)) ?? null); },
      async create({ data }: { data: Input }) { if (controls.failReserve) throw new Error("Fake reserve failure"); assert.ok(!deliveries.some(row => row.dedupeKey === data.dedupeKey)); deliveries.push(structuredClone(data)); return structuredClone(data); },
      async updateMany({ where, data }: { where: unknown; data: Input }) { if (controls.failFinalize) throw new Error("Fake finalization failure"); const row = deliveries.find(value => match(value, where)); if (!row) return { count: 0 }; Object.assign(row, structuredClone(data)); return { count: 1 }; },
    },
    auditLog: { async create({ data }: { data: Input }) { if (controls.failAudit) throw new Error("Fake audit failure"); audits.push(structuredClone(data)); return data; } },
  };
  const database = { $transaction(callback: (value: typeof tx) => Promise<unknown>, options: unknown) {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    const result = queue.then(async () => { const before = structuredClone({ deliveries, audits }); try { return await callback(tx); } catch (error) { deliveries = before.deliveries; audits = before.audits; throw error; } }); queue = result.then(() => {}, () => {}); return result;
  } } as unknown as Options["database"];
  const sends: Parameters<Options["send"]>[0][] = [];
  let behavior: Options["send"] = async () => ({ ok: true, configured: true, provider: "sendgrid", id: "fake-provider-id" });
  const preview = () => previewAnnouncementEmail(database, actor, announcement.id);
  const send = (fingerprint: string, input: Input = {}) => sendAnnouncementEmail({ database, actor, id: announcement.id, input: { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedFingerprint: fingerprint, confirmEmail: true, ...input }, send: async mail => { assert.equal(deliveries.length, 1); assert.equal(audits.length, 1); sends.push(mail); return behavior(mail); } });
  return { actor, user, device, school, announcement, families, family, controls, preview, send, sends, behavior: (next: Options["send"]) => { behavior = next; }, deliveries: () => deliveries, audits: () => audits };
}
const denied = (run: () => Promise<unknown>, status: number) => assert.rejects(run, (error: unknown) => error instanceof AnnouncementWorkflowError && error.status === status);

test("preview is read-only and excludes retired, childless, foreign-school and malformed-classroom families", async () => {
  const f = fixture(); const retired = f.family("retired"); retired.children[0].enrollmentStatus = "Withdrawn";
  const childless = f.family("childless"); childless.children = [];
  const foreign = f.family("foreign"); foreign.centerId = "foreign-school";
  const wrongRoom = f.family("wrong-room"); wrongRoom.children[0].classroom.centerId = "foreign-school";
  const noRoom = f.family("no-room"); noRoom.children[0].classroomId = null;
  f.families.push(retired, childless, foreign, wrongRoom, noRoom);
  const preview = await f.preview(); assert.equal(preview.familyCount, 1); assert.equal(preview.recipientCount, 1); assert.equal(preview.attempt, null);
  assert.equal(f.sends.length, 0); assert.equal(f.deliveries().length, 0); assert.equal(f.audits().length, 0);
  assert.ok(!JSON.stringify(preview).includes("@example.invalid"));
});
test("reservation and creator audit precede one private recipient snapshot send, not portal status writes", async () => {
  const f = fixture(), before = structuredClone(f.announcement), preview = await f.preview();
  const result = await f.send(preview.fingerprint);
  assert.equal(result.attempt.status, "queued"); assert.equal(f.sends.length, 1); assert.deepEqual(f.sends[0].to, ["fake-family@example.invalid"]);
  assert.equal(f.sends[0].tenantId, f.school.organization.tenantId); assert.equal(f.sends[0].disableClickTracking, true);
  assert.equal(f.deliveries()[0].maxAttempts, 1); assert.equal(f.deliveries()[0].nextAttemptAt, null); assert.deepEqual(f.announcement, before);
  assert.ok(!JSON.stringify(f.deliveries()).includes("@example.invalid")); assert.equal(f.audits().length, 2);
});
test("reserved review recipients are excluded before preview, reservation and provider arguments", async () => {
  const f = fixture(); f.families[0].guardians.push(...APP_REVIEW_RESERVED_EMAILS.map(email => ({ email })));
  const preview = await f.preview(); assert.equal(preview.recipientCount, 1); assert.equal(preview.suppressedRecipientCount, 2);
  await f.send(preview.fingerprint); assert.deepEqual(f.sends[0].to, ["fake-family@example.invalid"]);
  assert.equal((f.deliveries()[0].payload as Input).suppressedRecipientCount, 2);
  const allReserved = fixture(); allReserved.families[0].billingEmail = APP_REVIEW_RESERVED_EMAILS[0]; allReserved.families[0].guardians = [{ email: APP_REVIEW_RESERVED_EMAILS[1] }];
  await denied(allReserved.preview, 409); assert.equal(allReserved.sends.length, 0); assert.equal(allReserved.deliveries().length, 0);
});
test("same and different request IDs cannot duplicate a concurrently confirmed email", async () => {
  const f = fixture(), preview = await f.preview();
  const outcomes = await Promise.allSettled([f.send(preview.fingerprint), f.send(preview.fingerprint), f.send(preview.fingerprint, { requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })]);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ["fulfilled", "fulfilled", "rejected"]);
  assert.equal(f.sends.length, 1); assert.equal(f.deliveries().length, 1);
  assert.ok((await f.preview()).attempt);
  await denied(() => f.send("0".repeat(64)), 409);
  f.actor.id = f.user.id = f.device.userId = "different-author"; await denied(() => f.send(preview.fingerprint), 409);
});
for (const field of ["title", "recipients", "family", "sender"] as const) test(`changed ${field} invalidates preview before reservation`, async () => {
  const f = fixture(), preview = await f.preview();
  if (field === "title") f.announcement.title = "Changed";
  if (field === "recipients") f.families[0].guardians.push({ email: "new@example.invalid" });
  if (field === "family") f.families[0].id = "different-family";
  if (field === "sender") f.school.email = "changed@example.invalid";
  await denied(() => f.send(preview.fingerprint), 409); assert.equal(f.sends.length, 0); assert.equal(f.deliveries().length, 0);
});
test("targeted, draft, platform-wide and revoked school access fail closed", async () => {
  for (const change of [(f: ReturnType<typeof fixture>) => { f.announcement.audience = { label: "parents", selectedIds: ["fake"] }; }, (f: ReturnType<typeof fixture>) => { f.announcement.status = "draft"; }]) { const f = fixture(); change(f); await denied(f.preview, 409); }
  const global = fixture(); global.announcement.centerId = null; await denied(global.preview, 400);
  for (const change of [(f: ReturnType<typeof fixture>) => { f.actor.centerIds = []; }, (f: ReturnType<typeof fixture>) => { f.device.revokedAt = new Date(); }, (f: ReturnType<typeof fixture>) => { f.user.sessionVersion++; }]) { const f = fixture(); const p = await f.preview(); change(f); await denied(() => f.send(p.fingerprint), 403); assert.equal(f.sends.length, 0); }
});
test("1,000 recipients are supported, 1,001 recipients or families reject without truncation", async () => {
  const f = fixture(); f.families.splice(0, 1, ...Array.from({ length: 1000 }, (_, i) => f.family(`fake-${i}`)));
  assert.equal((await f.preview()).recipientCount, 1000);
  f.families[0].guardians.push({ email: "overflow@example.invalid" }); await denied(f.preview, 409);
  f.families[0].guardians.pop(); f.families.push(f.family("overflow-family")); await denied(f.preview, 409); assert.equal(f.sends.length, 0);
});
for (const kind of ["reserve", "audit", "timeout", "finalize", "unconfigured"] as const) test(`${kind} failure cannot cause an unrecorded or repeated dispatch`, async () => {
  const f = fixture(), p = await f.preview();
  if (kind === "reserve") f.controls.failReserve = true;
  if (kind === "audit") f.controls.failAudit = true;
  if (kind === "timeout") f.behavior(async () => { throw new Error("Fake lost provider response"); });
  if (kind === "finalize") f.controls.failFinalize = true;
  if (kind === "unconfigured") f.behavior(async () => ({ ok: false, configured: false, provider: "sendgrid" }));
  if (kind === "reserve" || kind === "audit") { await assert.rejects(() => f.send(p.fingerprint)); assert.equal(f.sends.length, 0); assert.equal(f.deliveries().length, 0); }
  else { const first = await f.send(p.fingerprint); assert.notEqual(first.attempt.status, "queued"); await f.send(p.fingerprint); assert.equal(f.sends.length, 1); assert.equal((await f.preview()).attempt?.id, first.attempt.id); }
});
test("provider is held after reservation while other tabs can only observe unconfirmed status", async () => {
  const f = fixture(), p = await f.preview(); let finish!: () => void, started!: () => void;
  const observed = new Promise<void>(resolve => { started = resolve; });
  f.behavior(async () => { started(); await new Promise<void>(resolve => { finish = resolve; }); return { ok: true, configured: true, provider: "sendgrid" }; });
  const sending = f.send(p.fingerprint); await observed;
  assert.equal((await f.preview()).attempt?.status, "unconfirmed"); await f.send(p.fingerprint); assert.equal(f.sends.length, 1); finish(); await sending;
});
test("legacy pending batch remains held and both automatic selection and claim exclude announcements", async () => {
  const f = fixture(); f.deliveries().push({ id: "legacy", tenantId: f.actor.tenantId, centerId: f.school.id, provider: "sendgrid", purpose: "announcement_email", status: "pending", payload: { announcementId: f.announcement.id, effectiveRecipientCount: 1 } });
  assert.equal((await f.preview()).attempt?.status, "follow_up"); await denied(() => f.send("a".repeat(64)), 409); assert.equal(f.sends.length, 0);
  const source = readFileSync("src/lib/integration-deliveries.ts", "utf8");
  assert.equal((source.match(/purpose: \{ not: "announcement_email" \}/g) ?? []).length, 2);
  const retryTargets = source.split("const SENDGRID_EMAIL_PURPOSES")[1].split("])")[0]; assert.ok(!retryTargets.includes('"announcement_email"'));
});
test("single-recipient delivery webhook state never becomes a false all-delivered claim", () => {
  assert.deepEqual(announcementEmailStatus({ id: "fake", status: "delivered", payload: { recipientCount: 9 } }), { id: "fake", status: "queued", recipientCount: 9 });
});
