import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.SUPABASE_URL = "https://synthetic.example.invalid";
process.env.SUPABASE_ANON_KEY = "synthetic-key";
let providerResult;
let logged;
let released = 0;
globalThis.fetch = async (url) => {
  assert.equal(String(url), "https://synthetic.example.invalid/auth/v1/verify");
  return new Response(JSON.stringify(providerResult.body), { status: providerResult.status, headers: { "Content-Type": "application/json" } });
};
mock.module("@/lib/prisma", { namedExports: { prisma: new Proxy({}, {
  get() { throw new Error("Recovery rejection must not touch user, session or audit records"); },
}) } });
mock.module("@/lib/parent-portal-setup-links", { namedExports: {
  claimParentPortalSetupToken: async () => ({ ok: true, tracked: true, token: { id: "fake-setup" } }),
  releaseParentPortalSetupToken: async (id) => { assert.equal(id, "fake-setup"); released++; },
  completeParentPortalSetupToken: async () => { throw new Error("Must not complete a rejected recovery"); },
} });
mock.module("@/lib/request-response-logging", { namedExports: {
  withApiLogging: (_method, handler) => handler,
  logOperationalError: (...args) => { logged = args; },
} });
const { verifySupabaseRecoveryTokenHash } = await import("../../src/lib/supabase-auth.ts");
const { POST } = await import("../../src/app/api/auth/reset-password/route.ts");

for (const [status, expected] of [[403,403],[422,422],[429,429],[503,503]]) {
  test(`recovery rejection with provider status ${status} preserves safe HTTP response and diagnostic ${expected}`, async () => {
    providerResult = { status, body: { msg: "private provider detail" } };
    released = 0;
    const response = await POST(new Request("https://example.invalid/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenHash: "private-token", password: "private-password" }),
    }));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { ok: false, error: "Password reset link is invalid or expired. Request a fresh reset link." });
    assert.deepEqual(logged, ["auth.reset_password.supabase_token_hash_failed", null, { status: expected }]);
    assert.equal(released, 1);
  });
}
test("malformed provider success remains a service failure while valid recovery is unchanged", async () => {
  providerResult = { status: 200, body: {} };
  assert.equal((await verifySupabaseRecoveryTokenHash("fake")).providerStatus, 502);
  providerResult = { status: 200, body: { access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 3600,
    token_type: "bearer", user: { id: "fake-user", email: "Fake@Example.invalid" } } };
  assert.deepEqual(await verifySupabaseRecoveryTokenHash("fake"), { ok: true, accessToken: "fake-access", email: "fake@example.invalid" });
});
