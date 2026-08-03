import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("guardian and teacher access execution stays production-gated and credential-safe", () => {
  const source = readFileSync(
    new URL("../scripts/execute-safe-guardian-teacher-access.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /--ack-production=\$\{EXPECTED_SUPABASE_REF\}/);
  assert.match(source, /--ack-safe-exceptions/);
  assert.match(source, /--guardians-only/);
  assert.match(source, /--teachers-only/);
  assert.match(source, /--ack-plan=\$\{plan\.fingerprint\}/);
  assert.match(source, /Apply requires exactly one staged mode/);
  assert.match(source, /BEE_SUITE_TEACHER_BATCH_PASSWORD/);
  assert.match(source, /Refusing to operate against an unexpected Supabase project/);
  assert.doesNotMatch(source, /const TEACHER_PASSWORD\s*=\s*["']/);
  assert.doesNotMatch(source, /BusyBees/);
});

test("the access audit is read-only", () => {
  const source = readFileSync(
    new URL("../scripts/audit-guardian-teacher-access.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /prisma\.[a-zA-Z]+\.(?:create|delete|update|upsert)\s*\(/);
  assert.doesNotMatch(source, /auth\.admin\.(?:createUser|deleteUser|updateUserById)\s*\(/);
  assert.match(source, /Refusing to audit an unexpected Supabase project/);
});
