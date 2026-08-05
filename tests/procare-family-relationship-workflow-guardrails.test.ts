import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workflow = readFileSync(
  path.join(process.cwd(), "scripts", "reconcile-procare-family-relationships.ts"),
  "utf8",
);

test("relationship reconciliation is bound to reviewed school source pairs", () => {
  assert.match(workflow, /const REVIEWED_SOURCES =/);
  assert.match(workflow, /accountSha === reviewedSource\.accountSha/);
  assert.match(workflow, /relationshipSha === reviewedSource\.relationshipSha/);
  assert.match(workflow, /state\.center\.locationId === input\.locationId/);
});

test("incomplete exports and uncorroborated child identities remain held", () => {
  assert.match(workflow, /authoritativeForLiveReconciliation/);
  assert.match(workflow, /external_id_identity_corroboration_failed/);
  assert.match(workflow, /production_current_child_without_procare_provenance/);
  assert.match(workflow, /account_missing_active_source_child_in_production/);
  assert.match(workflow, /unsafeActiveCandidateAccountIds/);
  assert.match(workflow, /account_touched_by_ambiguous_active_source_child/);
  assert.match(workflow, /RELATIONSHIP_ACTIVE_STATUSES/);
  assert.match(workflow, /productionRelationshipInScope/);
});

test("child-scoped permission conflicts block their whole account", () => {
  assert.match(workflow, /account_held_for_child_scoped_relationship_conflict/);
  assert.match(workflow, /if \(Object\.keys\(accountHeld\)\.length\)[\s\S]*?continue;/);
});

test("the guarded workflow cannot move children or delete relationship records", () => {
  assert.match(workflow, /Child\/family identity mutations require a separate reviewed repair/);
  assert.match(workflow, /Relationship deletions require record-level reconciliation provenance/);
  assert.doesNotMatch(workflow, /tx\.child\.update/);
  assert.doesNotMatch(workflow, /tx\.(guardian|emergencyContact|authorizedPickup)\.delete/);
});

test("existing guardians receive fill-only contact enrichment", () => {
  assert.match(workflow, /missingProcareGuardianContactFields\(person, current\)/);
  assert.match(workflow, /contactEnrichmentOnly/);
  assert.doesNotMatch(workflow, /data\.(email|phone)\s*=\s*person\.(email|phone)/);
});

test("each account is compare-and-set revalidated inside its transaction", () => {
  assert.match(workflow, /freshCenter[\s\S]*?freshCenter\.status === "active"/);
  assert.match(workflow, /freshFamily && familyStateHash\(freshFamily\) === account\.expectedFamilyStateHash/);
  assert.match(workflow, /expectedFamilyStateHash: familyStateHash\(target\)/);
  assert.match(workflow, /TransactionIsolationLevel\.Serializable/);
});
