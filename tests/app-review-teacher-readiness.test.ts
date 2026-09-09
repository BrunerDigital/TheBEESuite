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
  assert.match(script, /profile\.classroom\.centerId !== profile\.centerId/);
  assert.match(script, /profile\.classroom\.sourceSystem !== DEMO_SOURCE/);
  assert.match(script, /sourceProfile\.classroom\.centerId !== sourceProfile\.centerId/);
  assert.match(script, /sourceProfile\.classroom\.sourceSystem !== DEMO_SOURCE/);
  assert.match(script, /appReviewClassroomRosterSelect/);
  assert.match(script, /appReviewCenterScopeSelect/);
  assert.ok(
    (script.match(/appReviewCenterScopeViolation/g) ?? []).length >= 5,
    "candidate listing, exact preflight, inactive staging, and activation must validate the synthetic center graph",
  );
  assert.match(script, /scopeDigest: appReviewScopeDigest\(\{ center: stagedCenter, classroom: stagedClassroom \}\)/);
  assert.ok(
    (script.match(/appReviewClassroomScopeViolation/g) ?? []).length >= 5,
    "candidate listing, exact preflight, inactive staging, and activation must validate the complete classroom roster graph",
  );
  assert.match(script, /SYNTHETIC_ROLE_QA_TENANT_SLUG/);
  assert.match(script, /SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID/);
  assert.match(script, /profile\.user\.tenantId !== profile\.center\.organization\.tenantId/);
  assert.match(script, /APP_REVIEW_TEACHER_EMAIL must remain the dedicated review identity/);
  assert.match(script, /getSupabaseAuthUserMetadataByEmail\(email\)/);
  assert.match(script, /linked to an unmarked or wrong-role Auth identity/);
  assert.ok(
    script.indexOf("getSupabaseAuthUserMetadataByEmail(email)") < script.indexOf("const staged = await prisma.$transaction(async (tx)"),
    "an existing Auth identity must be verified before its password can change",
  );
  assert.match(script, /process\.argv\.includes\("--preflight"\)/);
  assert.match(script, /findUnique\(\{\s*where: \{ id: target\.sourceStaffProfileId \}/);
  assert.match(script, /assertAppReviewTargetFingerprint/);
  assert.match(script, /teacherTargetFingerprint\(\{\s*email,/);
  assert.match(script, /scopeDigest: expectedScopeDigest/);
  assert.match(script, /currentScopeDigest !== expectedScopeDigest/);
  assert.match(script, /activationScopeDigest !== staged\.scopeDigest/);
  assert.ok(
    script.indexOf("assertAppReviewTargetFingerprint({") < script.indexOf("await upsertSupabaseAuthUserWithPassword({"),
    "the exact target fingerprint must be checked before the Auth identity can change",
  );
  assert.ok(
    script.indexOf("const staged = await prisma.$transaction(async (tx)") < script.indexOf("await upsertSupabaseAuthUserWithPassword({"),
    "the exact local scope must be staged inactive before the Auth credential can change",
  );
  assert.ok(
    script.indexOf("await upsertSupabaseAuthUserWithPassword({") < script.lastIndexOf("await prisma.$transaction(async (tx)"),
    "the staged account must be revalidated and activated only after Auth succeeds",
  );
  assert.match(script, /Teacher App Review activation revalidation failed; the staged account remains inactive/);
  assert.match(script, /Teacher App Review Auth verification failed; the staged account remains inactive/);
  assert.match(script, /authUserBeforeWrite/);
  assert.match(script, /authUserAfterWrite/);
  assert.match(script, /isActive: false/);
  assert.match(script, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(script, /mergeCustomFields\(removeProfilePhotoCustomFields\(currentUser\?\.customFields\)/);
  assert.match(script, /reviewStaffCustomFields\(currentUser\?\.staffProfile\?\.customFields\)/);
  assert.match(script, /delete fields\.staffKioskPinHash/);
  assert.match(script, /delete fields\.staffKioskPinSetAt/);
  assert.match(script, /delete fields\.staffKioskPinSetById/);
  assert.match(script, /delete fields\.timeClock/);
  assert.match(script, /active grant outside the exact authorized target/);
  assert.match(script, /Multiple Teacher App Review Staff markers exist/);
  assert.match(script, /asRecord\(sourceProfile\.customFields\)\.demoWorkspace !== true/);
  assert.match(script, /upsertSupabaseAuthUserWithPassword/);
  assert.doesNotMatch(script, /console\.log\(JSON\.stringify\(\{[\s\S]{0,500}password/);
  assert.match(packageJson, /"app-review:teacher:ensure"/);
  assert.match(script, /webPushSubscription\.updateMany/);
  assert.match(script, /deviceSession\.updateMany/);
  assert.match(script, /activePushSubscriptionCount !== 0/);
  assert.match(script, /unrevokedDeviceSessionCount !== 0/);
});
