import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const actor = { id: "fake-parent", email: "fake-parent@example.test", tenantId: "fake-tenant", role: "PARENT_GUARDIAN", isActive: true };
let user, family, center, rows, queries, failRead, transactionActive, reserved;
function reset(count = 101) {
  user = { ...actor }; queries = []; failRead = false; transactionActive = false; reserved = false;
  center = { id: "fake-school", timezone: "America/New_York", customFields: {}, city: "New York", state: "NY", organization: { tenantId: actor.tenantId } };
  const classroom = { id: "fake-room", centerId: center.id, center };
  family = { id: "fake-family", centerId: center.id, guardians: [{ userId: actor.id }], children: [] };
  family.children = [1, 2].map(index => ({ id: "fake-child-" + index, familyId: family.id, enrollmentStatus: "active", classroomId: classroom.id, classroom }));
  rows = Array.from({ length: count }, (_, index) => ({ id: "notice-" + String(index).padStart(3, "0"), title: "Fake school notice " + index, body: "Fake notice body",
    centerId: index % 2 ? center.id : null, status: ["active", "published", "sent"][index % 3], audience: index % 2 ? { label: "families" } : null,
    sendAt: index < 12 ? null : new Date("2026-09-13T14:00:00Z"), private: "NEVER EXPOSE", metadata: { internal: true } }));
}
const comparable = value => value instanceof Date ? value.getTime() : value;
function filterMatches(value, filter) {
  if (filter instanceof Date || filter === null || typeof filter !== "object") return comparable(value) === comparable(filter);
  if (Object.keys(filter).length === 1 && Object.hasOwn(filter, "equals")) return filter.equals === Prisma.AnyNull ? value === null : JSON.stringify(value) === JSON.stringify(filter.equals);
  if (Array.isArray(value)) return Object.entries(filter).every(([operator, operand]) => {
    if (operator === "some") return value.some(item => matches(item, operand));
    if (operator === "none") return value.every(item => !matches(item, operand));
    if (operator === "every") return value.every(item => matches(item, operand));
    throw new Error("Unsupported array filter: " + operator);
  });
  const scalarOperators = ["in", "notIn", "not", "equals", "gt", "gte", "lt", "lte"];
  if (Object.keys(filter).some(key => scalarOperators.includes(key))) return Object.entries(filter).every(([operator, operand]) => {
    const a = comparable(value), b = comparable(operand);
    if (operator === "in") return operand.some(item => comparable(item) === a);
    if (operator === "notIn") return operand.every(item => comparable(item) !== a);
    if (operator === "not") return !filterMatches(value, operand);
    if (operator === "equals") return operand === Prisma.AnyNull ? value === null : JSON.stringify(value) === JSON.stringify(operand);
    if (operator === "gt") return a > b;
    if (operator === "gte") return a >= b;
    if (operator === "lt") return a < b;
    if (operator === "lte") return a <= b;
    throw new Error("Unsupported scalar filter: " + operator);
  });
  return value !== null && value !== undefined && typeof value === "object" && matches(value, filter);
}
function matches(value, where) {
  return Object.entries(where).every(([key, filter]) => {
    if (key === "AND") return (Array.isArray(filter) ? filter : [filter]).every(part => matches(value, part));
    if (key === "OR") return filter.some(part => matches(value, part));
    if (key === "NOT") return (Array.isArray(filter) ? filter : [filter]).every(part => !matches(value, part));
    return filterMatches(value?.[key], filter);
  });
}
function project(value, select) {
  if (value === null) return null;
  if (!select) throw new Error("Explicit projection required");
  return Object.fromEntries(Object.entries(select).filter(([, config]) => Boolean(config)).map(([key, config]) => {
    if (config === true) return [key, structuredClone(value[key])];
    const nested = value[key];
    return [key, Array.isArray(nested) ? nested.filter(row => !config.where || matches(row, config.where)).map(row => project(row, config.select)) : project(nested, config.select)];
  }));
}

function sorted(source) {
  return source.toSorted((a,b) => a.sendAt === null && b.sendAt !== null ? 1 : a.sendAt !== null && b.sendAt === null ? -1 : (b.sendAt?.getTime() ?? 0) - (a.sendAt?.getTime() ?? 0) || (a.id < b.id ? 1 : -1));
}
function recordQuery(input) {
  assert.equal(transactionActive, true, "same current-family snapshot");
  if (failRead) throw new Error("FAKE PRIVATE DATABASE FAILURE");
  const where = JSON.stringify(input.where); assert.match(where, /fake-school/); assert.match(where, /published/); assert.match(where, /audience/);
  queries.push(input);
}
const prisma = {
  center: {
    async findMany({ where }) { assert.deepEqual(where, { organization: { tenantId: actor.tenantId } }); return [center].filter(row => matches(row, where)).map(row => ({ id: row.id })); },
    async findFirst({ where, select }) { assert.equal(transactionActive, true); return project(matches(center, where) ? center : null, select); },
  },
  guardian: { async findMany({ where }) { return matches({ userId: actor.id, family }, where) ? [{ id: "fake-guardian", familyId: family.id, family: { _count: { children: family.children.filter(child => child.enrollmentStatus === "active" && child.classroomId).length } } }] : []; } },
  family: { async findFirst({ where, select }) { assert.equal(transactionActive, true); return project(matches(family, where) ? family : null, select); } },
  announcement: {
    async findFirst(input) { recordQuery(input); assert.deepEqual(input.select, { id: true, sendAt: true }); return project(rows.find(row => matches(row, input.where)) ?? null, input.select); },
    async findMany(input) {
      recordQuery(input); assert.equal(input.take, 9); assert.deepEqual(input.orderBy, [{ sendAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
      assert.deepEqual(input.select, { id: true, title: true, body: true, sendAt: true });
      return sorted(rows.filter(row => matches(row, input.where))).slice(0, input.take).map(row => project(row, input.select));
    },
  },
  async $transaction(callback, options) { assert.equal(options.isolationLevel, "RepeatableRead"); transactionActive = true; try { return await callback(prisma); } finally { transactionActive = false; } },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return user?.isActive ? user : null; }, isParentGuardian(value) { return value.role === "PARENT_GUARDIAN"; } } });
mock.module("@/lib/app-review-targeting", { namedExports: { appReviewReservedIdentityKind(email) { assert.equal(email, actor.email); return reserved ? "parent" : null; } } });
mock.module("@/lib/supabase-storage", { namedExports: {
  async createChildMediaSignedUrl() { throw new Error("Unexpected media signing"); },
  async createMessageAttachmentSignedUrl() { throw new Error("Unexpected message signing"); },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler, options) { assert.deepEqual(options, { omitRequestBody: true, omitResponseBody: true }); return handler; } } });
const { GET } = await import("../../src/app/api/parent/history/announcements/route.ts");
const get = (query = "familyId=fake-family") => GET(new NextRequest("https://fixture.invalid/api/parent/history/announcements?" + query));

test("actual announcement history GET", async t => {
  await t.test("101 notices with equal times and null dates traverse all pages without gaps", async () => {
    reset(); const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    let page = await response.json(); const seen = [...page.items];
    rows.push({ ...rows[100], id: "new-notice", sendAt: new Date("2026-09-14T00:00:00Z") });
    while (page.nextCursor) {
      const cursor = page.nextCursor; const response = await get("familyId=fake-family&cursor=" + cursor); assert.equal(response.status, 200);
      page = await response.json(); assert.equal(page.requestCursor, cursor); seen.push(...page.items);
    }
    assert.equal(seen.length, 101); assert.equal(new Set(seen.map(row => row.id)).size, 101);
    assert.deepEqual(seen.map(row => row.id), Array.from({ length: 101 }, (_, i) => "notice-" + String(100 - i).padStart(3, "0")));
    assert.doesNotMatch(JSON.stringify(seen), /private|metadata|centerId|audience|NEVER EXPOSE/);
    assert.ok(seen.slice(-12).every(row => row.sendAt === null));
  });
  await t.test("eight versus nine notices report continuation truthfully", async () => {
    for (const count of [0, 8, 9]) {
      reset(count); const page = await (await get()).json(); assert.equal(page.items.length, Math.min(count, 8));
      assert.equal(page.nextCursor, count === 9 ? "notice-001" : null);
    }
  });
  await t.test("foreign draft scheduled and targeted notices and cursor anchors fail closed", async () => {
    for (const patch of [{ centerId: "foreign-school" }, { status: "draft" }, { status: "scheduled" }, { audience: { label: "teachers" } }, { audience: { label: "families", childId: "foreign" } }, { audience: ["families"] }]) {
      reset(); rows[100] = { ...rows[100], ...patch };
      const first = await (await get()).json(); assert.ok(!first.items.some(row => row.id === "notice-100"));
      assert.equal((await get("familyId=fake-family&cursor=notice-100")).status, 400);
    }
    reset(); assert.equal((await get("familyId=fake-family&cursor=missing")).status, 400);
  });
  await t.test("current guardian single-school and tenant proof precedes every announcement query", async () => {
    for (const change of [() => { user = null; }, () => { user.isActive = false; }, () => { user.role = "AUTHORIZED_PICKUP"; }, () => { user.role = "TEACHER"; },
      () => { family.guardians = []; }, () => { family.children = []; }, () => { family.children.forEach(child => child.enrollmentStatus = "inactive"); },
      () => { family.centerId = "foreign-school"; }, () => { center.organization.tenantId = "foreign-tenant"; },
      () => { family.children[1].classroom = { ...family.children[1].classroom, center: { ...center, id: "another-school" } }; }]) {
      reset(); change(); assert.ok([401,403].includes((await get()).status)); assert.equal(queries.length, 0);
    }
    reset(); assert.equal((await get("familyId=foreign-family")).status, 403); assert.equal(queries.length, 0);
    reset(); family.centerId = null; assert.equal((await get()).status, 200);
    family.children[1].classroom = null; assert.equal((await get()).status, 403);
  });
  await t.test("reserved reviewer has an empty correlated page with zero school announcement reads", async () => {
    reset(); reserved = true;
    const page = await (await get()).json(); assert.deepEqual(page, { ok: true, familyId: "fake-family", requestCursor: null, items: [], nextCursor: null });
    assert.equal((await get("familyId=fake-family&cursor=notice-100")).status, 400); assert.equal(queries.length, 0);
  });
  await t.test("malformed queries and read failures retain private sanitized failure status", async () => {
    for (const query of ["", "familyId=", "familyId=fake-family&cursor=", "familyId=fake-family&cursor=a&cursor=b", "familyId=fake-family&school=other"]) {
      reset(); assert.equal((await get(query)).status, 400); assert.equal(queries.length, 0);
    }
    reset(); failRead = true; const response = await get(); assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(await response.text(), /FAKE PRIVATE DATABASE FAILURE/);
  });
});
