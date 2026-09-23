import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.AUTH_SECRET = "synthetic-recovery-test";
let verified = 0, released = 0, completed = 0, updates = 0, providerUpdates = 0;
let revoked = false, providerStatus = 422, identity = "fake@example.invalid";
const logs = [];
mock.module("@/lib/supabase-auth", { namedExports: {
  verifySupabaseRecoveryTokenHash: async () => { verified++; return { ok: true, accessToken: "private-access", email: "fake@example.invalid" }; },
  getSupabaseAuthEmailForAccessToken: async (token) => { assert.equal(token, "private-access"); return { ok: true, email: identity }; },
  updateSupabasePassword: async (token) => { assert.equal(token, "private-access"); providerUpdates++;
    return new Response(JSON.stringify({ code: "weak_password", msg: "private-provider-detail" }), { status: providerStatus }); },
} });
mock.module("@/lib/prisma", { namedExports: { prisma: {
  user: { findMany: async () => [{ id: "fake-user", tenantId: "fake-tenant" }], updateMany: async (args) => {
    assert.deepEqual(args.where, { email: "fake@example.invalid" }); assert.equal(args.data.sessionVersion.increment, 1); updates++; }, },
  parentPortalSetupToken: { findUnique: async () => null },
} } });
mock.module("@/lib/parent-portal-setup-links", { namedExports: {
  claimParentPortalSetupToken: async (hash) => { assert.equal(hash, "private-hash"); return revoked ? { ok: false } : { ok: true, tracked: true, token: { id: "fake-setup" } }; },
  releaseParentPortalSetupToken: async () => { released++; },
  completeParentPortalSetupToken: async () => { completed++; },
} });
mock.module("@/lib/request-response-logging", { namedExports: {
  withApiLogging: (_method, handler) => handler,
  logOperationalError: (...args) => { logs.push(args); },
} });
const { POST } = await import("../../src/app/api/auth/reset-password/route.ts");
const post = (body) => POST(new Request("https://example.invalid/api/auth/reset-password", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "synthetic-password", ...body }),
}));

test("weak password retries reuse verified recovery while enforcing revocation and identity", async () => {
  const rejected = await post({ tokenHash: "private-hash" });
  assert.equal(rejected.status, 422); assert.equal(rejected.headers.get("cache-control"), "no-store");
  const body = await rejected.json(); assert.ok(body.recoveryRetryToken); assert.match(body.error, /stronger password/);
  assert.equal(verified, 1); assert.equal(released, 1); assert.equal(updates, 0); assert.equal(completed, 0);
  assert.doesNotMatch(JSON.stringify(logs), /private|synthetic-password/);
  const retry = { recoveryRetryToken: body.recoveryRetryToken, tokenHash: "attacker-hash", accessToken: "attacker-access" };
  revoked = true;
  assert.equal((await post(retry)).status, 400); assert.equal(providerUpdates, 1);
  revoked = false; identity = "other@example.invalid";
  assert.equal((await post(retry)).status, 400); assert.equal(providerUpdates, 1);
  identity = "fake@example.invalid";
  const again = await post(retry);
  assert.equal((await again.json()).recoveryRetryToken, body.recoveryRetryToken);
  providerStatus = 200;
  assert.equal((await post(retry)).status, 200);
  assert.equal(verified, 1); assert.equal(completed, 1); assert.equal(updates, 1);
  revoked = true;
  assert.equal((await post(retry)).status, 400); assert.equal(updates, 1);
});
