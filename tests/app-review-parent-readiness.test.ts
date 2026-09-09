import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("parent App Review preparation requires an exact preflighted target", async () => {
  const script = await readFile(new URL("../scripts/ensure-app-review-parent.ts", import.meta.url), "utf8");

  assert.match(script, /process\.argv\.includes\("--preflight"\)/);
  assert.match(script, /APP_REVIEW_PARENT_TENANT_ID/);
  assert.match(script, /APP_REVIEW_PARENT_CENTER_ID/);
  assert.match(script, /APP_REVIEW_PARENT_FAMILY_ID/);
  assert.match(script, /APP_REVIEW_PARENT_FAMILY_EXTERNAL_ID/);
  assert.match(script, /APP_REVIEW_PARENT_TARGET_FINGERPRINT/);
  assert.match(script, /--confirm-parent-app-review-account/);
  assert.match(script, /findUnique\(\{\s*where: \{ id: target\.familyId \}/);
  assert.match(script, /assertAppReviewTargetFingerprint/);
  assert.match(script, /parentTargetFingerprint\(\{\s*email,/);
  assert.match(script, /SYNTHETIC_ROLE_QA_TENANT_SLUG/);
  assert.match(script, /SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID/);
  assert.match(script, /family\.children\.length === 0/);
  assert.match(script, /child\.classroom\.centerId !== center\.id/);
  assert.match(script, /APP_REVIEW_PARENT_EMAIL must remain the dedicated review identity/);
  assert.match(script, /getSupabaseAuthUserMetadataByEmail\(email\)/);
  assert.match(script, /linked to an unmarked or wrong-role Auth identity/);
  assert.ok(
    script.indexOf("getSupabaseAuthUserMetadataByEmail(email)") < script.indexOf("const staged = await prisma.$transaction(async (tx)"),
    "an existing Auth identity must be verified before its password can change",
  );
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
  assert.match(script, /Parent App Review activation revalidation failed; the staged account remains inactive/);
  assert.match(script, /Parent App Review Auth verification failed; the staged account remains inactive/);
  assert.match(script, /authUserBeforeWrite/);
  assert.match(script, /authUserAfterWrite/);
  assert.match(script, /isActive: false/);
  assert.match(script, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(script, /mergeCustomFields\(currentUser\?\.customFields/);
  assert.match(script, /mergeCustomFields\(currentGuardian\?\.customFields/);
  assert.doesNotMatch(script, /where: familyExternalId\s*\?/);
  assert.match(script, /active grant outside the exact authorized target/);
  assert.match(script, /Multiple Parent App Review Guardian markers exist/);
});
