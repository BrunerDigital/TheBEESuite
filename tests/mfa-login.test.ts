import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateMfaLogin } from "../src/lib/mfa-login";

const input = { email: "synthetic@example.com", password: "synthetic-password" };
const user = { id: "auth-user", email: input.email };
const primary = { id: "primary", status: "verified", factor_type: "totp", friendly_name: "Primary authenticator" };
const backup = { ...primary, id: "backup", friendly_name: "Backup authenticator" };

function provider(options: {
  factors?: unknown[]; passwordError?: number; listError?: boolean; verifyError?: boolean;
  level?: string; verifiedUser?: typeof user; throws?: boolean;
} = {}) {
  const calls: { method: string; args?: unknown }[] = [];
  const client = { auth: {
    async signInWithPassword(args: unknown) {
      calls.push({ method: "password", args });
      return options.passwordError
        ? { data: { session: null, user: null }, error: { status: options.passwordError } }
        : { data: { session: { access_token: "never-return-this" }, user }, error: null };
    },
    mfa: {
      async listFactors() {
        calls.push({ method: "list" });
        if (options.throws) throw new Error("provider unavailable");
        return { data: { all: options.factors ?? [] }, error: options.listError ? {} : null };
      },
      async challengeAndVerify(args: unknown) {
        calls.push({ method: "verify", args });
        return { data: { user: options.verifiedUser ?? user }, error: options.verifyError ? {} : null };
      },
      async getAuthenticatorAssuranceLevel() {
        calls.push({ method: "assurance" });
        return { data: { currentLevel: options.level ?? "aal2" }, error: null };
      },
    },
    async signOut(args: unknown) { calls.push({ method: "logout", args }); return { error: null }; },
  } } as unknown as Pick<SupabaseClient, "auth">;
  return { client, calls };
}

test("unenrolled logins succeed without enrollment or retained provider tokens", async () => {
  const { client, calls } = provider();
  assert.deepEqual(await authenticateMfaLogin(client, input), { status: "verified" });
  assert.deepEqual(calls.map((call) => call.method), ["password", "list", "logout"]);
  assert.deepEqual(calls.at(-1)?.args, { scope: "local" });
});

test("wrong passwords and provider failures cannot request a factor or create a session", async () => {
  for (const status of [400, 401, 429, 500]) {
    const { client, calls } = provider({ passwordError: status });
    assert.deepEqual(await authenticateMfaLogin(client, input), { status: status < 429 ? "invalid_password" : "unavailable" });
    assert.equal(calls.length, 1);
  }
});

test("verified MFA requires a code; pending enrollment alone does not enforce MFA", async () => {
  const enrolled = provider({ factors: [primary, backup] });
  assert.deepEqual(await authenticateMfaLogin(enrolled.client, input), {
    status: "mfa_required", factors: [{ id: "primary", label: primary.friendly_name }, { id: "backup", label: backup.friendly_name }],
  });
  assert.ok(!enrolled.calls.some((call) => call.method === "verify"));
  const pending = provider({ factors: [{ ...primary, status: "unverified" }] });
  assert.deepEqual(await authenticateMfaLogin(pending.client, input), { status: "verified" });
});

test("factor substitution and malformed codes never reach provider verification", async () => {
  for (const fields of [{ mfaCode: "123456", mfaFactorId: "another-user" }, { mfaCode: "123" }, { mfaCode: "abcdef" }]) {
    const { client, calls } = provider({ factors: [primary] });
    assert.equal((await authenticateMfaLogin(client, { ...input, ...fields })).status, "invalid_code");
    assert.ok(!calls.some((call) => call.method === "verify"));
  }
});

test("backup authenticator succeeds only after provider verification and AAL2", async () => {
  const { client, calls } = provider({ factors: [primary, backup] });
  assert.deepEqual(await authenticateMfaLogin(client, { ...input, mfaCode: "123456", mfaFactorId: "backup" }), { status: "verified" });
  assert.deepEqual(calls.find((call) => call.method === "verify")?.args, { code: "123456", factorId: "backup" });
  assert.deepEqual(calls.map((call) => call.method), ["password", "list", "verify", "assurance", "logout"]);
});

test("failed factor checks, lower assurance and mismatched identity fail closed", async () => {
  for (const options of [{ verifyError: true }, { level: "aal1" }, { verifiedUser: { ...user, id: "other" } }, { listError: true }, { throws: true }]) {
    const { client, calls } = provider({ factors: [primary], ...options });
    assert.notEqual((await authenticateMfaLogin(client, { ...input, mfaCode: "123456" })).status, "verified");
    assert.equal(calls.at(-1)?.method, "logout");
  }
});

test("unsupported verified factors require recovery instead of bypassing MFA", async () => {
  const { client, calls } = provider({ factors: [{ ...primary, factor_type: "phone" }] });
  assert.deepEqual(await authenticateMfaLogin(client, input), { status: "unsupported_factor" });
  assert.ok(!calls.some((call) => call.method === "verify"));
});
