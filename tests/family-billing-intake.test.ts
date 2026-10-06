import assert from "node:assert/strict";
import test from "node:test";
import { usableProcareImportResponse } from "../src/lib/procare-import-response";
import { finalizeProcareMigrationReview, summarizeProcareMigrationReview } from "../src/lib/procare-migration-review";
import { makeStagedSourceManifest, signStagedSourceManifest, verifyStagedSourceManifest, validateStagedSourceFiles } from "../src/lib/procare-staged-source";
import { expandProcareSourceEntries } from "../src/lib/procare-multi-report-import";
import { buildProcareMigrationReviewRow } from "../src/lib/procare-migration-review";
import { MAX_PROCARE_STAGED_BYTES, MAX_PROCARE_STAGED_FILE_BYTES } from "../src/lib/procare-upload-limits";
const scope = { userId: "user-1", tenantId: "tenant-1", centerId: "school-1" };
const files = [{ name: "school-reports.zip", size: 4 * 1024 * 1024, sha256: "a".repeat(64) }];
const secret = "synthetic-test-secret";
const now = 1_790_000_000_000;

test("a successful HTTP status with malformed import data cannot be treated as success", () => {
  for (const body of [null, {}, { ok: true }, { ok: true, summary: "invalid" }, { ok: true, summary: { rows: 1 } }]) {
    assert.equal(usableProcareImportResponse(body, true), false);
    assert.equal(usableProcareImportResponse(body, false), false);
  }
  assert.equal(usableProcareImportResponse({ ok: true, batchId: "saved-batch", summary: { rows: 20, imported: 19, unresolved: 1 } }, false), true);
  assert.equal(usableProcareImportResponse({ ok: true, batchId: "saved-batch", partial: true, nextRow: -1, summary: { rows: 20, imported: 19, unresolved: 1 } }, false), false);
});

test("staged report receipt preserves integrity and is bound to user, tenant, school, and expiry", () => {
  const manifest = makeStagedSourceManifest(scope, files, now);
  const receipt = signStagedSourceManifest(manifest, secret);
  assert.deepEqual(verifyStagedSourceManifest(receipt, scope, secret, now), manifest);
  for (const alternate of [{ ...scope, userId: "other" }, { ...scope, tenantId: "other" }, { ...scope, centerId: "other" }]) {
    assert.throws(() => verifyStagedSourceManifest(receipt, alternate, secret, now), /different user or school/);
  }
  assert.throws(() => verifyStagedSourceManifest(receipt, scope, secret, manifest.expiresAt), /expired/);
  assert.throws(() => verifyStagedSourceManifest(receipt.slice(0, -3) + "bad", scope, secret, now), /verified/);
  assert.throws(() => signStagedSourceManifest(manifest, ""), /unavailable/);
});

test("signed receipts still reject malformed paths and repeated objects", () => {
  const manifest = makeStagedSourceManifest(scope, files, now);
  manifest.files[0].path = "school-imports/other-school/source.csv";
  assert.throws(() => verifyStagedSourceManifest(signStagedSourceManifest(manifest, secret), scope, secret, now), /scope/);
  const repeated = makeStagedSourceManifest(scope, files, now);
  repeated.files.push(repeated.files[0]);
  assert.throws(() => verifyStagedSourceManifest(signStagedSourceManifest(repeated, secret), scope, secret, now), /duplicate storage/);
});

test("large source validation enforces individual, aggregate, type, and byte identity limits", () => {
  assert.ok(files[0].size > 3.5 * 1024 * 1024);
  assert.equal(validateStagedSourceFiles(files).length, 1);
  assert.throws(() => validateStagedSourceFiles([{ ...files[0], size: MAX_PROCARE_STAGED_FILE_BYTES + 1 }]), /20 MB/);
  assert.throws(() => validateStagedSourceFiles(Array.from({ length: 3 }, () => ({ ...files[0], size: MAX_PROCARE_STAGED_FILE_BYTES }))), /50 MB/);
  assert.throws(() => validateStagedSourceFiles([{ ...files[0], sha256: "bad" }]), /integrity/);
  assert.throws(() => validateStagedSourceFiles([{ ...files[0], name: "program.exe" }]), /unchanged/);
  assert.equal(MAX_PROCARE_STAGED_BYTES, 50 * 1024 * 1024);
});

test("expanded source limit applies across the complete selection, not only each ZIP", async () => {
  const buffer = Buffer.alloc(51 * 1024 * 1024);
  await assert.rejects(expandProcareSourceEntries(new Map([["first.csv", buffer], ["second.csv", buffer]])), /100 MB/);
});

const row = (extra: Record<string, string>) => buildProcareMigrationReviewRow({
  "account id": "family-1", "child id": "child-1", "child status": "Enrolled", classroom: "Room 1",
  "guardian id": "person-1", balance: "0.00", "source description": "Approved child contract",
  "source effective date": "2026-10-01", ...extra,
}, 2)!;

test("monthly tuition remains monthly and is never converted to a weekly amount", () => {
  const monthly = row({ "monthly tuition cents": "120000", "source cadence": "monthly" });
  assert.equal(monthly.tuitionAmountCents, 120000);
  assert.equal(monthly.tuitionCadence, "monthly");
  assert.equal(monthly.tuitionReady, true);
  assert.equal(monthly.weeklyTuitionCents, null);
  assert.equal(monthly.weeklyTuitionReady, false);
  assert.deepEqual(monthly.blockers, []);
});

test("nonweekly source amounts require explicit cadence and valid dates", () => {
  for (const cadence of ["biweekly", "four_week", "monthly"]) assert.equal(row({ "tuition amount": "350.00", "source cadence": cadence }).tuitionReady, true);
  for (const frequency of ["", "daily", "quarterly", "unknown"]) assert.equal(row({ "tuition amount": "350.00", "source cadence": frequency }).tuitionReady, false);
  for (const date of ["2026-02-30", "tomorrow", "2026-W99"]) assert.equal(row({ "tuition amount": "350", "source cadence": "monthly", "source effective date": date }).tuitionReady, false);
  assert.equal(row({ "weekly tuition cents": "35000", "source cadence": "monthly" }).tuitionReady, false, "weekly-only evidence cannot silently become a monthly contract");
  assert.equal(row({ "tuition amount": "0", "source cadence": "weekly" }).tuitionReady, false);
  assert.equal(row({ "tuition amount": "350", "source cadence": "", "charge frequency": "monthly", "source effective date": "", "contract start date": "2026-10-01" }).tuitionReady, true);
});

test("conflicting sibling balances are held instead of selecting the last amount", () => {
  const first = row({ balance: "100", "source cadence": "weekly", "weekly tuition cents": "10000" });
  const second = { ...row({ balance: "200", "source cadence": "weekly", "weekly tuition cents": "10000" }), childId: "child-2" };
  const reviewed = finalizeProcareMigrationReview([first, second]);
  assert.ok(reviewed.every(record => record.blockers.some(blocker => blocker.includes("conflicting opening balances"))));
  assert.equal(summarizeProcareMigrationReview(reviewed).includedCurrentBalanceCents, 0);
});

test("matching source account IDs at different schools remain separate in a bulk review", () => {
  const reviewed = finalizeProcareMigrationReview([
    row({ school: "School A", balance: "100", "source cadence": "weekly", "weekly tuition cents": "10000" }),
    row({ school: "School B", balance: "200", "source cadence": "weekly", "weekly tuition cents": "10000" }),
  ]);
  assert.ok(reviewed.every(record => record.openingBalanceIncluded));
  assert.equal(summarizeProcareMigrationReview(reviewed).currentFamilyAccounts, 2);
  assert.equal(summarizeProcareMigrationReview(reviewed).includedCurrentBalanceCents, 30000);
});
