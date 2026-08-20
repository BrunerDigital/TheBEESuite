import assert from "node:assert/strict";
import test from "node:test";
import { isSupabaseAuthCompatibleEmail } from "@/lib/supabase-auth";

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
