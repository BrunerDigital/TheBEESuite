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
  assert.match(script, /findUnique\(\{\s*where: \{ id: target\.familyId \}/);
  assert.match(script, /assertAppReviewTargetFingerprint/);
  assert.ok(
    script.indexOf("assertAppReviewTargetFingerprint({") < script.indexOf("await upsertSupabaseAuthUserWithPassword({"),
    "the exact target fingerprint must be checked before the Auth identity can change",
  );
  assert.doesNotMatch(script, /where: familyExternalId\s*\?/);
  assert.match(script, /active grant outside the exact authorized target/);
  assert.match(script, /Multiple Parent App Review Guardian markers exist/);
});
