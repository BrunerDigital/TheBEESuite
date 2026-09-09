import assert from "node:assert/strict";
import test from "node:test";
import { APP_REVIEW_PARENT_CONTACT } from "@/lib/app-review-targeting";
import {
  deleteSupabaseAuthUserByEmail,
  ensureSupabaseAuthUser,
  generateSupabasePasswordRecoveryLink,
  getSupabaseAuthEmailForAccessToken,
  isSupabaseAuthCompatibleEmail,
  requestSupabasePasswordReset,
  updateSupabaseAuthUserEmailByCurrentEmail,
  updateSupabaseAuthUserPasswordByEmail,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

test("Supabase Auth email preflight accepts ordinary addresses", () => {
  assert.equal(isSupabaseAuthCompatibleEmail("parent@example.com"), true);
  assert.equal(isSupabaseAuthCompatibleEmail("parent+payments@sub.example.com"), true);
});

test("Supabase Auth email preflight rejects provider-incompatible address shapes", () => {
  assert.equal(isSupabaseAuthCompatibleEmail("parent..name@example.com"), false);
  assert.equal(isSupabaseAuthCompatibleEmail("parent@example_domain.com"), false);
  assert.equal(isSupabaseAuthCompatibleEmail("parent@-example.com"), false);
  assert.equal(isSupabaseAuthCompatibleEmail("parent@example-.com"), false);
  assert.equal(isSupabaseAuthCompatibleEmail("parent@example"), false);
});

test("reserved App Review credentials reject recovery and ordinary password updates before provider access", async () => {
  const directRecovery = await requestSupabasePasswordReset(
    APP_REVIEW_PARENT_CONTACT.email,
    "https://thebeesuite.io/reset-password",
  );
  assert.equal(directRecovery.status, 403);
  assert.deepEqual(
    await generateSupabasePasswordRecoveryLink({ email: APP_REVIEW_PARENT_CONTACT.email }),
    {
      ok: false,
      error: "Shared App Review credentials cannot use account recovery.",
      status: 403,
    },
  );
  assert.deepEqual(
    await updateSupabaseAuthUserPasswordByEmail({
      email: APP_REVIEW_PARENT_CONTACT.email,
      password: "synthetic-unused-password",
    }),
    {
      ok: false,
      error: "Shared App Review credentials can be changed only through the controlled review-account process.",
    },
  );
  await assert.rejects(
    () => upsertSupabaseAuthUserWithPassword({
      email: APP_REVIEW_PARENT_CONTACT.email,
      password: "synthetic-unused-password",
    }),
    /controlled fingerprinted provisioner/,
  );
  assert.deepEqual(
    await ensureSupabaseAuthUser({ email: APP_REVIEW_PARENT_CONTACT.email }),
    {
      ok: false,
      created: false,
      error: "Reserved App Review identities require the controlled fingerprinted provisioner.",
    },
  );
  assert.deepEqual(
    await deleteSupabaseAuthUserByEmail(APP_REVIEW_PARENT_CONTACT.email),
    {
      ok: false,
      error: "Reserved App Review identities cannot be deleted through account workflows.",
    },
  );
  assert.deepEqual(
    await updateSupabaseAuthUserEmailByCurrentEmail({
      currentEmail: APP_REVIEW_PARENT_CONTACT.email,
      newEmail: "new-review-parent@example.com",
    }),
    {
      ok: false,
      error: "Reserved App Review identities cannot be changed through parent account workflows.",
    },
  );
});

test("Supabase access-token identity lookup normalizes the verified email before a password mutation", async (context) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  context.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousKey;
  });
  context.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://example.supabase.co/auth/v1/user");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer synthetic-recovery-token");
    return new Response(JSON.stringify({ email: "  APP-REVIEW-TEACHER@THEBEESUITE.IO  " }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  assert.deepEqual(
    await getSupabaseAuthEmailForAccessToken("synthetic-recovery-token"),
    { ok: true, email: "app-review-teacher@thebeesuite.io" },
  );
});
