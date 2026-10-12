import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
let actor;
let centers;
let existing;
let failAuth;
let failTransaction;
let created;
let authCalls;
let grants;
let audit;
const tx = {
  center: { async findMany() { return centers; } },
  userAccessGrant: { async findFirst() { return null; }, async create({ data }) { grants.push(data); return data; } },
  user: { async update({ data }) { created = { ...created, ...data }; return created; } },
  auditLog: { async create({ data }) { audit = data; } },
};
const db = {
  center: { async findMany({ where }) { assert.equal(where.organization.tenantId, "tenant-a"); return centers; } },
  user: { async findUnique() { return existing; }, async create({ data }) { created = { id: "owner-id", ...data }; return created; } },
  async $transaction(callback) { if (failTransaction) throw new Error("database unavailable"); return callback(tx); },
};
mock.module("@/lib/prisma", { namedExports: { prisma: db } });
mock.module("@/lib/auth", { namedExports: {
  getCurrentUser: async () => actor,
  canManageOperations: (user) => user.role === "PLATFORM_OWNER",
  canAdministerAllCenters: (user) => user.role === "PLATFORM_OWNER",
  canAdministerCenter: (_user, id) => ["school-a", "school-b"].includes(id),
} });
mock.module("@/lib/supabase-auth", { namedExports: {
  getPasswordResetRedirectUrl: () => "",
  requestSupabasePasswordReset: async () => { throw new Error("Unexpected send"); },
  upsertSupabaseAuthUserWithPassword: async (input) => { authCalls.push(input); if (failAuth) throw new Error("Existing Auth identity"); return { created: true }; },
} });
mock.module("@/lib/request-response-logging", { namedExports: { withApiLogging: (_method, handler) => handler } });
const { POST } = await import("../../src/app/api/admin/executive/route.ts");
function reset() {
  actor = { id: "admin", email: "admin@example.com", tenantId: "tenant-a", role: "PLATFORM_OWNER" };
  centers = [{ id: "school-a", organizationId: "org-a" }, { id: "school-b", organizationId: "org-a" }];
  existing = null; failAuth = false; failTransaction = false; created = null; authCalls = []; grants = []; audit = null;
}
async function request(input = {}) {
  return POST(new NextRequest("https://example.com/api/admin/executive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createOwnerLogin", name: "Owner", email: "owner@example.com", password: "temporary-password-123", centerIds: ["school-a", "school-b"], ...input }) }));
}
test("owner provisioning rejects unauthorized callers and foreign schools before creating identities", async () => {
  reset(); actor = null; assert.equal((await request()).status, 401);
  reset(); actor.role = "CENTER_DIRECTOR"; assert.equal((await request()).status, 403);
  reset(); assert.equal((await request({ centerIds: ["foreign"] })).status, 400);
  reset(); centers = []; assert.equal((await request()).status, 400);
  assert.equal(created, null); assert.equal(authCalls.length, 0);
});
test("existing users are preserved and Auth failures leave a disabled reservation without grants", async () => {
  reset(); existing = { id: "parent-id" }; assert.equal((await request()).status, 400);
  assert.equal(created, null); assert.equal(authCalls.length, 0);
  reset(); failAuth = true; assert.equal((await request()).status, 400);
  assert.equal(created.isActive, false); assert.equal(grants.length, 0);
  assert.equal(authCalls[0].rejectIfExists, true);
  reset(); failTransaction = true; assert.equal((await request()).status, 400);
  assert.equal(created.isActive, false); assert.equal(grants.length, 0);
});
test("successful owner provisioning activates exact CENTER grants atomically and never returns a password", async () => {
  reset(); const response = await request(); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.user.isActive, true); assert.equal(result.setupUrl, "/owner");
  assert.equal(created.role, "CENTER_DIRECTOR"); assert.equal(created.mustResetPassword, true);
  assert.equal(created.customFields.accountType, "school_owner");
  assert.deepEqual(grants.map((grant) => grant.centerId), ["school-a", "school-b"]);
  assert.ok(grants.every((grant) => grant.scopeType === "CENTER" && grant.tenantId === "tenant-a"));
  assert.equal(audit.action, "executive.school_owner.created");
  assert.equal(JSON.stringify(result).includes("temporary-password"), false);
});
