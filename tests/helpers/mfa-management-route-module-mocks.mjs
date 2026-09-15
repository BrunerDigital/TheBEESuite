import assert from "node:assert/strict";
import { mock, test } from "node:test";

const user = { id: "app-user", email: "synthetic@example.com", role: "CENTER_DIRECTOR", identityTenantId: "identity-tenant", tenantId: "workspace-tenant", sessionVersion: 4 };
const state = { user, count: 1, transactions: 0, provider: 0, audit: null, outcome: { ok: true, signInRequired: true } };
mock.module("@/lib/auth", { namedExports: {
  getCurrentUser: async (options) => { assert.equal(options.allowMfaEnrollment, true); return state.user; },
  SESSION_COOKIE: "bee_suite_session", sessionCookieOptions: () => ({ httpOnly: true, path: "/" }),
} });
mock.module("@/lib/app-review-targeting", { namedExports: { appReviewReservedIdentityKind: (email) => email.startsWith("app-review") ? "parent" : null } });
mock.module("@/lib/rate-limit", { namedExports: { requestIp: () => "synthetic-ip", retryAfterSeconds: () => 60, checkPersistentRateLimit: async () => ({ ok: true }) } });
mock.module("@/lib/supabase-auth", { namedExports: { getSupabaseAuthConfig: () => ({ url: "https://synthetic.supabase.co", key: "synthetic" }) } });
mock.module("@supabase/supabase-js", { namedExports: { createClient: () => ({}) } });
mock.module("@/lib/prisma", { namedExports: { prisma: { $transaction: async (callback) => {
  state.transactions++;
  return callback({ user: { updateMany: async (args) => { assert.deepEqual(args.where, { id: user.id, email: user.email, isActive: true, sessionVersion: 4 }); return { count: state.count }; } }, auditLog: { create: async (args) => { state.audit = args.data; } } });
} } } });
mock.module("@/lib/mfa-management", { namedExports: { manageMfa: async (_client, input, before) => {
  assert.equal(input.email, state.user.email);
  await before();
  state.provider++;
  return state.outcome;
} } });
const { POST } = await import("../../src/app/api/profile/mfa/route.ts");
const request = (body = { action: "confirm", password: "synthetic", factorId: "own" }, origin = "https://thebeesuite.io") => new Request("https://thebeesuite.io/api/profile/mfa", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

test("foreign origins and anonymous callers never reach factor management", async () => {
  assert.equal((await POST(request(undefined, "https://foreign.invalid"))).status, 403);
  state.user = null;
  assert.equal((await POST(request())).status, 401);
  state.user = user;
  assert.equal(state.provider, 0);
});
test("shared review identities and malformed bodies are rejected", async () => {
  state.user = { ...user, email: "app-review-parent@thebeesuite.io" };
  assert.equal((await POST(request())).status, 403);
  state.user = user;
  assert.equal((await POST(request(null))).status, 400);
  assert.equal(state.provider, 0);
});
test("session CAS precedes provider operation, audit uses identity tenant and response clears cookie", async () => {
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(state.audit.tenantId, "identity-tenant");
  assert.deepEqual(state.audit.metadata, { operation: "confirm" });
  assert.equal(state.provider, 1);
});
test("stale application session cannot execute provider mutation", async () => {
  state.count = 0;
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(state.provider, 1);
  state.count = 1;
});
test("provider failure after invalidation still clears the application cookie", async () => {
  state.outcome = { ok: false, signInRequired: true, error: "Provider unavailable" };
  const response = await POST(request());
  assert.equal(response.status, 400);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});
