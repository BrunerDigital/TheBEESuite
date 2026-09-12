import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessSchoolDataSetup,
  emptySchoolDataReviewEvidence,
  normalizeSchoolDataSetupInput,
  readSchoolDataSetup,
  schoolDataImportVerificationRevision,
  type SchoolDataReviewEvidence,
  type SchoolDataSetup,
} from "../src/lib/school-data-setup";

function setup(overrides: Partial<SchoolDataSetup> = {}): SchoolDataSetup {
  return {
    version: 1,
    path: null,
    sourceSystem: null,
    noCurrentFamiliesExpected: false,
    notes: "",
    selectedAt: null,
    selectedByUserId: null,
    selectedByEmail: null,
    reviewConfirmation: null,
    ...overrides,
  };
}

function importReadyEvidence(overrides: Partial<SchoolDataReviewEvidence> = {}): SchoolDataReviewEvidence {
  const evidence: SchoolDataReviewEvidence = {
    ...emptySchoolDataReviewEvidence(),
    dataFingerprint: "school-data-fingerprint",
    importTargetFingerprint: "school-import-target-fingerprint",
    familyCount: 12,
    childCount: 18,
    guardianCount: 20,
    relevantFamilyCount: 12,
    relevantChildCount: 18,
    importBatchCount: 1,
    latestRecordUpdatedAt: "2026-09-11T12:00:00.000Z",
    latestImportBatch: {
      id: "batch_1",
      filename: "school-package.zip",
      status: "completed",
      createdAt: "2026-09-11T11:00:00.000Z",
      totalRows: 18,
      importedRows: 18,
      unresolvedRows: 0,
      disposedRows: 0,
      errorRows: 0,
      sourceSha256: "source-hash",
      reviewFingerprint: "review-fingerprint",
      sourceAdapter: "procare",
    },
    latestFleetVerification: {
      batchId: "batch_1",
      status: "READY_FOR_DIRECTOR_REVIEW",
      blockerCount: 0,
      createdAt: "2026-09-11T12:30:00.000Z",
      verificationRevision: null,
      targetDataFingerprint: "school-import-target-fingerprint",
    },
    ...overrides,
  };
  if (evidence.latestImportBatch && evidence.latestFleetVerification) {
    evidence.latestFleetVerification.verificationRevision = schoolDataImportVerificationRevision(evidence.latestImportBatch);
  }
  return evidence;
}

test("school data setup keeps import and clean-start inputs mutually exclusive", () => {
  assert.deepEqual(normalizeSchoolDataSetupInput({
    path: "import_existing",
    sourceSystem: "procare",
    noCurrentFamiliesExpected: true,
    notes: "  Use the full folder.  ",
  }), {
    path: "import_existing",
    sourceSystem: "procare",
    noCurrentFamiliesExpected: false,
    notes: "Use the full folder.",
  });

  assert.deepEqual(normalizeSchoolDataSetupInput({
    path: "start_clean",
    sourceSystem: "procare",
    noCurrentFamiliesExpected: true,
  }), {
    path: "start_clean",
    sourceSystem: null,
    noCurrentFamiliesExpected: true,
    notes: "",
  });
});

test("guarded imports require a complete batch and latest whole-school verification", () => {
  const selected = setup({ path: "import_existing", sourceSystem: "procare" });
  const noBatch = assessSchoolDataSetup(selected, emptySchoolDataReviewEvidence());
  assert.equal(noBatch.status, "needs_data");
  assert.equal(noBatch.canConfirm, false);

  const unresolved = assessSchoolDataSetup(selected, importReadyEvidence({
    latestImportBatch: {
      ...importReadyEvidence().latestImportBatch!,
      status: "completed_with_errors",
      unresolvedRows: 2,
    },
  }));
  assert.equal(unresolved.status, "needs_review");
  assert.match(unresolved.blockedReason ?? "", /unresolved source row/i);

  const unverified = assessSchoolDataSetup(selected, importReadyEvidence({ latestFleetVerification: null }));
  assert.equal(unverified.status, "needs_verification");

  const readyEvidence = importReadyEvidence();
  const ready = assessSchoolDataSetup(selected, readyEvidence);
  assert.equal(ready.status, "ready_to_confirm");
  assert.equal(ready.canConfirm, true);

  const changedTarget = assessSchoolDataSetup(selected, {
    ...readyEvidence,
    dataFingerprint: "changed-school-data-fingerprint",
    importTargetFingerprint: "changed-school-import-target-fingerprint",
  });
  assert.equal(changedTarget.status, "needs_verification");
  assert.equal(changedTarget.canConfirm, false);

  const evidencedExclusion = importReadyEvidence({
    latestImportBatch: {
      ...importReadyEvidence().latestImportBatch!,
      status: "completed_with_errors",
      importedRows: 17,
      disposedRows: 1,
      errorRows: 1,
    },
  });
  assert.equal(assessSchoolDataSetup(selected, evidencedExclusion).canConfirm, true);

  evidencedExclusion.latestImportBatch!.disposedRows = 2;
  evidencedExclusion.latestImportBatch!.errorRows = 2;
  const staleFleet = assessSchoolDataSetup(selected, evidencedExclusion);
  assert.equal(staleFleet.status, "needs_verification");
  assert.equal(staleFleet.canConfirm, false);
});

test("a non-ProCare source cannot inherit an older ProCare batch verification", () => {
  const selected = setup({ path: "import_existing", sourceSystem: "other" });
  const assessment = assessSchoolDataSetup(selected, importReadyEvidence());

  assert.equal(assessment.status, "needs_data");
  assert.equal(assessment.canConfirm, false);
  assert.match(assessment.blockedReason ?? "", /saved source system/i);
});

test("a reviewed BEE flat-file source uses the same guarded verification path", () => {
  const selected = setup({ path: "import_existing", sourceSystem: "other" });
  const evidence = importReadyEvidence({
    latestImportBatch: {
      ...importReadyEvidence().latestImportBatch!,
      sourceAdapter: "bee_flat_file_v1",
    },
  });
  evidence.latestFleetVerification!.verificationRevision = schoolDataImportVerificationRevision(evidence.latestImportBatch!);

  const assessment = assessSchoolDataSetup(selected, evidence);
  assert.equal(assessment.status, "ready_to_confirm");
  assert.equal(assessment.canConfirm, true);
});

test("data confirmation is bound to the current school evidence revision", () => {
  const evidence = importReadyEvidence();
  const selected = setup({ path: "import_existing", sourceSystem: "procare" });
  const ready = assessSchoolDataSetup(selected, evidence);
  const confirmed = setup({
    path: "import_existing",
    sourceSystem: "procare",
    reviewConfirmation: {
      revision: ready.revision,
      path: "import_existing",
      sourceSystem: "procare",
      noCurrentFamiliesExpected: false,
      confirmedAt: "2026-09-11T13:00:00.000Z",
      confirmedByUserId: "user_1",
      confirmedByEmail: "director@example.com",
      latestImportBatchId: "batch_1",
      familyCount: 12,
      childCount: 18,
      guardianCount: 20,
    },
  });

  assert.equal(assessSchoolDataSetup(confirmed, evidence).status, "confirmed");
  const changed = assessSchoolDataSetup(confirmed, { ...evidence, childCount: 19 });
  assert.equal(changed.status, "stale");
  assert.equal(changed.canConfirm, true);
});

test("clean-start schools can confirm an intentional empty roster without placeholders", () => {
  const emptyRoster = emptySchoolDataReviewEvidence();
  const notConfirmedEmpty = assessSchoolDataSetup(setup({ path: "start_clean" }), emptyRoster);
  assert.equal(notConfirmedEmpty.status, "needs_data");

  const intentionalEmpty = assessSchoolDataSetup(setup({
    path: "start_clean",
    noCurrentFamiliesExpected: true,
  }), emptyRoster);
  assert.equal(intentionalEmpty.status, "ready_to_confirm");
  assert.equal(intentionalEmpty.canConfirm, true);
  assert.match(intentionalEmpty.detail, /placeholder/i);
});

test("clean-start confirmation blocks incomplete household relationships", () => {
  const assessment = assessSchoolDataSetup(setup({ path: "start_clean" }), {
    ...emptySchoolDataReviewEvidence(),
    familyCount: 2,
    childCount: 2,
    guardianCount: 1,
    relevantFamilyCount: 2,
    relevantChildCount: 2,
    familiesMissingGuardianCount: 1,
    childrenMissingClassroomCount: 1,
  });
  assert.equal(assessment.status, "needs_review");
  assert.equal(assessment.canConfirm, false);
  assert.match(assessment.blockedReason ?? "", /clean-start record gaps/i);
});

test("clean-start confirmation blocks orphan families and unrecognized enrollment states", () => {
  const orphanFamily = assessSchoolDataSetup(setup({ path: "start_clean" }), {
    ...emptySchoolDataReviewEvidence(),
    familiesMissingChildCount: 1,
  });
  assert.equal(orphanFamily.status, "needs_review");
  assert.equal(orphanFamily.canConfirm, false);
  assert.match(orphanFamily.blockedReason ?? "", /child relationship/i);

  const unknownEnrollment = assessSchoolDataSetup(setup({ path: "start_clean" }), {
    ...emptySchoolDataReviewEvidence(),
    childrenNeedingEnrollmentStatusReviewCount: 1,
  });
  assert.equal(unknownEnrollment.status, "needs_review");
  assert.equal(unknownEnrollment.canConfirm, false);
  assert.match(unknownEnrollment.blockedReason ?? "", /recognized current, pipeline, break, or closed/i);
});

test("clean-start review includes prospective families, schedules, and emergency contacts", () => {
  const assessment = assessSchoolDataSetup(setup({ path: "start_clean" }), {
    ...emptySchoolDataReviewEvidence(),
    guardianCount: 1,
    relevantFamilyCount: 1,
    relevantChildCount: 1,
    prospectiveFamilyCount: 1,
    prospectiveChildCount: 1,
    childrenMissingScheduleCount: 1,
    familiesMissingEmergencyContactCount: 1,
  });

  assert.equal(assessment.status, "needs_review");
  assert.match(assessment.detail, /emergency contacts, schedules/i);
});

test("an active school preserves its approved launch baseline and reports changed domains", () => {
  const evidence = importReadyEvidence({
    centerStatus: "active",
    domainMetrics: { totalFamilies: 12, totalChildren: 18, guardians: 20 },
  });
  const selected = setup({ path: "import_existing", sourceSystem: "procare" });
  const ready = assessSchoolDataSetup(selected, evidence);
  const confirmed = setup({
    path: "import_existing",
    sourceSystem: "procare",
    reviewConfirmation: {
      revision: ready.revision,
      path: "import_existing",
      sourceSystem: "procare",
      noCurrentFamiliesExpected: false,
      confirmedAt: "2026-09-11T13:00:00.000Z",
      confirmedByUserId: "user_1",
      confirmedByEmail: "director@example.com",
      latestImportBatchId: "batch_1",
      familyCount: 12,
      childCount: 18,
      guardianCount: 20,
      relevantFamilyCount: 12,
      relevantChildCount: 18,
      domainFingerprints: { ...evidence.domainFingerprints, roster: "approved-roster" },
      domainMetrics: { totalFamilies: 11, totalChildren: 18, guardians: 20 },
    },
  });

  const assessment = assessSchoolDataSetup(confirmed, {
    ...evidence,
    domainFingerprints: { ...evidence.domainFingerprints, roster: "current-roster" },
  });
  assert.equal(assessment.status, "confirmed");
  assert.equal(assessment.baselineFrozen, true);
  assert.equal(assessment.changedSinceConfirmation, true);
  assert.deepEqual(assessment.changedDomains, ["family, child, or guardian records"]);
  assert.deepEqual(assessment.changeDeltas, ["All family records: +1 (11 to 12)"]);
});

test("a replacement import invalidates an active school's frozen launch baseline", () => {
  const originalEvidence = importReadyEvidence({ centerStatus: "active" });
  const selected = setup({ path: "import_existing", sourceSystem: "procare" });
  const ready = assessSchoolDataSetup(selected, originalEvidence);
  const confirmed = setup({
    path: "import_existing",
    sourceSystem: "procare",
    reviewConfirmation: {
      revision: ready.revision,
      path: "import_existing",
      sourceSystem: "procare",
      noCurrentFamiliesExpected: false,
      confirmedAt: "2026-09-11T13:00:00.000Z",
      confirmedByUserId: "user_1",
      confirmedByEmail: "director@example.com",
      latestImportBatchId: "batch_1",
      familyCount: 12,
      childCount: 18,
      guardianCount: 20,
    },
  });
  const replacementEvidence = importReadyEvidence({
    centerStatus: "active",
    latestImportBatch: {
      ...originalEvidence.latestImportBatch!,
      id: "batch_2",
      sourceSha256: "replacement-source-hash",
      reviewFingerprint: "replacement-review-fingerprint",
    },
    latestFleetVerification: {
      ...originalEvidence.latestFleetVerification!,
      batchId: "batch_2",
      verificationRevision: null,
    },
  });

  const assessment = assessSchoolDataSetup(confirmed, replacementEvidence);
  assert.equal(assessment.status, "stale");
  assert.equal(assessment.baselineFrozen, false);
  assert.equal(assessment.canConfirm, true);
});

test("stored school data setup rejects invalid paths and incomplete confirmations", () => {
  const stored = readSchoolDataSetup({
    schoolDataSetup: {
      path: "unsupported",
      sourceSystem: "procare",
      noCurrentFamiliesExpected: true,
      reviewConfirmation: { revision: "missing required fields" },
    },
  });
  assert.equal(stored.path, null);
  assert.equal(stored.sourceSystem, null);
  assert.equal(stored.noCurrentFamiliesExpected, false);
  assert.equal(stored.reviewConfirmation, null);
});
