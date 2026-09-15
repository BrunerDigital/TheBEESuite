import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manageMfa, type MfaManagementInput } from "../src/lib/mfa-management";
import { roleRequiresMfa, sessionMeetsMfaPolicy } from "../src/lib/mfa-policy";
import { UserRole } from "@prisma/client";
import { resolvePostLoginPath } from "../src/lib/login-routing";

const user = { id: "synthetic-auth", email: "synthetic@example.com" };
const input: MfaManagementInput = { ...user, password: "not-a-real-password", action: "list" };
const primary = { id: "primary", status: "verified", factor_type: "totp", friendly_name: "Phone" };
const pending = { ...primary, id: "pending", status: "unverified" };
function provider(factors = [primary, pending], options: { badPassword?: boolean; badCode?: boolean; level?: string; wrongUser?: boolean; timeout?: boolean } = {}) {
  const calls: string[] = [];
  const client = { auth: {
    async signInWithPassword() { calls.push("password"); return { data: { user, session: {} }, error: options.badPassword ? {} : null }; },
    async signOut() { calls.push("logout"); return { error: null }; },
    mfa: {
      async listFactors() { return { data: { all: factors }, error: null }; },
      async challengeAndVerify({ factorId }: { factorId: string }) {
        calls.push(`verify:${factorId}`);
        if (options.timeout && factorId === "pending") throw new Error("timeout");
        return { data: { user: options.wrongUser ? { id: "other" } : user }, error: options.badCode ? {} : null };
      },
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: options.level ?? "aal2" }, error: null }; },
      async enroll() { calls.push("enroll"); return { data: { id: "new", totp: { secret: "synthetic-seed", uri: "otpauth://synthetic" } }, error: null }; },
      async unenroll() { calls.push("remove"); return { error: null }; },
    },
  } } as unknown as Pick<SupabaseClient, "auth">;
  const invalidate = async () => { calls.push("invalidate"); };
  return { client, calls, invalidate };
}
const proof = { currentFactorId: "primary", currentCode: "123456" };

test("listing is password-protected and never returns provider tokens or seeds", async () => {
  const p = provider();
  const result = await manageMfa(p.client, input, p.invalidate);
  assert.equal(result.ok, true);
  assert.equal(result.factors?.length, 2);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.deepEqual(p.calls, ["password", "logout"]);
  const denied = provider([], { badPassword: true });
  assert.equal((await manageMfa(denied.client, input, denied.invalidate)).ok, false);
});

test("first enrollment remains pending; adding a backup requires an existing factor", async () => {
  const first = provider([]);
  assert.equal((await manageMfa(first.client, { ...input, action: "enroll", label: "Phone" }, first.invalidate)).enrollment?.id, "new");
  assert.deepEqual(first.calls, ["password", "enroll", "logout"]);
  const backup = provider();
  assert.equal((await manageMfa(backup.client, { ...input, action: "enroll", label: "Backup" }, backup.invalidate)).requiresMfa, true);
  assert.ok(!backup.calls.includes("enroll"));
});

test("activation invalidates app sessions before changing the provider and requires fresh sign-in", async () => {
  const p = provider([pending]);
  const result = await manageMfa(p.client, { ...input, action: "confirm", factorId: "pending", code: "123456" }, p.invalidate);
  assert.deepEqual(result, { ok: true, signInRequired: true });
  assert.deepEqual(p.calls, ["password", "invalidate", "verify:pending", "logout"]);
});

test("database failure prevents activation; provider uncertainty keeps sessions invalidated", async () => {
  const p = provider([pending]);
  assert.equal((await manageMfa(p.client, { ...input, action: "confirm", factorId: "pending", code: "123456" }, async () => { throw new Error("db"); })).ok, false);
  assert.ok(!p.calls.includes("verify:pending"));
  const uncertain = provider([pending], { timeout: true });
  const result = await manageMfa(uncertain.client, { ...input, action: "confirm", factorId: "pending", code: "123456" }, uncertain.invalidate);
  assert.equal(result.signInRequired, true);
  assert.equal(result.ok, false);
});

test("cross-account IDs, wrong existing codes and lower assurance cannot change factors", async () => {
  for (const options of [{ badCode: true }, { level: "aal1" }, { wrongUser: true }]) {
    const p = provider(undefined, options);
    assert.equal((await manageMfa(p.client, { ...input, ...proof, action: "enroll", label: "Backup" }, p.invalidate)).ok, false);
    assert.ok(!p.calls.includes("enroll"));
  }
  const p = provider();
  assert.equal((await manageMfa(p.client, { ...input, ...proof, action: "remove", factorId: "foreign" }, p.invalidate)).ok, false);
  assert.ok(!p.calls.includes("invalidate"));
});

test("last working authenticator is retained; backup removal requires fresh proof", async () => {
  const p = provider([primary]);
  assert.equal((await manageMfa(p.client, { ...input, ...proof, action: "remove", factorId: "primary" }, p.invalidate)).ok, false);
  assert.ok(!p.calls.includes("invalidate"));
  const multiple = provider([primary, { ...primary, id: "backup" }]);
  assert.deepEqual(await manageMfa(multiple.client, { ...input, ...proof, action: "remove", factorId: "backup" }, multiple.invalidate), { ok: true, signInRequired: true });
  assert.deepEqual(multiple.calls, ["password", "verify:primary", "invalidate", "remove", "logout"]);
});

test("MFA rollout defaults off; configured roles require signed boolean assurance and typos fail closed", () => {
  assert.equal(roleRequiresMfa(UserRole.BILLING_ADMIN, ""), false);
  assert.equal(roleRequiresMfa(UserRole.BILLING_ADMIN, "BILLING_ADMIN,CENTER_DIRECTOR"), true);
  assert.equal(sessionMeetsMfaPolicy(UserRole.BILLING_ADMIN, "true", "BILLING_ADMIN"), false);
  assert.equal(sessionMeetsMfaPolicy(UserRole.BILLING_ADMIN, true, "BILLING_ADMIN"), true);
  assert.equal(roleRequiresMfa(UserRole.BILLING_ADMIN, "BILLING_ADMN"), true);
});

test("all roles can return to their own security settings after reauthentication", () => {
  for (const role of Object.values(UserRole)) assert.equal(resolvePostLoginPath({ role, requestedNext: "/account/security" }), "/account/security");
});
