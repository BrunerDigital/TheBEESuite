import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAppReviewTargetFingerprint,
  buildAppReviewTargetFingerprint,
} from "@/lib/app-review-targeting";

test("App Review target fingerprints are deterministic and target-sensitive", () => {
  const fields = {
    tenantId: "tenant-demo",
    centerId: "center-demo",
    familyId: "family-demo",
  };
  const first = buildAppReviewTargetFingerprint("parent", fields);
  const reordered = buildAppReviewTargetFingerprint("parent", {
    familyId: fields.familyId,
    tenantId: fields.tenantId,
    centerId: fields.centerId,
  });

  assert.equal(first, reordered);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, buildAppReviewTargetFingerprint("parent", { ...fields, familyId: "other-family" }));
  assert.notEqual(first, buildAppReviewTargetFingerprint("teacher", fields));
});

test("App Review target fingerprints reject missing or stale confirmation", () => {
  assert.throws(
    () => buildAppReviewTargetFingerprint("parent", { tenantId: "" }),
    /empty App Review target field/,
  );
  assert.throws(
    () => assertAppReviewTargetFingerprint({
      expected: "a".repeat(64),
      provided: "b".repeat(64),
      environmentVariable: "APP_REVIEW_TARGET_FINGERPRINT",
    }),
    /exact fingerprint returned by a fresh --preflight/,
  );
  assert.doesNotThrow(() => assertAppReviewTargetFingerprint({
    expected: "a".repeat(64),
    provided: `  ${"A".repeat(64)}  `,
    environmentVariable: "APP_REVIEW_TARGET_FINGERPRINT",
  }));
});
