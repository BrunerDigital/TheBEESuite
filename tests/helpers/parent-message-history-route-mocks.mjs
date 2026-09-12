import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

const actor = { id: "fake-parent", tenantId: "fake-tenant", role: "PARENT_GUARDIAN", isActive: true };
let user, family, rows, failRead, signed, queries;
function reset() {
  user = { ...actor }; failRead = false; signed = []; queries = [];
  family = { id: "fake-family", centerId: "fake-school", guardians: [{ userId: actor.id }], children: [{ id: "fake-child", familyId: "fake-family", enrollmentStatus: "active", classroomId: "fake-class", classroom: { centerId: "fake-school", center: { organization: { tenantId: actor.tenantId } } } }] };
  rows = Array.from({ length: 41 }, (_, index) => ({ id: `message-${String(index).padStart(3, "0")}`, familyId: family.id,
    subject: `Canonical subject ${index}`, body: "Fake school message", createdAt: new Date("2026-09-12T14:00:00Z"), senderId: "fake-teacher", sender: { name: "Fake Teacher", role: "TEACHER" },
    metadata: { private: "must not escape", attachments: [{ id: "fake-attachment", filename: "fake.txt", contentType: "text/plain", size: 10, bucket: "child-media", storageKey: "fake/internal-key", url: "supabase://fake/key", kind: "file", uploadedAt: "2026-09-12", uploadedById: "internal-uploader" }] } }));
}
function matches(value, where) {
  return Object.entries(where).every(([key, filter]) => {
    if (key === "AND") return filter.every(part => matches(value, part));
    if (key === "OR") return filter.some(part => matches(value, part));
    if (filter instanceof Date) return value?.[key]?.getTime() === filter.getTime();
    if (filter === null || typeof filter !== "object") return value?.[key] === filter;
    if ("in" in filter) return filter.in.includes(value?.[key]);
    if ("notIn" in filter) return !filter.notIn.includes(value?.[key]);
    if ("not" in filter) return value?.[key] !== filter.not;
    if ("lt" in filter) return value?.[key] < filter.lt;
    if ("some" in filter && !value?.[key]?.some(item => matches(item, filter.some))) return false;
    if ("none" in filter && !value?.[key]?.every(item => !matches(item, filter.none))) return false;
    if ("some" in filter || "none" in filter) return true;
    return Boolean(value?.[key] && matches(value[key], filter));
  });
}
const message = {
  async findFirst({ where }) { queries.push(where); return structuredClone(rows.find(row => matches({ ...row, family }, where)) ?? null); },
  async findMany({ where, take, orderBy }) {
    if (failRead) throw new Error("FAKE DATABASE SECRET must not escape");
    queries.push(where); assert.equal(take, 21); assert.deepEqual(orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    return structuredClone(rows.filter(row => matches({ ...row, family }, where)).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)).slice(0, take));
  },
};
const prisma = {
  center: { async findMany({ where }) { assert.deepEqual(where, { organization: { tenantId: actor.tenantId } }); return [{ id: "fake-school" }]; } },
  guardian: { async findMany({ where }) { return matches({ userId: actor.id, family }, where) ? [{ id: "fake-guardian", familyId: family.id, family: { _count: { children: family.children.filter(child => child.enrollmentStatus === "active").length } } }] : []; } },
  family: { async findFirst({ where }) { return matches(family, where) ? { id: family.id } : null; } }, message,
  async $transaction(callback, options) { assert.equal(options.isolationLevel, "RepeatableRead"); return callback(prisma); },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return user?.isActive ? user : null; }, isParentGuardian(value) { return value.role === "PARENT_GUARDIAN"; } } });
mock.module("@/lib/supabase-storage", { namedExports: { async createMessageAttachmentSignedUrl(key, _expiry, bucket) { signed.push({ key, bucket }); return "https://files.example.test/signed-fake"; } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler, options) { assert.deepEqual(options, { omitRequestBody: true, omitResponseBody: true }); return handler; } } });
const { GET } = await import("../../src/app/api/parent/history/messages/route.ts");
const get = (query = "familyId=fake-family") => GET(new NextRequest(`https://fixture.invalid/api/parent/history/messages?${query}`));
test("parent message history actual GET uses current-family scope and stable bounded pages", async t => {
  await t.test("41 equal-timestamp messages continue without gaps after a concurrent newer insert", async () => {
    reset(); const first = await get(); assert.equal(first.status, 200); assert.equal(first.headers.get("cache-control"), "private, no-store");
    const a = await first.json(); assert.equal(a.items.length, 20); assert.equal(a.nextCursor, "message-021");
    rows.push({ ...rows[0], id: "new-message", createdAt: new Date("2026-09-12T15:00:00Z") });
    const b = await (await get(`familyId=fake-family&cursor=${a.nextCursor}`)).json();
    const c = await (await get(`familyId=fake-family&cursor=${b.nextCursor}`)).json();
    assert.equal(b.requestCursor, a.nextCursor); assert.equal(b.items.length, 20); assert.equal(c.items.length, 1); assert.equal(c.nextCursor, null);
    assert.equal(new Set([...a.items, ...b.items, ...c.items].map(item => item.id)).size, 41);
    for (const query of queries) assert.match(JSON.stringify(query), /guardians.*fake-parent.*children.*fake-tenant/);
    for (const page of [a, b, c]) {
      assert.doesNotMatch(JSON.stringify(page), /metadata|senderId|role|storageKey|bucket|uploadedById|uploadedAt|supabase:\/\//);
      assert.deepEqual(Object.keys(page.items[0].attachments[0]).sort(), ["downloadUrl", "filename", "id", "kind", "size"]);
      assert.equal(page.items[0].canReport, true); assert.equal(page.items[0].isFromFamily, false);
    }
    assert.equal(signed.length, 41);
  });
  await t.test("parent pickup foreign family removed guardian payment-only and moved school fail closed", async () => {
    for (const change of [() => { user = null; }, () => { user.isActive = false; }, () => { user.role = "AUTHORIZED_PICKUP"; }, () => { user.role = "TEACHER"; },
      () => { family.guardians = []; }, () => { family.children = []; }, () => { family.children[0].enrollmentStatus = "inactive"; },
      () => { family.centerId = "foreign-school"; }, () => { family.children[0].classroom.center.organization.tenantId = "foreign-tenant"; }]) {
      reset(); change(); const response = await get(); assert.ok([401, 403].includes(response.status)); assert.equal(signed.length, 0); assert.equal(queries.length, 0);
    }
    reset(); assert.equal((await get("familyId=foreign-family")).status, 403);
    reset(); family.centerId = null; assert.equal((await get()).status, 200, "Legacy centerless family is allowed only through current authorized child school");
    family.children.push({ ...family.children[0], id: "foreign-child", classroom: { centerId: "foreign-school", center: { organization: { tenantId: "foreign-tenant" } } } });
    assert.equal((await get()).status, 403, "Ambiguous mixed-tenant legacy family is denied");
  });
  await t.test("invalid duplicate tampered and foreign cursors never silently restart history", async () => {
    for (const query of ["", "familyId=", "familyId=../bad", "familyId=fake-family&cursor=", "familyId=fake-family&cursor=../bad", "familyId=fake-family&cursor=missing", "familyId=fake-family&familyId=foreign", "familyId=fake-family&childId=fake-child", "familyId=fake-family&cursor=a&cursor=b"]) {
      reset(); assert.equal((await get(query)).status, 400, query); assert.equal(signed.length, 0);
    }
    reset(); rows[0].familyId = "foreign-family"; assert.equal((await get("familyId=fake-family&cursor=message-000")).status, 400);
  });
  await t.test("read failures are sanitized private responses and never a successful empty page", async () => {
    reset(); failRead = true; const response = await get(); assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(await response.text(), /FAKE DATABASE SECRET/); assert.equal(signed.length, 0);
  });
});
