import assert from "node:assert/strict";
import { mock, test } from "node:test";
const scopeModule = await import("../../src/lib/team-permissions-scope.ts");
const { teamDeviceSessionWhere } = scopeModule.default ?? scopeModule;

const actor = { id: "fake-director", tenantId: "fake-tenant", centerIds: ["fake-school"], deviceSessionId: "fake-current", role: "CENTER_DIRECTOR" };
let user = actor;
let row;
let conflict = false;
let auditFailure = false;
let audits = 0;
let transactions = 0;
let lookupWhere;
function reset() {
  user = actor; conflict = false; auditFailure = false; audits = 0; transactions = 0; lookupWhere = null;
  row = { id: "fake-session", revokedAt: null, appMode: "teacher", deviceType: "tablet", label: "Fake tablet", user: { id: "fake-user", email: "fake@example.test", name: "Fake User" } };
}
const prisma = {
  deviceSession: { async findFirst({ where }) { lookupWhere = where; return row ? { ...row } : null; } },
  auditLog: { async create() { throw new Error("Audit escaped the device transaction"); } },
  async $transaction(callback) {
    transactions += 1;
    const staged = { ...row };
    let stagedAudits = 0;
    const result = await callback({
      deviceSession: { async updateMany({ where, data }) {
        assert.deepEqual(where.AND[0], { id: row.id, revokedAt: null });
        assert.deepEqual(where.AND[1], lookupWhere.AND[1], "Mutation rechecks the exact authorized predicate");
        if (conflict) return { count: 0 };
        Object.assign(staged, data);
        return { count: 1 };
      } },
      auditLog: { async create({ data }) {
        assert.equal(data.tenantId, actor.tenantId);
        assert.equal(data.action, "device_session.revoked");
        assert.equal(data.resourceId, row.id);
        if (auditFailure) throw new Error("Fake audit failure");
        stagedAudits += 1;
      } },
    });
    row = staged;
    audits += stagedAudits;
    return result;
  },
};
mock.module("@/lib/prisma", { namedExports: { prisma } });
mock.module("@/lib/auth", { namedExports: {
  async getCurrentUser() { return user; },
  canManageOperations(value) { return value.role === "CENTER_DIRECTOR"; },
  canAccessAllCenters() { return false; },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging(_name, handler) { return handler; } } });
const { POST } = await import("../../src/app/api/device-sessions/route.ts");
function post(sessionId = "fake-session") {
  return POST(new Request("https://fixture.invalid/api/device-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", sessionId }) }));
}

test("device session revocation remains scoped, atomic, and retry-safe", async (t) => {
  await t.test("authentication, read-only and current-device checks never enter a transaction", async () => {
    reset(); user = null; assert.equal((await post()).status, 401);
    user = { ...actor, role: "READ_ONLY_AUDITOR" }; assert.equal((await post()).status, 403);
    user = actor; assert.equal((await post("fake-current")).status, 400);
    assert.equal(transactions, 0);
  });
  await t.test("missing targets use a tenant and school bound lookup", async () => {
    reset(); row = null; assert.equal((await post()).status, 404);
    const bound = lookupWhere.AND[1];
    const date = bound.user.is.OR[1].accessGrants.some.AND[0].OR[1].startsAt.lte;
    assert.deepEqual(bound, teamDeviceSessionWhere({ tenantId: actor.tenantId, tenantWide: false, visibleCenterIds: actor.centerIds, at: date }));
    assert.equal(transactions, 0);
  });
  await t.test("concurrent access changes return conflict without audit or success", async () => {
    reset(); conflict = true; assert.equal((await post()).status, 409);
    assert.equal(row.revokedAt, null); assert.equal(audits, 0);
  });
  await t.test("audit failure rolls back the staged revocation", async () => {
    reset(); auditFailure = true; await assert.rejects(post, /Fake audit failure/);
    assert.equal(row.revokedAt, null); assert.equal(audits, 0);
  });
  await t.test("confirmed success and safe retry retain exactly one audit", async () => {
    reset(); const response = await post(); const receipt = await response.json();
    assert.equal(response.status, 200); assert.equal(receipt.ok, true);
    assert.equal(receipt.revokedAt, row.revokedAt.toISOString()); assert.equal(audits, 1);
    const retry = await post(); assert.deepEqual(await retry.json(), receipt);
    assert.equal(audits, 1); assert.equal(transactions, 1);
  });
});
