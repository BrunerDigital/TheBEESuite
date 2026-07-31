import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PROCARE_DUPLICATE_REVIEW_ROW_LIMIT,
  procareImportReviewFingerprint,
  procareSourceSha256,
} from "@/lib/procare-import-review";
import { buildProcareMultiReportRowsFromFiles } from "@/lib/procare-multi-report-import";

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

test("ProCare imports require the exact completed review before commit", () => {
  const route = readFileSync(new URL("../src/app/api/imports/procare/route.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/procare-import-panel.tsx", import.meta.url), "utf8");

  assert.match(panel, /Submit this exact ProCare export for review before committing it/);
  assert.match(panel, /Import ProCare Data/);
  assert.match(route, /status: "needs_resolution"/);
  assert.match(route, /procare\.import\.rows_disposed/);
  assert.match(panel, /Unresolved imported data/);
  assert.match(panel, /Folder and file names do not control detection/);
  assert.match(panel, /multiple/);
  assert.match(panel, /shows exactly what will import/);
  assert.match(route, /procare_multi_report_zip/);
  assert.match(route, /procare_multi_report_files/);
  assert.match(route, /buildConsolidatedRowsFromFiles/);
  assert.match(route, /combineStandardAndSupplementalProcareRows/);
  assert.match(route, /buildRenderedProcareReportRowsFromFiles/);
  assert.match(route, /procare_rendered_report_files/);
  assert.match(route, /supplemental_import/);
  assert.match(route, /evidence_only/);
  assert.match(route, /childIdentity/);
  assert.match(route, /accountIdentity/);
  assert.match(panel, /mapping-follow-up/);
  assert.match(panel, /staff, schedule, attendance, sign-in\/out, health, and account-balance exports/);
  assert.match(route, /looksLikeStandardMultiReportShard/);
  assert.match(route, /sourceType: "csv_files"/);
  assert.match(route, /Choose either uploaded files or pasted CSV text/);
  assert.match(route, /MAX_PROCARE_SOURCE_FILES/);
  assert.match(route, /MAX_PROCARE_UPLOAD_BYTES/);
  assert.match(route, /No supported ProCare report or consolidated CSV columns were recognized/);
  assert.match(route, /formData\.getAll\("file"\)/);
  assert.match(route, /if \(isZipBuffer\(buffer\)\)/);
  assert.doesNotMatch(panel, /accept="/);
  assert.match(panel, /setSelectedFiles/);
  assert.match(panel, /identifies each report from its columns/);
  assert.match(panel, /Choose one folder/);
  assert.match(panel, /webkitdirectory/);
  assert.match(panel, /webkitRelativePath/);
  assert.match(panel, /Folder and file names do not control detection/);
  assert.match(panel, /selectedFilesTotalBytes/);
  assert.match(panel, /removeSelectedFile/);
  assert.match(panel, /Clear pasted text/);
  assert.match(panel, /Choose one source type/);
  assert.match(panel, /Preview ready - no records written yet/);
  assert.match(panel, /Detected source inventory/);
  assert.match(panel, /sourceInventoryConfirmed/);
  assert.match(route, /Confirm the detected ProCare source inventory before importing/);
  assert.match(panel, /XMLHttpRequest/);
  assert.match(panel, /ProCare import progress/);
  assert.match(panel, /Upload and import complete/);
  assert.match(panel, /lastImportSummary/);
  assert.match(panel, /Post-import setup readiness/);
  assert.match(panel, /Open school setup/);
  assert.match(panel, /billing-settings\?view=setup/);
  assert.match(panel, /Import does not activate the school by itself/);
  assert.match(panel, /Parent invitations, kiosk\/PIN credentials, billing\/payment activation, and ProCare retirement stay held off/);
  assert.match(panel, /useRouter/);
  assert.match(panel, /router\.refresh\(\)/);
  assert.match(panel, /hasCompletedPreview/);
  assert.match(panel, /sourceSha256", preview\.sourceSha256/);
  assert.match(panel, /reviewFingerprint", preview\.reviewFingerprint/);
  assert.match(panel, /reviewWarningRowNumbers/);
  assert.match(panel, /reviewDuplicateWarningRowNumbers/);
  assert.match(panel, /warningRowNumbers \?\? \[\]\)\.join\(","\)/);
  assert.match(panel, /duplicateReviewRowNumbers \?\? \[\]\)\.join\(","\)/);
  assert.match(panel, /same selected files; they are still selected/);
  assert.match(panel, /chunkSize", "20"/);
  assert.match(panel, /Continuing the resumable import from row/);
  assert.match(panel, /Continuing automatically/);
  assert.match(panel, /\(completedRows \/ totalRows\) \* 85/);
  assert.doesNotMatch(panel, /onProgress\(60, true\)/);
  assert.match(panel, /submitLockedRef/);
  assert.match(panel, /selectedFileIdentity/);
  assert.match(route, /decodeProcareTabularBuffer/);
  assert.match(route, /resumableCandidates/);
  assert.match(route, /savedRowNumbers/);
  assert.match(route, /savedRow\.rowNumber === chunkStart \+ 1/);
  assert.match(route, /persistedRows < rows\.length - 1/);
  assert.doesNotMatch(route, /requestedChunkStart/);
  assert.match(route, /existingBatch && Array\.isArray\(existingSummary\.stagedRowNumbers\)/);
  assert.match(route, /partial: true/);
  assert.match(route, /resumable ProCare import batch/);
  assert.match(route, /This import page is out of date/);
  assert.match(panel, /request timed out before completing/);
  assert.match(route, /buildProcareMultiReportRows/);
});

test("ProCare multi-report rows distinguish guardians from pickup contacts and preserve separate allergies", async () => {
  const csv = (headers: string[], rows: string[][]) => Buffer.from([headers, ...rows].map((row) => row.join(",")).join("\n"));
  const files = new Map<string, Buffer>([
    ["enrollment.csv", csv(["Child ID", "First Name", "Last Name", "Enrollment Status", "Primary Classroom"], [["child-1", "Avery", "Rivera", "Enrolled", "Preschool"]])],
    ["parentinfo.csv", csv(["Person ID", "Account ID", "Person Type", "First Name", "Last Name", "Email", "Phone 1"], [["parent-1", "account-1", "Payer", "Jordan", "Rivera", "parent@example.test", "5551112222"]])],
    ["relationships.csv", csv(["Child ID", "Person ID", "Person Type", "First Name", "Last Name", "Relationship Type", "Lives With", "Emergency", "Authorized Pickup", "Email", "Phone 1", "Phone 2"], [
      ["child-1", "parent-1", "Relationship", "Jordan", "Rivera", "Mom", "Checked", "Checked", "Checked", "parent@example.test", "5551112222", ""],
      ["child-1", "friend-1", "Relationship", "Taylor", "Friend", "Family Friend", "", "Checked", "Checked", "", "5553334444", ""],
    ])],
    ["childinfo.csv", csv(["Child ID", "Category Description", "Item Is Active", "Item Description"], [
      ["child-1", "Allergies", "Checked", "Peanuts"],
      ["child-1", "Allergies", "Checked", "Tree nuts"],
    ])],
  ]);

  const [row] = await buildProcareMultiReportRowsFromFiles(files);
  const relationships = JSON.parse(row["procare relationship records"]) as Array<{ relation: string; guardian: boolean }>;
  assert.equal(relationships.find((relationship) => relationship.relation === "Mom")?.guardian, true);
  assert.equal(relationships.find((relationship) => relationship.relation === "Family Friend")?.guardian, false);
  assert.deepEqual(JSON.parse(row["procare allergy records"]), ["Peanuts", "Tree nuts"]);
});
