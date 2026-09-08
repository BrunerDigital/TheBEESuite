import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("teacher App Review preparation is explicit, demo-scoped, and fail-closed", async () => {
  const [script, packageJson] = await Promise.all([
    readFile(new URL("../scripts/ensure-app-review-teacher.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(script, /APP_REVIEW_TEACHER_PASSWORD/);
  assert.match(script, /APP_REVIEW_TEACHER_TENANT_ID/);
  assert.match(script, /APP_REVIEW_TEACHER_CENTER_ID/);
  assert.match(script, /APP_REVIEW_TEACHER_CLASSROOM_ID/);
  assert.match(script, /APP_REVIEW_TEACHER_SOURCE_STAFF_ID/);
  assert.match(script, /APP_REVIEW_TEACHER_TARGET_FINGERPRINT/);
  assert.match(script, /--confirm-teacher-app-review-account/);
  assert.match(script, /password\.length < 12/);
  assert.match(script, /sourceSystem: DEMO_SOURCE/);
  assert.match(script, /role: UserRole\.TEACHER/);
  assert.match(script, /classroomId: \{ not: null \}/);
  assert.match(script, /process\.argv\.includes\("--preflight"\)/);
  assert.match(script, /findUnique\(\{\s*where: \{ id: target\.sourceStaffProfileId \}/);
  assert.match(script, /assertAppReviewTargetFingerprint/);
  assert.match(script, /teacherTargetFingerprint\(\{\s*email,/);
  assert.ok(
    script.indexOf("assertAppReviewTargetFingerprint({") < script.indexOf("await upsertSupabaseAuthUserWithPassword({"),
    "the exact target fingerprint must be checked before the Auth identity can change",
  );
  assert.ok(
    script.indexOf("await upsertSupabaseAuthUserWithPassword({") < script.indexOf("await prisma.$transaction(async (tx)"),
    "Auth must be established before the atomic local access transaction",
  );
  assert.match(script, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(script, /mergeCustomFields\(currentUser\?\.customFields/);
  assert.match(script, /mergeCustomFields\(currentUser\?\.staffProfile\?\.customFields/);
  assert.match(script, /active grant outside the exact authorized target/);
  assert.match(script, /Multiple Teacher App Review Staff markers exist/);
  assert.match(script, /upsertSupabaseAuthUserWithPassword/);
  assert.doesNotMatch(script, /console\.log\(JSON\.stringify\(\{[\s\S]{0,500}password/);
  assert.match(packageJson, /"app-review:teacher:ensure"/);
});
