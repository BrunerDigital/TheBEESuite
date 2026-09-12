import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const actor = { id: "fake-parent", tenantId: "fake-tenant", role: "PARENT_GUARDIAN", email: "fake-parent@example.test", isActive: true };
let user, currentActor, family, row, uploads, removed, notes, audits, transactions, auditFailure, noteFailure, cleanupFailure, notificationFailure, beforeTransaction, afterCommit, scopeAllowed;
function reset(extra = {}) {
  user = { ...actor }; currentActor = { ...actor };
  family = { id: "fake-family", name: "Fake Family", centerId: "fake-school", guardians: [{ userId: actor.id }], children: [{ id: "fake-child", familyId: "fake-family", fullName: "Fake Child", enrollmentStatus: "active", classroomId: "fake-class", classroom: { centerId: "fake-school", center: { organization: { tenantId: actor.tenantId } } } }] };
  row = { id: "fake-document", name: "Fake school form", type: "school_form", status: "REQUESTED", storageKey: "internal_signature_pending", familyId: "fake-family", childId: null, restricted: false, ...extra };
  uploads = []; removed = []; notes = []; audits = []; transactions = 0; auditFailure = false; noteFailure = false; cleanupFailure = false; notificationFailure = false; beforeTransaction = () => {}; afterCommit = () => {}; scopeAllowed = true;
}
function matches(value, where) {
  return Object.entries(where).every(([key, filter]) => {
    if (key === "AND") return filter.every((part) => matches(value, part));
    if (key === "OR") return filter.some((part) => matches(value, part));
    if (filter === null || typeof filter !== "object") return value?.[key] === filter;
    if ("in" in filter) return filter.in.includes(value?.[key]);
    if ("notIn" in filter) return !filter.notIn.includes(value?.[key]);
    if ("not" in filter) return value?.[key] !== filter.not;
    if ("some" in filter && !value?.[key]?.some((item) => matches(item, filter.some))) return false;
    if ("none" in filter && !value?.[key]?.every((item) => !matches(item, filter.none))) return false;
    if ("some" in filter || "none" in filter) return true;
    return Boolean(value?.[key] && matches(value[key], filter));
  });
}
function expandedDocument() { return { ...row, child: row.childId ? family.children.find((child) => child.id === row.childId) ?? null : null }; }
async function findFamily({ where, select }) {
  assert.deepEqual(where.AND[0], { id: "fake-family", guardians: { some: { userId: actor.id } } });
  assert.ok(where.AND[1].OR[0].centerId.in.includes("fake-school"));
  assert.deepEqual(select.children.where, where.AND[2].children.some);
  return matches(family, where) ? structuredClone({ ...family, children: family.children.filter((child) => matches(child, select.children.where)) }) : null;
}
const prisma = {
  user: { async findMany({ where, select }) {
    assert.equal(where.tenantId, actor.tenantId); assert.equal(where.isActive, true);
    assert.deepEqual(where.role, { in: ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"] });
    assert.deepEqual(select, { id: true });
    const grant = where.OR[1].accessGrants.some.AND;
    assert.deepEqual(grant[1], { scopeType: "CENTER", centerId: "fake-school", role: where.role });
    assert.ok(grant[0].AND[0].OR[1].startsAt.lte instanceof Date);
    assert.ok(grant[0].AND[1].OR[1].endsAt.gte instanceof Date);
    return [{ id: "fake-director" }];
  } },
  family: { findFirst: findFamily },
  document: { async findFirst({ where }) { return matches(expandedDocument(), where) ? structuredClone(expandedDocument()) : null; } },
  notification: { async create() { if (notificationFailure) throw new Error("Fake notification failure"); } },
  auditLog: { async create() { throw new Error("Audit escaped transaction"); } },
  async $transaction(callback, options) {
    transactions += 1; assert.equal(options.isolationLevel, "Serializable");
    beforeTransaction();
    const staged = structuredClone(row), stagedNotes = [], stagedAudits = [];
    const result = await callback({
      user: { async findFirst({ where }) { return currentActor && matches(currentActor, where) ? { id: actor.id } : null; } },
      center: { async findMany({ where }) { assert.deepEqual(where, { organization: { tenantId: actor.tenantId } }); return [{ id: "fake-school" }]; } },
      family: { findFirst: findFamily },
      document: { async updateMany({ where, data }) {
        assert.deepEqual(Object.keys(where.AND[1]).sort(), ["id", "status", "storageKey", "familyId", "childId", "name", "type", "restricted"].sort());
        if (!matches(expandedDocument(), where)) return { count: 0 };
        Object.assign(staged, data); return { count: 1 };
      } },
      note: { async create({ data }) { if (noteFailure) throw new Error("Fake note failure"); stagedNotes.push(data); } },
      auditLog: { async create({ data }) { if (auditFailure) throw new Error("Fake audit failure"); stagedAudits.push(data); } },
    });
    row = staged; notes.push(...stagedNotes); audits.push(...stagedAudits); afterCommit(); return result;
  },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return user; }, isParentGuardian(value) { return value.role === "PARENT_GUARDIAN"; } } });
mock.module("@/lib/parent-portal-family-scope", { namedExports: {
  async getParentPortalFamilyScope(userId, tenantId, requested) { assert.equal(userId, actor.id); assert.equal(tenantId, actor.tenantId); return scopeAllowed && (!requested || requested === "fake-family") ? { ok: true, familyId: "fake-family" } : { ok: false }; },
  async getParentPortalTenantCenterIds(tenantId) { assert.equal(tenantId, actor.tenantId); return ["fake-school"]; },
  parentPortalTenantFamilyWhere(ids) { return { OR: [{ centerId: { in: ids } }] }; },
} });
mock.module("@/lib/supabase-storage", { namedExports: {
  contentTypeForDocumentFile(file) { return file.type; },
  async uploadDocumentBuffer(input) { assert.equal(input.familyId, "fake-family"); assert.equal(input.tenantId, actor.tenantId); const storageKey = `new-fake-object-${uploads.length}`; uploads.push({ ...input, storageKey }); return { storageKey }; },
  async deleteDocumentObject(key) { removed.push(key); if (cleanupFailure) throw new Error("Fake cleanup failure"); },
} });
mock.module("@/lib/location-users", { namedExports: { async getCenterLeadershipUsers() { return [{ id: "fake-director" }]; } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
const { POST } = await import("../../src/app/api/parent/documents/[id]/submit/route.ts");
function post(input = {}, file = false) {
  const fields = { familyId: "fake-family", signatureName: "Fake Guardian", signatureConsentAccepted: true, note: "Fake submission note", ...input };
  const headers = { origin: "https://fixture.invalid" };
  let body;
  if (file) { body = new FormData(); for (const [key, value] of Object.entries(fields)) body.append(key, String(value)); body.append("file", new File(["fake document"], "fake.txt", { type: "text/plain" })); }
  else { body = JSON.stringify(fields); headers["content-type"] = "application/json"; }
  return POST(new NextRequest("https://fixture.invalid/api/parent/documents/fake-document/submit", { method: "POST", headers, body }), { params: Promise.resolve({ id: "fake-document" }) });
}
test("parent document submission is scoped and transactional", async (t) => {
  await t.test("family-only child-only and consistent restricted dual ownership succeed", async () => {
    for (const extra of [{}, { familyId: null, childId: "fake-child" }, { childId: "fake-child", restricted: true }]) {
      reset(extra); const response = await post(); assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, document: { id: "fake-document", status: "SUBMITTED" } });
      assert.equal(notes.length, 1); assert.equal(audits.length, 1); assert.equal(notes[0].restricted, Boolean(extra.restricted)); assert.equal(removed.length, 0);
    }
  });
  await t.test("unauthenticated pickup unlinked payment-only and removed guardian access cannot submit", async () => {
    reset(); user = null; assert.equal((await post()).status, 401);
    reset(); user.role = "AUTHORIZED_PICKUP"; assert.equal((await post()).status, 403);
    reset(); assert.equal((await post({ familyId: "other-family" })).status, 403);
    reset(); scopeAllowed = false; assert.equal((await post()).status, 403);
    reset(); family.children[0].enrollmentStatus = "inactive"; assert.equal((await post()).status, 403);
    reset(); family.guardians = []; assert.equal((await post()).status, 403);
    reset(); family.children[0].classroom.center.organization.tenantId = "other-tenant"; assert.equal((await post()).status, 403);
    assert.equal(uploads.length, 0); assert.equal(transactions, 0);
  });
  await t.test("conflicting moved and ownerless documents fail before storage writes", async () => {
    for (const extra of [{ familyId: "other-family", childId: "fake-child" }, { childId: "other-child" }, { familyId: null, childId: null }]) {
      reset(extra); assert.equal((await post()).status, 404); assert.equal(uploads.length, 0);
    }
    reset({ childId: "fake-child" }); family.children[0].familyId = "other-family"; assert.equal((await post()).status, 404); assert.equal(uploads.length, 0);
  });
  await t.test("approved status missing file and false string consent are rejected", async () => {
    reset({ status: "APPROVED" }); assert.equal((await post()).status, 400);
    reset({ storageKey: "upload_pending" }); assert.equal((await post()).status, 400); assert.equal(uploads.length, 0);
    reset(); assert.equal((await post({ signatureConsentAccepted: "false" })).status, 400); assert.equal(uploads.length, 0);
    reset({ storageKey: "upload_pending" }); assert.equal((await post({}, true)).status, 200);
  });
  await t.test("concurrent actor guardian child and document changes roll back with conflict", async () => {
    for (const mutate of [() => { currentActor.isActive = false; }, () => { currentActor.role = "AUTHORIZED_PICKUP"; }, () => { currentActor.tenantId = "other-tenant"; }, () => { family.guardians = []; }, () => { family.children[0].enrollmentStatus = "inactive"; }, () => { row.status = "APPROVED"; }, () => { row.storageKey = "another-version"; }, () => { row.restricted = true; }, () => { row.childId = "other-child"; }]) {
      reset(); beforeTransaction = mutate; const response = await post(); assert.equal(response.status, 409);
      assert.equal(notes.length, 0); assert.equal(audits.length, 0); assert.deepEqual(removed, ["new-fake-object-0"]);
    }
  });
  await t.test("audit rollback preserves the original document and uncertain commit retains upload", async () => {
    reset(); auditFailure = true; await assert.rejects(post, /Fake audit failure/);
    assert.equal(row.status, "REQUESTED"); assert.equal(notes.length, 0); assert.equal(audits.length, 0); assert.deepEqual(removed, ["new-fake-object-0"]);
    reset(); noteFailure = true; await assert.rejects(post, /Fake note failure/);
    assert.equal(row.status, "REQUESTED"); assert.equal(notes.length, 0); assert.equal(audits.length, 0); assert.deepEqual(removed, ["new-fake-object-0"]);
    reset(); beforeTransaction = () => { throw new Error("Unknown commit state"); }; await assert.rejects(post, /Unknown commit state/); assert.deepEqual(removed, []);
    reset(); afterCommit = () => { throw new Error("Commit receipt lost"); }; await assert.rejects(post, /Commit receipt lost/);
    assert.equal(row.status, "SUBMITTED"); assert.equal(row.storageKey, "new-fake-object-0"); assert.equal(audits.length, 1); assert.deepEqual(removed, []);
  });
  await t.test("known serializable rollback removes only the new upload", async () => {
    reset(); beforeTransaction = () => { throw new Prisma.PrismaClientKnownRequestError("Fake conflict", { code: "P2034", clientVersion: "fake" }); };
    assert.equal((await post()).status, 409); assert.equal(row.storageKey, "internal_signature_pending"); assert.deepEqual(removed, ["new-fake-object-0"]);
  });
  await t.test("cleanup failure preserves the callback error and logs no document data", async () => {
    reset(); auditFailure = true; cleanupFailure = true; const logging = mock.method(console, "error", () => {});
    try {
      await assert.rejects(post, /Fake audit failure/);
      assert.equal(row.status, "REQUESTED"); assert.equal(audits.length, 0);
      assert.deepEqual(logging.mock.calls.map((call) => call.arguments), [["parent_document_submission_uncommitted_upload_cleanup_failed"]]);
    } finally { logging.mock.restore(); }
  });
  await t.test("notification failure cannot invalidate a confirmed submission", async () => {
    reset(); notificationFailure = true; const logging = mock.method(console, "error", () => {});
    try { assert.equal((await post()).status, 200); assert.equal(row.status, "SUBMITTED"); assert.equal(audits.length, 1); assert.equal(logging.mock.callCount(), 1); }
    finally { logging.mock.restore(); }
  });
});
