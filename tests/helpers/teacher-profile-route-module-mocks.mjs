import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-12T15:00:00Z") });
const actor = { id: "fake-teacher", tenantId: "fake-tenant", organizationId: "fake-org", email: "fake-teacher@example.test", role: "TEACHER", isActive: true, name: "Fake Teacher", primaryCenterId: "fake-school", updatedAt: new Date() };
let user, currentActor, profile, center, classroom, grant, beforeTransaction, beforeUserCAS, beforeProfileCAS, failAudit, failCreate, audits, userWrites, profileCreates, grantReads;
function reset(noProfile = false) {
  user = structuredClone(actor); currentActor = structuredClone(actor);
  profile = noProfile ? null : { id: "fake-profile", userId: actor.id, centerId: "fake-school", classroomId: "fake-room", title: "Teacher", phone: null, customFields: { retained: "fake-value" } };
  center = { id: "fake-school", organizationId: "fake-org", organization: { tenantId: actor.tenantId } };
  classroom = { id: "fake-room", centerId: center.id, center, customFields: null };
  grant = { id: "fake-grant", userId: actor.id, tenantId: actor.tenantId, organizationId: null, centerId: center.id, role: "TEACHER", scopeType: "CENTER", isActive: true, startsAt: null, endsAt: null };
  beforeTransaction = () => {}; beforeUserCAS = () => {}; beforeProfileCAS = () => {}; failAudit = false; failCreate = false;
  audits = []; userWrites = []; profileCreates = 0; grantReads = 0;
}
function matches(value, where) {
  if (!value) return false;
  return Object.entries(where).every(([key, filter]) => {
    if (key === "AND") return filter.every((part) => matches(value, part));
    if (key === "OR") return filter.some((part) => matches(value, part));
    const field = value[key];
    if (filter instanceof Date) return field instanceof Date && field.getTime() === filter.getTime();
    if (filter === null || typeof filter !== "object") return field === filter;
    if ("lte" in filter) return field instanceof Date && field <= filter.lte;
    if ("gte" in filter) return field instanceof Date && field >= filter.gte;
    if ("equals" in filter) {
      const actual = filter.path ? filter.path.reduce((item, part) => item?.[part], field) : field;
      return filter.equals === Prisma.AnyNull || filter.equals === Prisma.DbNull ? actual == null : JSON.stringify(actual) === JSON.stringify(filter.equals);
    }
    return matches(field, filter);
  });
}
const prisma = {
  staffProfile: { async findUnique({ where }) { assert.equal(where.userId, actor.id); return structuredClone(profile); } },
  center: { async findFirst({ where }) { return matches(center, where) ? structuredClone(center) : null; } },
  auditLog: { async create() { throw new Error("Audit escaped transaction"); } },
  async $transaction(callback, options) {
    assert.equal(options.isolationLevel, "Serializable"); beforeTransaction();
    let stagedProfile = structuredClone(profile); const stagedUser = structuredClone(currentActor), stagedAudits = [];
    const result = await callback({
      user: {
        async findFirst({ where }) { return matches(currentActor, where) ? structuredClone(currentActor) : null; },
        async updateMany({ where, data }) {
          assert.deepEqual(Object.keys(data), ["name"]); userWrites.push(data); beforeUserCAS();
          if (!matches(currentActor, where)) return { count: 0 };
          Object.assign(stagedUser, data); return { count: 1 };
        },
      },
      center: { async findFirst({ where }) { return matches(center, where) ? structuredClone(center) : null; } },
      classroom: { async findFirst({ where }) { return matches(classroom, where) ? structuredClone(classroom) : null; } },
      userAccessGrant: { async findFirst({ where }) { grantReads++; return matches(grant, where) ? { id: grant.id } : null; } },
      staffProfile: {
        async findUnique({ where }) { assert.equal(where.userId, actor.id); return structuredClone(profile); },
        async updateMany({ where, data }) {
          assert.deepEqual(Object.keys(data).sort(), ["classroomId", "customFields", "phone", "title"]); beforeProfileCAS();
          if (!matches(profile, where)) return { count: 0 }; Object.assign(stagedProfile, data); return { count: 1 };
        },
        async create({ data }) {
          profileCreates++; if (failCreate) throw new Prisma.PrismaClientKnownRequestError("Fake concurrent profile", { code: "P2002", clientVersion: "fake" });
          stagedProfile = { id: "fake-created-profile", ...data }; return structuredClone(stagedProfile);
        },
        async update({ where, data }) { assert.equal(where.id, stagedProfile.id); Object.assign(stagedProfile, data); return structuredClone(stagedProfile); },
      },
      auditLog: { async create({ data }) { if (failAudit) throw new Error("Fake audit failure"); stagedAudits.push(data); } },
    });
    currentActor = stagedUser; profile = stagedProfile; audits.push(...stagedAudits); return result;
  },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return user; }, canAccessCenter(value, id) { return id === value.primaryCenterId; } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
const { POST } = await import("../../src/app/api/teacher/profile/route.ts");
function post(extra = {}, origin = "https://fixture.invalid") {
  return POST(new NextRequest("https://fixture.invalid/api/teacher/profile", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ name: "Fake Saved Teacher", title: "Teacher", contactEmail: "teacher@example.test", phone: "555-0100", classroomId: null, staffKioskPin: "1234", ...extra }) }));
}

test("teacher profile save authority and transaction", async (t) => {
  await t.test("existing profile access does not require a grant and preserves fresh unrelated fields", async () => {
    for (const badGrant of [null, { role: "PARENT_GUARDIAN" }, { isActive: false }]) {
      reset(); grant = badGrant; beforeTransaction = () => { profile.customFields.staffClock = { fake: "fresh retained history" }; };
      const response = await post(); assert.equal(response.status, 200); const receipt = await response.json();
      assert.equal(receipt.mode, "updated"); assert.equal(receipt.profile.classroomId, "fake-room"); assert.equal(receipt.profile.hasStaffKioskCode, true);
      assert.equal(grantReads, 0); assert.deepEqual(profile.customFields.staffClock, { fake: "fresh retained history" }); assert.equal(profile.customFields.retained, "fake-value");
      assert.equal(currentActor.role, "TEACHER"); assert.equal(currentActor.organizationId, "fake-org"); assert.equal(audits.length, 1);
      assert.equal(JSON.stringify(receipt).includes("1234"), false); assert.equal(JSON.stringify(audits).includes("1234"), false);
    }
  });
  await t.test("profileless exact school teacher grants accept null and inclusive current dates", async () => {
    for (const dated of [false, true]) {
      reset(true); if (dated) grant.startsAt = grant.endsAt = new Date();
      const response = await post(); assert.equal(response.status, 200); const receipt = await response.json();
      assert.equal(receipt.mode, "created"); assert.equal(receipt.profile.id, "fake-created-profile"); assert.equal(receipt.profile.classroomId, null); assert.equal(receipt.profile.hasStaffKioskCode, true); assert.equal(profileCreates, 1);
    }
  });
  await t.test("wrong expired inactive broad or inconsistent grants cannot create durable profile access", async () => {
    for (const patch of [{ role: "CENTER_DIRECTOR" }, { tenantId: "other" }, { centerId: "other" }, { userId: "other" }, { isActive: false }, { scopeType: "OWNER_GROUP" }, { startsAt: new Date(Date.now() + 1) }, { endsAt: new Date(Date.now() - 1) }, { organizationId: "other" }]) {
      reset(true); Object.assign(grant, patch); assert.equal((await post()).status, 409); assert.equal(profileCreates, 0); assert.equal(userWrites.length, 0); assert.equal(audits.length, 0);
    }
  });
  await t.test("current actor or staff assignment changes cannot be overwritten", async () => {
    for (const mutate of [() => { currentActor.role = "PARENT_GUARDIAN"; }, () => { currentActor.isActive = false; }, () => { currentActor.email = "other@example.test"; }, () => { currentActor.tenantId = "other"; }, () => { currentActor.organizationId = "other"; }, () => { currentActor.name = "Concurrent Name"; }, () => { profile = null; }, () => { profile.centerId = "other"; }, () => { profile.classroomId = "other"; }, () => { center.organization.tenantId = "other"; }]) {
      reset(); beforeTransaction = mutate; assert.equal((await post()).status, 409); assert.equal(userWrites.length, 0); assert.equal(profileCreates, 0); assert.equal(audits.length, 0);
    }
    reset(true); beforeTransaction = () => { profile = { id: "concurrent-profile" }; }; assert.equal((await post()).status, 409); assert.equal(profileCreates, 0);
  });
  await t.test("user version and profile JSON compare-and-set failures roll back all staged writes", async () => {
    reset(); beforeUserCAS = () => { currentActor.updatedAt = new Date(Date.now() + 1); }; assert.equal((await post()).status, 409); assert.equal(currentActor.name, actor.name); assert.equal(audits.length, 0);
    reset(); beforeProfileCAS = () => { profile.customFields.concurrent = true; }; assert.equal((await post()).status, 409); assert.equal(currentActor.name, actor.name); assert.equal(profile.phone, null); assert.equal(audits.length, 0);
  });
  await t.test("classroom null retains assignment and new choices require current active school topology", async () => {
    reset(); classroom.customFields = { archived: true }; assert.equal((await post({ classroomId: null })).status, 200); assert.equal(profile.classroomId, "fake-room");
    reset(); assert.equal((await post({ classroomId: "other" })).status, 409);
    reset(); classroom.centerId = "other"; assert.equal((await post()).status, 409);
    reset(true); assert.equal((await post({ classroomId: "fake-room" })).status, 200);
    reset(true); classroom.customFields = { archived: true }; assert.equal((await post({ classroomId: "fake-room" })).status, 409);
  });
  await t.test("audit failure rolls back name profile and PIN together", async () => {
    reset(); failAudit = true; await assert.rejects(post, /Fake audit failure/); assert.equal(currentActor.name, actor.name); assert.equal(profile.phone, null); assert.deepEqual(profile.customFields, { retained: "fake-value" }); assert.equal(audits.length, 0);
  });
  await t.test("unique profile races and serialization failures return a safe conflict", async () => {
    reset(true); failCreate = true; assert.equal((await post()).status, 409); assert.equal(currentActor.name, actor.name); assert.equal(profile, null); assert.equal(audits.length, 0);
    reset(); beforeTransaction = () => { throw new Prisma.PrismaClientKnownRequestError("Fake rollback", { code: "P2034", clientVersion: "fake" }); }; assert.equal((await post()).status, 409);
  });
  await t.test("authentication trusted origin tenant and exact PIN validation precede writes", async () => {
    reset(); user = null; assert.equal((await post()).status, 401);
    reset(); assert.equal((await post({}, "https://other.invalid")).status, 403);
    reset(); user.role = "PARENT_GUARDIAN"; assert.equal((await post()).status, 403);
    reset(); center.organization.tenantId = "other"; assert.equal((await post()).status, 404);
    reset(); assert.equal((await post({ staffKioskPin: "12345" })).status, 400); assert.equal(userWrites.length, 0);
  });
});
