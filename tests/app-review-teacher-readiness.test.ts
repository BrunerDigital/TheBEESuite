import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("teacher App Review preparation is explicit, demo-scoped, and fail-closed", async () => {
  const [script, packageJson] = await Promise.all([
    readFile(new URL("../scripts/ensure-app-review-teacher.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(script, /APP_REVIEW_TEACHER_PASSWORD/);
  assert.match(script, /password\.length < 12/);
  assert.match(script, /sourceSystem: DEMO_SOURCE/);
  assert.match(script, /role: UserRole\.TEACHER/);
  assert.match(script, /classroomId: \{ not: null \}/);
  assert.match(script, /upsertSupabaseAuthUserWithPassword/);
  assert.doesNotMatch(script, /console\.log\(JSON\.stringify\(\{[\s\S]{0,500}password/);
  assert.match(packageJson, /"app-review:teacher:ensure"/);
});
