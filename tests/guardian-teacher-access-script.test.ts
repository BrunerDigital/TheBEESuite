import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the access audit is read-only and production-secret gated", () => {
  const source = readFileSync(
    new URL("../scripts/audit-guardian-teacher-access.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /prisma\.[a-zA-Z]+\.(?:create|delete|update|upsert)\s*\(/);
  assert.doesNotMatch(source, /auth\.admin\.(?:createUser|deleteUser|updateUserById)\s*\(/);
  assert.match(source, /PIN_HASH_SECRET is required for a production guardian PIN audit/);
  assert.match(source, /parsedUrl\.hostname !== `\$\{EXPECTED_SUPABASE_REF\}\.supabase\.co`/);
  assert.match(source, /Refusing to audit an unexpected Supabase project/);
  assert.doesNotMatch(source, /BusyBees/);
});
