import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

const actor = { id: "fake-parent", tenantId: "fake-tenant", role: "PARENT_GUARDIAN", isActive: true };
let user, family, center, reports, photos, logs, queries, signed, failRead, failSign;
function reset() {
  user = { ...actor }; queries = []; signed = []; failRead = false; failSign = false;
  center = { id: "fake-school", timezone: "America/New_York", customFields: {}, city: "New York", state: "NY", organization: { tenantId: actor.tenantId } };
  const classroom = { id: "fake-room", centerId: center.id, center };
  family = { id: "fake-family", centerId: center.id, guardians: [{ userId: actor.id }], children: [] };
  family.children = [1, 2].map(index => ({ id: "fake-child-" + index, fullName: "Fake Child " + index, familyId: family.id, family, enrollmentStatus: "active", classroomId: classroom.id, classroom }));
  reports = Array.from({ length: 101 }, (_, index) => ({
    id: "report-" + String(index).padStart(3, "0"), childId: family.children[index % 2].id, child: family.children[index % 2], classroomId: classroom.id, classroom,
    date: new Date("2026-09-11T12:00:00Z"), sentAt: new Date("2026-09-11T20:00:00Z"), mood: null, teacherNote: "Fake note", suppliesNeeded: null,
    meals: [{ id: "meal-" + index, mealType: "breakfast", food: "Fake breakfast", amount: null }], naps: [], diapers: [], activities: [],
  }));
  photos = Array.from({ length: 101 }, (_, index) => ({
    id: "photo-" + String(index).padStart(3, "0"), childId: family.children[index % 2].id, child: family.children[index % 2], classroomId: classroom.id, classroom,
    takenAt: new Date("2026-09-11T12:00:00Z"), createdAt: new Date("2026-09-12T15:00:00Z"), caption: "Fake moment", url: "supabase://private/fake", storageKey: "private-fake-key-" + index,
    uploadedById: "private-uploader", metadata: { private: true }, sharedWithParents: true, status: "shared", dailyReportId: null, dailyReport: null,
  }));
  logs = ["2026-09-11T12:00:00Z", "2026-09-11T13:00:00Z", "2026-09-11T19:00:00Z", "2026-09-11T20:00:00Z"].map((date, index) => ({ childId: family.children[0].id, child: family.children[0], centerId: center.id, classroomId: classroom.id, classroom, type: index < 2 ? "check_in" : "check_out", occurredAt: new Date(date) }));
}
const comparable = value => value instanceof Date ? value.getTime() : value;
function filterMatches(value, filter) {
  if (filter instanceof Date || filter === null || typeof filter !== "object") return comparable(value) === comparable(filter);
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
    if (operator === "equals") return filterMatches(value, operand);
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
function sorted(rows, orderBy) {
  return rows.toSorted((a, b) => {
    for (const order of orderBy ?? []) for (const [field, direction] of Object.entries(order)) {
      const left = comparable(a[field]), right = comparable(b[field]);
      if (left !== right) return (left < right ? -1 : 1) * (direction === "desc" ? -1 : 1);
    }
    return 0;
  });
}
function recordQuery(model, method, input) {
  if (failRead) throw new Error("FAKE PRIVATE DATABASE FAILURE");
  const serialized = JSON.stringify(input.where);
  assert.match(serialized, /fake-parent/); assert.match(serialized, /fake-tenant/); assert.match(serialized, /fake-family/); assert.match(serialized, /fake-school/);
  queries.push({ model, method, input });
}
function delegate(model, source) {
  return {
    async findFirst(input) { recordQuery(model, "findFirst", input); return project(sorted(source().filter(row => matches(row, input.where)), input.orderBy)[0] ?? null, input.select); },
    async findMany(input) {
      recordQuery(model, "findMany", input); assert.equal(input.take, 51);
      assert.deepEqual(input.orderBy, model === "reports" ? [{ date: "desc" }, { id: "desc" }] : [{ takenAt: "desc" }, { id: "desc" }]);
      return sorted(source().filter(row => matches(row, input.where)), input.orderBy).slice(0, input.take).map(row => project(row, input.select));
    },
    async groupBy(input) {
      recordQuery(model, "groupBy", input); assert.equal(model, "reports"); assert.deepEqual(input.by, ["childId"]);
      return [...new Set(source().filter(row => matches(row, input.where)).map(row => row.childId))].map(childId => ({ childId }));
    },
  };
}
const prisma = {
  center: {
    async findMany({ where }) { assert.deepEqual(where, { organization: { tenantId: actor.tenantId } }); return [center].filter(row => matches(row, where)).map(row => ({ id: row.id })); },
    async findFirst({ where, select }) { return project(matches(center, where) ? center : null, select); },
  },
  guardian: { async findMany({ where }) { return matches({ userId: actor.id, family }, where) ? [{ id: "fake-guardian", familyId: family.id, family: { _count: { children: family.children.filter(child => child.enrollmentStatus === "active" && child.classroomId).length } } }] : []; } },
  family: { async findFirst({ where, select }) { return project(matches(family, where) ? family : null, select); } },
  dailyReport: delegate("reports", () => reports), childMedia: delegate("photos", () => photos),
  checkInOutLog: { async groupBy(input) {
    recordQuery("attendance", "groupBy", input); assert.deepEqual(input.by, ["childId", "type"]); assert.deepEqual(input._min, { occurredAt: true }); assert.deepEqual(input._max, { occurredAt: true });
    const grouped = new Map();
    for (const row of logs.filter(row => matches(row, input.where))) {
      const key = row.childId + row.type, group = grouped.get(key) ?? { childId: row.childId, type: row.type, _min: { occurredAt: row.occurredAt }, _max: { occurredAt: row.occurredAt } };
      if (row.occurredAt < group._min.occurredAt) group._min.occurredAt = row.occurredAt;
      if (row.occurredAt > group._max.occurredAt) group._max.occurredAt = row.occurredAt;
      grouped.set(key, group);
    }
    return [...grouped.values()];
  } },
  async $transaction(callback, options) { assert.equal(options.isolationLevel, "RepeatableRead"); return callback(prisma); },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return user?.isActive ? user : null; }, isParentGuardian(value) { return value.role === "PARENT_GUARDIAN"; } } });
mock.module("@/lib/supabase-storage", { namedExports: {
  async createChildMediaSignedUrl(key) { signed.push(key); if (failSign) throw new Error("PRIVATE SIGNING FAILURE"); return "https://files.example.test/fake.png"; },
  async createMessageAttachmentSignedUrl() { throw new Error("Unexpected message signing"); },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler, options) { assert.deepEqual(options, { omitRequestBody: true, omitResponseBody: true }); return handler; } } });
const { GET } = await import("../../src/app/api/parent/history/updates/route.ts");
const { readParentUpdatesContext, readParentUpdatesHome } = await import("../../src/lib/parent-updates-query.ts");
const get = (query = "familyId=fake-family&day=2026-09-11") => GET(new NextRequest("https://fixture.invalid/api/parent/history/updates?" + query));

test("actual Updates GET uses bounded current-family day history", async t => {
  await t.test("101 equal-time reports and photos continue 50/50/1 with no gaps after new inserts", async () => {
    reset(); const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const first = await response.json();
    assert.equal(first.reports.length, 50); assert.equal(first.photos.length, 50); assert.equal(first.nextReportCursor, "report-051"); assert.equal(first.nextPhotoCursor, "photo-051");
    reports.push({ ...reports[0], id: "report-new", date: new Date("2026-09-11T13:00:00Z") }); photos.push({ ...photos[0], id: "photo-new", takenAt: new Date("2026-09-11T13:00:00Z") });
    for (const kind of ["reports", "photos"]) {
      const key = kind === "reports" ? "nextReportCursor" : "nextPhotoCursor";
      const second = await (await get(`familyId=fake-family&day=2026-09-11&kind=${kind}&cursor=${first[key]}`)).json();
      const third = await (await get(`familyId=fake-family&day=2026-09-11&kind=${kind}&cursor=${second[key]}`)).json();
      assert.equal(second[kind].length, 50); assert.equal(third[kind].length, 1); assert.equal(third[key], null);
      assert.deepEqual([...first[kind], ...second[kind], ...third[kind]].map(row => row.id), Array.from({ length: 101 }, (_, index) => (kind === "reports" ? "report-" : "photo-") + String(100 - index).padStart(3, "0")));
      assert.equal(second[kind === "reports" ? "photos" : "reports"].length, 0);
    }
    assert.doesNotMatch(JSON.stringify(first), /storageKey|supabase:\/\/|metadata|uploadedById|childId|classroomId|private-fake/);
    const childOne = first.reports.find(row => row.child.fullName === "Fake Child 1");
    assert.equal(childOne.checkInAt, "2026-09-11T12:00:00.000Z"); assert.equal(childOne.checkOutAt, "2026-09-11T20:00:00.000Z");
  });
  await t.test("24 earlier nonempty dates skip gaps and photo-only latest day never hides Home report", async () => {
    reset();
    for (let index = 1; index <= 24; index++) {
      const date = new Date(Date.UTC(2026, 8, 11 - index * 2, 12));
      if (index % 2) reports.push({ ...reports[0], id: "old-report-" + index, date });
      else photos.push({ ...photos[0], id: "old-photo-" + index, takenAt: date });
    }
    photos.push({ ...photos[0], id: "photo-latest", takenAt: new Date("2026-09-12T12:00:00Z") });
    let page = await (await get("familyId=fake-family")).json(); assert.equal(page.day, "2026-09-12"); assert.equal(page.reports.length, 0); assert.equal(page.photos.length, 1);
    const seen = [page.day];
    while (page.earlierDay) { page = await (await get("familyId=fake-family&day=" + page.earlierDay)).json(); seen.push(page.day); assert.ok(seen.length <= 26); }
    assert.equal(seen.length, 26); assert.equal(seen.at(-1), "2026-07-25");
    const empty = await (await get("familyId=fake-family&day=2026-09-10")).json(); assert.equal(empty.day, "2026-09-10"); assert.equal(empty.reports.length + empty.photos.length, 0); assert.equal(empty.earlierDay, "2026-09-09"); assert.equal(empty.laterDay, "2026-09-11");
    const context = await readParentUpdatesContext(prisma, { familyId: family.id, userId: actor.id, tenantId: actor.tenantId, tenantCenterIds: [center.id] });
    const home = await readParentUpdatesHome(prisma, context, new Date("2026-09-12T12:00:00Z"));
    assert.equal(home.latestReport.id, "report-100"); assert.deepEqual(home.reportedChildIds, []);
    assert.equal((await readParentUpdatesHome(prisma, context, new Date("2026-09-11T12:00:00Z"))).reportedChildIds.length, 2);
  });
  await t.test("capture dates and both DST windows are bounded at the school not upload timezone", async () => {
    reset(); reports = []; photos = [{ ...photos[0], takenAt: new Date("2026-09-12T01:30:00Z"), createdAt: new Date("2026-09-12T15:00:00Z") }];
    assert.equal((await (await get("familyId=fake-family")).json()).day, "2026-09-11");
    assert.equal((await (await get("familyId=fake-family&day=2026-09-12")).json()).photos.length, 0);
    for (const [day, start, end] of [["2026-03-08", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"], ["2026-11-01", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"]]) {
      photos = [new Date(Date.parse(start) - 1), new Date(start), new Date(Date.parse(end) - 1), new Date(end)].map((takenAt, index) => ({ ...photos[0], id: "dst-" + index, takenAt }));
      const page = await (await get("familyId=fake-family&day=" + day)).json(); assert.deepEqual(page.photos.map(row => row.id), ["dst-2", "dst-1"]);
    }
  });
  await t.test("removed access payment-only families mixed schools and tenants deny before content/signing", async () => {
    for (const change of [() => { user = null; }, () => { user.isActive = false; }, () => { user.role = "TEACHER"; }, () => { user.role = "AUTHORIZED_PICKUP"; }, () => { family.guardians = []; }, () => { family.children = []; }, () => { family.children.forEach(child => { child.enrollmentStatus = "withdrawn"; }); }, () => { family.centerId = "foreign-school"; }, () => { family.children[0].classroom = { ...family.children[0].classroom, centerId: "other-school", center: { id: "other-school", organization: { tenantId: actor.tenantId } } }; }, () => { family.children[0].classroom.center.organization.tenantId = "foreign-tenant"; }]) {
      reset(); change(); const response = await get(); assert.ok([401, 403].includes(response.status)); assert.equal(queries.length, 0); assert.equal(signed.length, 0);
    }
    reset(); assert.equal((await get("familyId=foreign-family")).status, 403); assert.equal(queries.length, 0);
    reset(); family.centerId = null; assert.equal((await get()).status, 200);
  });
  await t.test("unsent held unshared foreign and contradictory records never enter cursor or content reads", async () => {
    reset(); reports[0].sentAt = null; photos[0].status = "held"; photos[1].sharedWithParents = false;
    const foreignRoom = { centerId: "foreign-school", center: { id: "foreign-school", organization: { tenantId: "foreign-tenant" } } };
    reports[1].classroom = foreignRoom; photos[2].classroom = foreignRoom;
    photos[3].dailyReportId = reports[1].id; photos[3].dailyReport = reports[1];
    for (const [kind, cursor] of [["reports", "report-000"], ["reports", "report-001"], ["photos", "photo-000"], ["photos", "photo-001"], ["photos", "photo-002"], ["photos", "photo-003"]]) assert.equal((await get(`familyId=fake-family&day=2026-09-11&kind=${kind}&cursor=${cursor}`)).status, 400);
    assert.equal(signed.length, 0);
    reset(); reports[0].sentAt = null; photos[100].dailyReportId = reports[0].id; photos[100].dailyReport = reports[0];
    assert.equal((await (await get()).json()).photos[0].id, "photo-100", "Independent sharing does not require the associated draft report to be sent");
  });
  await t.test("invalid duplicate missing and withdrawn cursor inputs never restart a day", async () => {
    for (const query of ["", "familyId=fake-family&day=2026-02-30", "familyId=fake-family&day=a&day=b", "familyId=fake-family&childId=forged", "familyId=fake-family&kind=photos&cursor=photo-050", "familyId=fake-family&day=2026-09-11&kind=photos&cursor=missing", "familyId=fake-family&day=2026-09-12&kind=photos&cursor=photo-050"]) {
      reset(); assert.equal((await get(query)).status, 400, query); assert.equal(signed.length, 0);
    }
    reset(); photos[100].sharedWithParents = false; assert.equal((await get("familyId=fake-family&day=2026-09-11&kind=photos&cursor=photo-100")).status, 400);
  });
  await t.test("signing failure keeps display metadata without internal fallback and read errors stay private", async () => {
    reset(); failSign = true; const response = await get(); const page = await response.json(); assert.equal(response.status, 200);
    assert.equal(page.photos[0].url, null); assert.equal(page.photos[0].caption, "Fake moment"); assert.doesNotMatch(JSON.stringify(page), /supabase:|storageKey|PRIVATE/);
    reset(); failRead = true; const failed = await get(); assert.equal(failed.status, 503); assert.equal(failed.headers.get("cache-control"), "private, no-store"); assert.doesNotMatch(await failed.text(), /FAKE PRIVATE/); assert.equal(signed.length, 0);
  });
});
