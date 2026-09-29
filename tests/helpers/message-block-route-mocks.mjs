import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

let actor, fields, writes, audits, rateAllowed, senderTenant, guardians, notifications;
function reset() {
  actor = { id: "parent-1", identityTenantId: "tenant-1", tenantId: "tenant-1", role: "PARENT_GUARDIAN", centerIds: [], assignedClassroomId: null };
  notifications = [
    { id: "blocked", userId: actor.id, dedupeKey: "message-sender:school-sender:message:parent-1", type: "message", title: "Received message", archivedAt: null },
    { id: "legacy", userId: actor.id, dedupeKey: null, type: "message", title: "Incoming parent SMS", archivedAt: null },
    { id: "other-recipient", userId: "another-user", dedupeKey: null, type: "message", title: "Incoming parent SMS", archivedAt: null },
    { id: "other-sender", userId: actor.id, dedupeKey: "message-sender:other-sender:message:parent-1", type: "message", title: "Received message", archivedAt: null },
    { id: "billing", userId: actor.id, dedupeKey: null, type: "billing", title: "Billing notice", archivedAt: null },
  ];
  fields = { unrelated: { retained: true } }; writes = []; audits = []; rateAllowed = true; senderTenant = "tenant-1"; guardians = [{ userId: actor.id }];
}
const tx = {
  async $executeRaw(strings, ...values) {
    const query = Prisma.sql(strings, ...values);
    const [senderId, userId, identityTenantId] = query.values;
    assert.equal(userId, actor.id); assert.equal(identityTenantId, actor.identityTenantId);
    fields.messageBlocks ??= {};
    if (query.text.includes("jsonb_build_object")) fields.messageBlocks[senderId] = true;
    else delete fields.messageBlocks[senderId];
    writes.push(senderId); return 1;
  },
  notification: { async updateMany({ where, data }) {
    assert.equal(where.userId, actor.id); let count = 0;
    for (const row of notifications) if (row.userId === where.userId && row.archivedAt === where.archivedAt && where.OR.some(branch => Object.entries(branch).every(([key, filter]) => filter && typeof filter === "object" ? row[key]?.startsWith(filter.startsWith) : row[key] === filter))) { row.archivedAt = data.archivedAt; count++; }
    return { count };
  } },
  auditLog: { async create({ data }) { audits.push(data); return data; } },
};
const prisma = {
  message: { async findUnique({ where }) { return where.id === "visible-message" ? { id: where.id, senderId: "school-sender", assignedToId: null, threadKey: "family:family-1", familyId: "family-1", sender: { tenantId: senderTenant }, family: { centerId: "center-1", guardians, children: [{ classroomId: "room-1" }] } } : null; } },
  center: { async findUnique() { return { organization: { tenantId: senderTenant } }; } },
  user: { async findUnique({ where }) { assert.equal(where.id, actor.id); return { customFields: fields }; }, async findMany({ where }) { assert.equal(where.tenantId, actor.tenantId); return [{ id: "school-sender", name: "Synthetic School Sender" }]; } },
  async $transaction(callback) { return callback(tx); },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return actor; }, canAccessAllCenters() { return false; } } });
mock.module("@/lib/rate-limit", { namedExports: { async checkPersistentRateLimit() { return { ok: rateAllowed, resetAt: Date.now() + 10000 }; }, requestIp() { return "fake"; }, retryAfterSeconds() { return 10; } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
const { POST } = await import("../../src/app/api/communications/messages/[id]/block/route.ts");
const { GET, PATCH } = await import("../../src/app/api/communications/blocked-senders/route.ts");
const request = (method, body, origin = "https://fixture.invalid") => new NextRequest("https://fixture.invalid/api/communications/blocked-senders", { method, headers: { origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const block = (id = "visible-message", origin) => POST(request("POST", null, origin), { params: Promise.resolve({ id }) });

test("actual block and unblock routes scope preferences to the authenticated recipient", async t => {
  await t.test("unauthenticated foreign-origin foreign-school unrelated-family and missing-message targets make no writes", async () => {
    for (const mutate of [() => { actor = null; }, () => { senderTenant = "foreign-tenant"; }, () => { guardians = []; }]) {
      reset(); mutate(); const response = await block(); assert.ok([401, 404].includes(response.status)); assert.deepEqual(writes, []);
    }
    reset(); assert.equal((await block("missing")).status, 404); assert.equal((await block("visible-message", "https://foreign.invalid")).status, 403); assert.deepEqual(writes, []);
    rateAllowed = false; assert.equal((await block()).status, 429); assert.deepEqual(writes, []);
  });
  await t.test("blocking preserves unrelated settings and audit evidence; only the blocker can undo their block", async () => {
    reset(); assert.equal((await block()).status, 200); assert.equal(fields.messageBlocks["school-sender"], true);
    assert.deepEqual(notifications.filter(row => row.archivedAt).map(row => row.id), ["blocked", "legacy"]);
    assert.deepEqual(fields.unrelated, { retained: true }); assert.equal(audits[0].userId, actor.id); assert.equal(audits[0].action, "message.sender.blocked");
    const list = await GET(); assert.equal(list.headers.get("cache-control"), "private, no-store"); assert.deepEqual((await list.json()).senders, [{ id: "school-sender", name: "Synthetic School Sender" }]);
    assert.equal((await PATCH(request("PATCH", { senderId: "not-blocked", userId: "another-user" }))).status, 404);
    assert.equal((await PATCH(request("PATCH", { senderId: "school-sender", userId: "another-user" }))).status, 200);
    assert.deepEqual(fields, { unrelated: { retained: true }, messageBlocks: {} }); assert.equal(audits.at(-1).userId, actor.id); assert.equal(audits.at(-1).action, "message.sender.unblocked");
  });
});
