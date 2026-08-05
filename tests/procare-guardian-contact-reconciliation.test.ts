import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workflow = readFileSync(path.join(process.cwd(), "scripts", "reconcile-procare-guardian-contacts.ts"), "utf8");

test("guardian contact repair is bound to reviewed school files and exact center identities", () => {
  assert.match(workflow, /const REVIEWED_SOURCES =/);
  assert.match(workflow, /sha256\(sourceBuffer\) === reviewed\.sourceSha/);
  assert.match(workflow, /sha256\(relationshipBuffer\) === reviewed\.relationshipSha/);
  assert.match(workflow, /state\.center\.locationId === input\.reviewed\.locationId/);
  assert.match(workflow, /state\.center\.status === "active"/);
});

test("guardian contact repair only fills missing contact and relationship fields", () => {
  assert.match(workflow, /missingProcareGuardianContactFields\(contact, guardian\)/);
  assert.match(workflow, /!\/\^\(unknown\|guardian\)\$\/i\.test\(sourceRelation\)/);
  assert.match(workflow, /existing_phone_preserved/);
  assert.match(workflow, /existing_email_preserved/);
  assert.doesNotMatch(workflow, /preferredCommunication/);
  assert.doesNotMatch(workflow, /isBillingContact/);
  assert.doesNotMatch(workflow, /tx\.(family|user|parentPortalSetupToken|integrationDelivery)\.(update|create|delete)/);
});

test("flat and rendered sources require direct account and guardian evidence", () => {
  assert.match(workflow, /normalizedId\(guardian\.externalId\) === normalizedId\(contact\.personId\)/);
  assert.match(workflow, /guardian\.sourceSystem === "procare" && normalizedName\(guardian\.fullName\) === normalizedName\(contact\.fullName\)/);
  assert.match(workflow, /source_account_matches_multiple_families/);
  assert.match(workflow, /source_person_id_name_conflict/);
});

test("each guardian is compare-and-set revalidated and protected boundaries must remain unchanged", () => {
  assert.match(workflow, /guardianStateHash\(freshGuardian\) === item\.expectedStateHash/);
  assert.match(workflow, /TransactionIsolationLevel\.Serializable/);
  assert.match(workflow, /stableJson\(before\) === stableJson\(after\)/);
  assert.match(workflow, /verification\.summary\.totalOperations === 0/);
});
