import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import deletionPolicy from "../../src/lib/account-deletion-policy.ts";
const { accountDeletionExecutionPhrase, accountDeletionFingerprint } = deletionPolicy;

let requestRow, outbox, providerCalls, queueFails, photoFails, photoCalls, committed;
function reset() {
  requestRow = { id: "request-1", tenantId: "school-tenant", centerId: "center-1", createdAt: new Date("2026-09-28T12:00:00Z"), updatedAt: new Date("2026-09-28T12:00:00Z"), status: "approved", retentionNoticeAccepted: true, schoolReviewRequired: true,
    userId: "parent-1", user: { id: "parent-1", tenantId: "school-tenant", email: "parent@example.test", role: "PARENT_GUARDIAN", isActive: true }, guardian: { userId: "parent-1", family: { centerId: "center-1" } }, center: { organization: { tenantId: "school-tenant" } } };
  outbox = []; providerCalls = 0; queueFails = false; photoFails = false; photoCalls = 0; committed = false;
}
const tx = {
  userAccessGrant: { async updateMany() { return { count: 1 }; } }, deviceSession: { async updateMany() { return { count: 1 }; } }, webPushSubscription: { async updateMany() { return { count: 1 }; } }, guardian: { async updateMany() { return { count: 1 }; } },
  user: { async update() { return {}; } }, dataDeletionRequest: { async update() { return {}; } }, auditLog: { async create() { return {}; } },
  integrationDelivery: { async create({ data }) { if (queueFails) throw new Error("Fake outbox unavailable"); outbox.push(data); return { id: "delivery-1" }; } },
};
const prisma = {
  dataDeletionRequest: { async findUnique() { return requestRow; }, async updateMany() { return { count: 1 }; }, async update({ data }) { requestRow.status = data.status; return {}; } },
  auditLog: { async create() { return {}; } },
  async $transaction(callback) {
    if (Array.isArray(callback)) return Promise.all(callback);
    const length = outbox.length;
    try { const result = await callback(tx); committed = true; return result; }
    catch (error) { outbox.splice(length); throw error; }
  },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: { async getCurrentUser() { return { id: "owner-1", role: "PLATFORM_OWNER", tenantId: "owner-tenant" }; } } });
mock.module("@/lib/rate-limit", { namedExports: { async checkPersistentRateLimit() { return { ok: true }; }, requestIp() { return "fake"; }, retryAfterSeconds() { return 10; } } });
mock.module("@/lib/supabase-auth", { namedExports: { async deleteSupabaseAuthUserByEmail(email) { assert.equal(email, "parent@example.test"); providerCalls++; return { ok: true, deleted: true, alreadyMissing: false }; } } });
mock.module("@/lib/account-deletion-profile-photos", { namedExports: { async deleteAccountProfilePhotos(input) { assert.equal(input.userId, "parent-1"); assert.equal(input.tenantId, "school-tenant"); photoCalls++; if (photoFails) throw new Error("Fake storage failure"); return 2; } } });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_method, handler) { return handler; } } });
const { PATCH } = await import("../../src/app/api/privacy/deletion-requests/[id]/review/route.ts");
const execute = () => PATCH(new NextRequest("https://fixture.invalid/api/privacy/deletion-requests/request-1/review", { method: "PATCH", headers: { origin: "https://fixture.invalid", "content-type": "application/json" }, body: JSON.stringify({ action: "execute", confirmation: accountDeletionExecutionPhrase(accountDeletionFingerprint(requestRow)) }) }), { params: Promise.resolve({ id: "request-1" }) });

test("actual deletion executor confirms completion only through its successful transaction", async t => {
  await t.test("successful deletion queues exactly one original-address confirmation in the target tenant", async () => {
    reset(); const response = await execute(); assert.equal(response.status, 200); assert.equal(committed, true); assert.equal(providerCalls, 1); assert.equal(outbox.length, 1);
    assert.equal(photoCalls, 1); assert.equal(outbox[0].tenantId, "school-tenant"); assert.deepEqual(outbox[0].payload.to, ["parent@example.test"]); assert.equal(outbox[0].status, "pending");
    requestRow.status = "completed"; assert.equal((await execute()).status, 200); assert.equal(providerCalls, 1); assert.equal(outbox.length, 1);
  });
  await t.test("a failed completion queue leaves cleanup pending and sends no premature success notice", async () => {
    reset(); queueFails = true; assert.equal((await execute()).status, 500); assert.equal(committed, false); assert.equal(providerCalls, 1); assert.equal(requestRow.status, "partially_completed"); assert.deepEqual(outbox, []);
  });
  await t.test("photo cleanup failure keeps completion pending and does not queue a success notice", async () => {
    reset(); photoFails = true; assert.equal((await execute()).status, 500); assert.equal(committed, false); assert.equal(photoCalls, 1); assert.equal(requestRow.status, "partially_completed"); assert.deepEqual(outbox, []);
  });
});
