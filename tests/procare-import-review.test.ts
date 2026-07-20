import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROCARE_DUPLICATE_REVIEW_ROW_LIMIT,
  procareImportReviewFingerprint,
  procareSourceSha256,
} from "@/lib/procare-import-review";

test("ProCare source hashes identify the exact reviewed export", () => {
  const source = "Family Name,Child Name\nRivera Family,Avery Rivera\n";

  assert.equal(procareSourceSha256(source), procareSourceSha256(source));
  assert.notEqual(procareSourceSha256(source), procareSourceSha256(`${source}\n`));
});

test("ProCare review fingerprints bind the export, center, and duplicate mode", () => {
  const reviewed = {
    text: "Family Name\nRivera Family\n",
    requestedCenterId: "center_longmont",
    duplicateMode: "review" as const,
    secret: "test-review-secret",
  };

  assert.equal(
    procareImportReviewFingerprint(reviewed),
    procareImportReviewFingerprint(reviewed),
  );
  assert.notEqual(
    procareImportReviewFingerprint(reviewed),
    procareImportReviewFingerprint({ ...reviewed, requestedCenterId: "center_kokomo" }),
  );
  assert.notEqual(
    procareImportReviewFingerprint(reviewed),
    procareImportReviewFingerprint({ ...reviewed, duplicateMode: "strict" }),
  );
  assert.notEqual(
    procareImportReviewFingerprint(reviewed),
    procareImportReviewFingerprint({ ...reviewed, secret: "different-secret" }),
  );
  assert.equal(PROCARE_DUPLICATE_REVIEW_ROW_LIMIT, 500);
});
