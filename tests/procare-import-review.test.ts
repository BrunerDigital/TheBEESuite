import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("ProCare imports can commit without a separate preview request", () => {
  const route = readFileSync(new URL("../src/app/api/imports/procare/route.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/procare-import-panel.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(route, /Preview and approve this exact ProCare export/);
  assert.doesNotMatch(panel, /Submit this exact export for review before committing/);
  assert.match(panel, /Import ProCare Data/);
  assert.match(route, /status: "needs_resolution"/);
  assert.match(route, /procare\.import\.rows_disposed/);
  assert.match(panel, /Unresolved imported data/);
  assert.match(panel, /\.zip/);
  assert.match(panel, /multiple/);
  assert.match(panel, /enrollment\.csv, parentinfo\.csv, relationships\.csv, and childinfo\.csv/);
  assert.match(route, /procare_multi_report_zip/);
  assert.match(route, /procare_multi_report_files/);
  assert.match(route, /formData\.getAll\("file"\)/);
  assert.match(route, /buildProcareMultiReportRows/);
});
