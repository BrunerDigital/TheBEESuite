import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const actor = { id: "fake-parent", tenantId: "fake-tenant", role: "PARENT_GUARDIAN", isActive: true, email: "fake@example.test", name: "Fake Parent", primaryCenterId: "fake-school" };
let user, family, target, uploads, removed, created, audits, deliveries, beforeTransaction, afterCommit, teacher, queries, leaders;
function reset() {
  user = { ...actor }; uploads = []; removed = []; created = []; audits = []; deliveries = []; queries = []; leaders = []; beforeTransaction = () => {}; afterCommit = () => {};
  family = { id: "fake-family", name: "Fake Family", billingEmail: null, centerId: "fake-school", guardians: [{ userId: actor.id, fullName: "Fake Parent", email: null, phone: null, preferredCommunication: null }], children: [{ id: "fake-child", fullName: "Fake Child", familyId: "fake-family", enrollmentStatus: "active", classroomId: "fake-class", classroom: { id: "fake-class", name: "Fake Classroom", centerId: "fake-school", center: { organization: { tenantId: actor.tenantId } } } }] };
  teacher = { id: "fake-teacher", tenantId: actor.tenantId, role: "TEACHER", isActive: true, email: "fake-teacher@example.test", accessGrants: [], staffProfile: { id: "fake-profile", phone: null, centerId: "fake-school", classroomId: "fake-class", center: { organization: { tenantId: actor.tenantId } }, classroom: { id: "fake-class", centerId: "fake-school", children: family.children } } };
  target = { id: "fake-reply", familyId: family.id, subject: "Canonical classroom subject", senderId: teacher.id, assignedToId: null, threadKey: null };
}
function matches(value, where) {
  return Object.entries(where).every(([key, filter]) => {
    if (key === "AND") return filter.every(part => matches(value, part));
    if (key === "OR") return filter.some(part => matches(value, part));
    if (filter === null || typeof filter !== "object") return value?.[key] === filter;
    if ("in" in filter) return filter.in.includes(value?.[key]);
    if ("notIn" in filter) return !filter.notIn.includes(value?.[key]);
    if ("not" in filter) return value?.[key] !== filter.not;
    if ("lte" in filter) return value?.[key] <= filter.lte;
    if ("gte" in filter) return value?.[key] >= filter.gte;
    if ("some" in filter && !value?.[key]?.some(item => matches(item, filter.some))) return false;
    if ("none" in filter && !value?.[key]?.every(item => !matches(item, filter.none))) return false;
    if ("some" in filter || "none" in filter) return true;
    return Boolean(value?.[key] && matches(value[key], filter));
  });
}
const prisma = {
  center: { async findMany({ where }) { assert.deepEqual(where, { organization: { tenantId: actor.tenantId } }); return [{ id: "fake-school" }, { id: "fake-other-school" }]; }, async findUnique() { return { name: "Fake School", email: null, phone: null }; } },
  guardian: { async findMany({ where }) { return matches({ userId: actor.id, family }, where) ? [{ id: "fake-guardian", familyId: family.id, family: { _count: { children: family.children.filter(child => child.enrollmentStatus === "active").length } } }] : []; } },
  family: { async findFirst({ where, include, select }) {
    if (!matches(family, where)) return null;
    const childWhere = (include ?? select)?.children?.where;
    return { ...family, children: childWhere ? family.children.filter(child => matches(child, childWhere)) : family.children };
  } },
  user: {
    async findFirst({ where }) { return [user, teacher].find(item => item && matches(item, where)) ?? null; },
    async findMany({ where, select }) { queries.push(where); return [teacher, ...leaders].filter(item => matches(item, where)).map(item => ({ ...item, accessGrants: select?.accessGrants?.where ? item.accessGrants.filter(grant => matches(grant, select.accessGrants.where)) : item.accessGrants })); },
  },
  staffProfile: { async findUnique() { return { classroomId: user.assignedClassroomId ?? "fake-class" }; } },
  message: {
    async findFirst({ where }) { return target && matches({ ...target, family: target.familyId === family.id ? family : null }, where) ? { ...target } : null; },
    async create({ data }) { const row = { ...data, id: "fake-created", createdAt: new Date() }; created.push(row); return row; },
    async updateMany() { return { count: 0 }; },
  },
  notificationPreference: { async findMany() { return []; } },
  notification: { async create() { throw new Error("Unexpected fake notification write"); } },
  async $transaction(callback, options) { assert.equal(options.isolationLevel, "Serializable"); beforeTransaction(); const result = await callback(prisma); afterCommit(); return result; },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return user?.isActive ? user : null; }, isParentGuardian(value) { return value.role === "PARENT_GUARDIAN"; },
  canManageOperations(value) { return ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"].includes(value.role); }, canManageClassroomTasks(value) { return value.role === "TEACHER"; }, canAccessAllCenters() { return false; }, messageCenterIdsForUser(value) { return value.centerIds ?? ["fake-school"]; } } });
mock.module("@/lib/supabase-storage", { namedExports: {
  contentTypeForDocumentFile(file) { return file.type; }, async uploadMessageAttachmentBuffer(input) { uploads.push(input); return { bucket: "message-files", storageKey: `message-attachments/fake-${uploads.length}`, recordUrl: "supabase://message-files/fake", signedUrl: "https://files.example.test/fake" }; },
  async deleteMessageAttachmentObject(key) { removed.push(key); }, async createMessageAttachmentSignedUrl() { throw new Error("Signing not used during send"); },
} });
mock.module("@/lib/app-review-targeting", { namedExports: { appReviewReservedIdentityKind(email) { return email === "fake+review@example.test" ? "parent" : null; } } });
mock.module("@/lib/location-users", { namedExports: { async getCenterLeadershipUsers() { return []; } } });
mock.module("@/lib/audit", { namedExports: { async writeAuditLog(_user, entry) { audits.push(entry); } } });
mock.module("@/lib/supabase-auth", { namedExports: { getAppBaseUrl(url) { return new URL(url).origin; } } });
mock.module("@/lib/notification-delivery", { namedExports: {
  resolveNotificationDeliveryRecipientChannels() { return { pushEnabled: false }; },
  async deliverNotificationExternalChannels(input) { deliveries.push(input); return { email: { attempted: 0, sent: 0 }, sms: { attempted: 0, sent: 0 } }; },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
const { POST } = await import("../../src/app/api/communications/messages/route.ts");
function post(input = {}, file = false) {
  const fields = { familyId: "fake-family", message: "Fake unsent classroom question", subject: "Re: Canonical classroom subject", replyToMessageId: "fake-reply", sendEmailCopy: false, sendSmsCopy: false, sendPushCopy: false, ...input };
  const headers = { origin: "https://fixture.invalid" }; let body;
  if (file) { body = new FormData(); for (const [key, value] of Object.entries(fields)) if (value !== null) body.append(key, String(value)); body.append("attachment", new File(["Fake text"], "fake.txt", { type: "text/plain" })); }
  else { headers["content-type"] = "application/json"; body = JSON.stringify(fields); }
  return POST(new NextRequest("https://fixture.invalid/api/communications/messages", { method: "POST", headers, body }));
}
test("actual parent message sends preserve scope and canonical replies before side effects", async t => {
  await t.test("canonical and omitted subjects use database identity without leaking creation metadata", async () => {
    for (const subject of ["Re: Canonical classroom subject", ""]) {
      reset(); const response = await post({ subject }); assert.equal(response.status, 201); assert.equal(created[0].subject, "Re: Canonical classroom subject");
      assert.deepEqual((await response.json()).message, { id: "fake-created" }); assert.equal(audits.length, 1);
    }
    reset(); target.subject = "A".repeat(200); assert.equal((await post({ subject: "" })).status, 201); assert.equal(created[0].subject.length, 200);
  });
  await t.test("foreign family stale guardian moved child and forged reply stop before upload", async () => {
    for (const file of [false, true]) for (const mutate of [() => { family.guardians = []; }, () => { family.children[0].enrollmentStatus = "inactive"; }, () => { family.centerId = "foreign-school"; },
      () => { family.children[0].classroom.center.organization.tenantId = "foreign-tenant"; }, () => { target.familyId = "foreign-family"; }, () => { target.id = "unrelated"; }]) {
      reset(); mutate(); assert.ok([400, 403, 404].includes((await post({}, file)).status)); assert.deepEqual([uploads.length, created.length, audits.length, deliveries.length], [0, 0, 0, 0]);
    }
    reset(); assert.equal((await post({ subject: "Forged unrelated subject" }, true)).status, 409); assert.deepEqual([uploads.length, created.length], [0, 0]);
    for (const role of ["AUTHORIZED_PICKUP", "BILLING_ADMIN", "READ_ONLY_AUDITOR"]) { reset(); user.role = role; assert.equal((await post({}, true)).status, 403); assert.equal(uploads.length, 0); }
  });
  await t.test("former-classroom teachers are not authorized through inactive siblings", async () => {
    reset(); user.role = "TEACHER"; user.id = "fake-former-teacher"; user.assignedClassroomId = "former-class";
    family.children.push({ ...family.children[0], id: "former-child", enrollmentStatus: "inactive", classroomId: "former-class" });
    assert.equal((await post({}, true)).status, 403); assert.equal(uploads.length, 0); assert.equal(created.length, 0);
  });
  await t.test("known concurrent revocations clean only message-bucket uploads and unknown commits retain them", async () => {
    for (const mutate of [() => { user.isActive = false; }, () => { user.role = "AUTHORIZED_PICKUP"; }, () => { family.guardians = []; }, () => { family.children[0].enrollmentStatus = "inactive"; },
      () => { target.subject = "Changed during upload"; }, () => { target.familyId = "foreign-family"; },
      () => { family.centerId = "fake-other-school"; family.children[0].classroom.centerId = "fake-other-school"; },
      () => { throw new Prisma.PrismaClientKnownRequestError("Fake conflict", { code: "P2034", clientVersion: "fake" }); }]) {
      reset(); beforeTransaction = mutate; assert.equal((await post({}, true)).status, 409); assert.equal(created.length, 0); assert.deepEqual(removed, ["message-attachments/fake-1"]); assert.equal(deliveries.length, 0);
    }
    reset(); afterCommit = () => { throw new Error("Fake unknown commit receipt"); }; await assert.rejects(() => post({}, true), /Fake unknown commit/);
    assert.equal(created.length, 1); assert.deepEqual(removed, []);
  });
  await t.test("moved reply teachers cannot receive new parent notifications or email", async () => {
    for (const mutate of [() => { teacher.staffProfile.centerId = "other-school"; }, () => { teacher.staffProfile.classroomId = "other-class"; }, () => { teacher.role = "BILLING_ADMIN"; },
      () => { teacher.staffProfile.classroom.children = []; }, () => { teacher.staffProfile.center.organization.tenantId = "other-tenant"; }]) {
      reset(); mutate(); assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients, []);
    }
    reset(); assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients.map(item => item.userId), ["fake-teacher"]);
    reset(); family.centerId = null; assert.equal((await post({ assignedToId: "fake-teacher" })).status, 201);
    reset(); family.centerId = null; user.primaryCenterId = "fake-other-school"; assert.equal((await post({}, true)).status, 201);
    assert.equal(uploads[0].centerId, "fake-school"); assert.equal(deliveries[0].centerId, "fake-school"); assert.equal(audits[0].centerId, "fake-school");
    reset(); family.centerId = null; family.children.push({ ...family.children[0], id: "second-school-child", classroomId: "other-class", classroom: { ...family.children[0].classroom, id: "other-class", centerId: "fake-other-school" } });
    assert.equal((await post({}, true)).status, 409); assert.deepEqual([uploads.length, created.length, deliveries.length], [0, 0, 0]);
  });
  await t.test("internal cross-thread replies and broadcast replies are rejected while staff subject editing remains", async () => {
    reset(); user.role = "CENTER_DIRECTOR"; target.familyId = null; target.threadKey = "internal:other-school";
    assert.equal((await post({ familyId: null }, true)).status, 400); assert.equal(uploads.length, 0);
    target.threadKey = "internal:fake-school"; assert.equal((await post({ familyId: null, subject: "Edited internal subject" })).status, 201); assert.equal(created[0].subject, "Edited internal subject");
    reset(); user.role = "CENTER_DIRECTOR"; assert.equal((await post({ targetMode: "broadcast" }, true)).status, 400); assert.equal(uploads.length, 0);
    reset(); user.role = "CENTER_DIRECTOR"; assert.equal((await post({ subject: "Edited staff family subject" })).status, 201); assert.equal(created[0].subject, "Edited staff family subject");
  });
  await t.test("platform-owner family sends preserve authorized cross-tenant school scope without opening ordinary staff access", async () => {
    reset(); user.role = "PLATFORM_OWNER"; user.id = "fake-owner"; user.tenantId = "platform-identity-tenant"; user.centerIds = ["fake-school"];
    assert.equal((await post({ subject: "Authorized owner family message" }, true)).status, 201); assert.equal(created.length, 1); assert.equal(uploads[0].centerId, "fake-school");
    reset(); user.role = "PLATFORM_OWNER"; user.id = "fake-owner"; user.tenantId = "platform-identity-tenant"; user.centerIds = ["another-school"];
    assert.equal((await post({}, true)).status, 404); assert.deepEqual([uploads.length, created.length, deliveries.length], [0, 0, 0]);
    for (const role of ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BRAND_ADMIN", "REGIONAL_MANAGER", "TEACHER"]) {
      reset(); user.role = role; user.id = "fake-other-actor"; user.tenantId = "another-tenant"; user.centerIds = ["fake-school"];
      assert.equal((await post({}, true)).status, 404); assert.deepEqual([uploads.length, created.length, deliveries.length], [0, 0, 0]);
    }
  });
  await t.test("historical operations recipients retain only their current authorized role and tenant scope", async () => {
    for (const role of ["BRAND_ADMIN", "REGIONAL_MANAGER", "PLATFORM_OWNER"]) {
      reset(); teacher.role = role; teacher.staffProfile = null;
      if (role === "PLATFORM_OWNER") teacher.tenantId = "platform-identity-tenant";
      assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients.map(item => item.userId), ["fake-teacher"]);
      reset(); teacher.role = role; teacher.isActive = false;
      assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients, []);
    }
    for (const role of ["BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "READ_ONLY_AUDITOR", "BILLING_ADMIN", "PARENT_GUARDIAN", "AUTHORIZED_PICKUP"]) {
      reset(); teacher.role = role; teacher.tenantId = "foreign-tenant";
      assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients, []);
    }
    reset(); teacher.role = "READ_ONLY_AUDITOR";
    assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients, []);
    reset(); teacher.role = "CENTER_DIRECTOR";
    assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients.map(item => item.userId), ["fake-teacher"]);
    reset(); teacher.role = "CENTER_DIRECTOR"; teacher.staffProfile.centerId = "moved-school";
    assert.equal((await post()).status, 201); assert.deepEqual(deliveries[0].recipients, []);
  });
  await t.test("leadership notifications require current dated same-tenant school authority", async () => {
    reset();
    const grant = { tenantId: actor.tenantId, centerId: "fake-school", scopeType: "CENTER", isActive: true, role: "CENTER_DIRECTOR", startsAt: null, endsAt: null, center: { organization: { tenantId: actor.tenantId } } };
    const leader = { id: "fake-leader", email: "leader@example.test", tenantId: actor.tenantId, role: "REGIONAL_MANAGER", isActive: true, staffProfile: null, accessGrants: [grant] };
    leaders = [leader,
      { ...leader, id: "expired", accessGrants: [{ ...grant, endsAt: new Date("2000-01-01") }] },
      { ...leader, id: "future", accessGrants: [{ ...grant, startsAt: new Date("2999-01-01") }] },
      { ...leader, id: "foreign", tenantId: "foreign-tenant" },
      { ...leader, id: "wrong-school", accessGrants: [{ ...grant, centerId: "fake-other-school" }] },
      { ...leader, id: "inactive", isActive: false },
      { ...leader, id: "downgraded-parent", role: "PARENT_GUARDIAN" },
      { ...leader, id: "downgraded-teacher", role: "TEACHER" },
    ];
    assert.equal((await post()).status, 201);
    assert.deepEqual(deliveries[0].recipients.map(item => item.userId).sort(), ["fake-leader", "fake-teacher"]);
  });
  await t.test("App Review sends remain portal-only with no external delivery", async () => {
    reset(); user.email = "fake+review@example.test"; assert.equal((await post({ channel: "email", sendEmailCopy: true, sendSmsCopy: true, sendPushCopy: true })).status, 201);
    assert.equal(created[0].channel, "portal"); assert.deepEqual(created[0].metadata.deliveryChannels, { portal: true, email: false, sms: false, push: false }); assert.equal(deliveries.length, 0);
  });
});
