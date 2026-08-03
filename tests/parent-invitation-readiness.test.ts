import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateParentInvitationReadiness,
  procareSourceFingerprintCollisionCenterIds,
  type ParentInvitationReadinessInput,
} from "@/lib/parent-invitation-readiness";

function readyInput(): ParentInvitationReadinessInput {
  return {
    guardian: {
      id: "guardian_1",
      familyId: "family_1",
      fullName: "Jordan Rivera",
      email: "parent@example.test",
      phone: "555-111-2222",
      sourceSystem: "procare",
      externalId: "person_1",
    },
    family: {
      id: "family_1",
      centerId: "center_1",
      sourceSystem: "procare",
      externalId: "account_1",
      children: [{
        id: "child_1",
        fullName: "Avery Rivera",
        enrollmentStatus: "enrolled",
        sourceSystem: "procare",
        externalId: "child_1",
      }],
    },
    matchingEmailGuardians: [],
    relevantImportBatch: {
      id: "batch_1",
      status: "completed",
      summary: {
        sourceType: "procare_multi_report_files",
        sourceInventoryConfirmed: true,
        errors: 0,
        unresolved: 0,
        warningRows: 0,
        disposed: 0,
        datasetCoverage: {
          reportDetection: {
            enrollment: { sourceFileCount: 1, sourceName: "enrollment.csv" },
            parentinfo: { sourceFileCount: 1, sourceName: "parentinfo.csv" },
            relationships: { sourceFileCount: 1, sourceName: "relationships.csv" },
            childinfo: { sourceFileCount: 1, sourceName: "childinfo.csv" },
          },
          sourceRows: { enrollment: 1, accountPeople: 1, relationships: 1, childInfo: 1 },
          warningCoverage: {
            enrollmentRowsWithoutChildIdentifier: 0,
            parentRowsWithoutAccountIdentifier: 0,
            relationshipRowsWithoutChildIdentifier: 0,
            childInfoRowsWithoutChildIdentifier: 0,
          },
        },
      },
    },
  };
}

test("complete ProCare family and four-report import passes invitation preflight", () => {
  const result = evaluateParentInvitationReadiness(readyInput());
  assert.deepEqual(result, { ok: true, blockers: [], importBatchId: "batch_1" });
});

test("reviewed rendered ProCare package passes with complete source evidence and excluded unresolved rows", () => {
  const input = readyInput();
  input.relevantImportBatch = {
    id: "batch-rendered",
    status: "completed",
    summary: {
      errors: 0,
      unresolved: 0,
      warningRows: 0,
      disposed: 0,
      sourceInventoryConfirmed: true,
      sourceType: "procare_rendered_report_files",
      importMethod: "guarded_rendered_package",
      reviewFingerprint: "reviewed-source-fingerprint",
      excludedUnresolvedRows: 2,
      datasetCoverage: {
        sourceRows: {
          accountChildren: 10,
          registrations: 11,
          enrollmentStatusNames: 12,
        },
        normalizedRows: {
          ready: 10,
          needsResolution: 2,
        },
        sourceInventory: [
          { reportKind: "rendered_account_information", rows: 10, matchedHeaderAliases: 7 },
          { reportKind: "rendered_enrollment_status", rows: 12, matchedHeaderAliases: 3 },
          { reportKind: "rendered_registration", rows: 11, matchedHeaderAliases: 9 },
        ],
        warningCoverage: {},
      },
    },
  };

  assert.equal(evaluateParentInvitationReadiness(input).ok, true);
});

test("rendered ProCare package fails closed when source evidence is incomplete", () => {
  const input = readyInput();
  input.relevantImportBatch = {
    id: "batch-rendered-incomplete",
    status: "completed",
    summary: {
      sourceInventoryConfirmed: true,
      sourceType: "procare_rendered_report_files",
      importMethod: "guarded_rendered_package",
      reviewFingerprint: "reviewed-source-fingerprint",
      excludedUnresolvedRows: 1,
      datasetCoverage: {
        sourceRows: { accountChildren: 10, registrations: 10 },
        normalizedRows: { ready: 10, needsResolution: 2 },
        sourceInventory: [
          { reportKind: "rendered_account_information", rows: 10, matchedHeaderAliases: 7 },
          { reportKind: "rendered_registration", rows: 10, matchedHeaderAliases: 9 },
        ],
        warningCoverage: {},
      },
    },
  };

  const result = evaluateParentInvitationReadiness(input);
  assert.equal(result.ok, false);
  assert.match(result.blockers.join(" "), /not fully reviewed|not all present/i);
});

test("incomplete or warning-bearing ProCare batches fail closed", () => {
  const input = readyInput();
  input.relevantImportBatch = {
    id: "batch_bad",
    status: "completed_with_errors",
    summary: {
      sourceType: "procare_rendered_report_files",
      sourceInventoryConfirmed: false,
      unresolved: 2,
      disposed: 1,
      datasetCoverage: {
        reportDetection: {},
        sourceRows: {},
        warningCoverage: { relationshipRowsWithoutChildIdentifier: 1 },
      },
    },
  };

  const result = evaluateParentInvitationReadiness(input);
  assert.equal(result.ok, false);
  assert.match(result.blockers.join(" "), /not complete and error-free/);
  assert.match(result.blockers.join(" "), /errors, unresolved warnings, or disposed/);
  assert.match(result.blockers.join(" "), /source-file inventory/);
  assert.match(result.blockers.join(" "), /not fully reviewed|not all present/);
  assert.match(result.blockers.join(" "), /relationship coverage warnings/);
});

test("conflicting guardian identities sharing an email are blocked", () => {
  const input = readyInput();
  input.matchingEmailGuardians = [{
    id: "guardian_2",
    familyId: "family_2",
    fullName: "Different Person",
    email: "PARENT@example.test",
    phone: "555-333-4444",
    sourceSystem: "procare",
    externalId: "person_2",
  }];

  const result = evaluateParentInvitationReadiness(input);
  assert.equal(result.ok, false);
  assert.match(result.blockers.join(" "), /conflicting identities/);
});

test("missing child, phone, and ProCare identities block before account or email changes", () => {
  const input = readyInput();
  input.guardian.phone = "12";
  input.guardian.externalId = null;
  input.family.children = [];

  const result = evaluateParentInvitationReadiness(input);
  assert.equal(result.ok, false);
  assert.match(result.blockers.join(" "), /phone number/);
  assert.match(result.blockers.join(" "), /no linked child/);
  assert.match(result.blockers.join(" "), /verified ProCare person ID/);
});

test("a ProCare family blocks when any active child lacks verified source identity", () => {
  const input = readyInput();
  input.family.children.push({
    id: "child_2",
    fullName: "Casey Rivera",
    enrollmentStatus: "enrolled",
    sourceSystem: null,
    externalId: null,
  });

  const result = evaluateParentInvitationReadiness(input);
  assert.equal(result.ok, false);
  assert.match(result.blockers.join(" "), /Every active child must retain a verified ProCare child ID/);
});

test("non-ProCare families still require safe parent contact and active child links", () => {
  const input = readyInput();
  input.guardian.sourceSystem = null;
  input.guardian.externalId = null;
  input.family.sourceSystem = null;
  input.family.externalId = null;
  input.family.children[0].sourceSystem = null;
  input.family.children[0].externalId = null;
  input.relevantImportBatch = null;

  const result = evaluateParentInvitationReadiness(input);
  assert.deepEqual(result, { ok: true, blockers: [], importBatchId: null });
});

test("separate schools cannot reuse the same ProCare source fingerprint", () => {
  const collisions = procareSourceFingerprintCollisionCenterIds([
    { id: "batch_1", centerId: "center_1", summary: { sourceSha256: "same-source" } },
    { id: "batch_2", centerId: "center_2", summary: { sourceSha256: "same-source" } },
    { id: "batch_3", centerId: "center_3", summary: { sourceSha256: "other-source" } },
  ]);
  assert.deepEqual(collisions, new Set(["center_1", "center_2"]));

  const oneBulkBatch = procareSourceFingerprintCollisionCenterIds([
    {
      id: "bulk_batch",
      centerId: "center_1",
      summary: { sourceSha256: "bulk-source", centerIdsTouched: ["center_1", "center_2"] },
    },
  ]);
  assert.deepEqual(oneBulkBatch, new Set());

  const repeatedBulkBatch = procareSourceFingerprintCollisionCenterIds([
    {
      id: "bulk_batch_1",
      centerId: "center_1",
      summary: { sourceSha256: "bulk-source", centerIdsTouched: ["center_1", "center_2"] },
    },
    {
      id: "bulk_batch_2",
      centerId: "center_1",
      summary: { sourceSha256: "bulk-source", centerIdsTouched: ["center_1", "center_2"] },
    },
  ]);
  assert.deepEqual(repeatedBulkBatch, new Set());
});
