import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/reconcile-pisgah-hannah-staff.ts", "utf8");

test("Pisgah Hannah staff creation keeps the parent and employee identities distinct", () => {
  assert.match(source, /parentEmail: "hannahlane1794@gmail\.com"/);
  assert.match(source, /staffEmail: "hannahlane1974@gmail\.com"/);
  assert.match(source, /String\(EXPECTED\.staffEmail\) !== String\(EXPECTED\.parentEmail\)/);
  assert.match(source, /parentIdentityChanged: false/);
  assert.match(source, /familyAssociationChanged: false/);
});

test("Pisgah Hannah staff creation is exact, fingerprinted, and audit preserving", () => {
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /operations\.staff\.created_from_director_confirmation/);
  assert.match(source, /evidenceMessageId: "1a03e698dd69682f"/);
  assert.match(source, /employmentStartDate: "2026-08-24"/);
  assert.match(source, /title: "Assistant Teacher\/Floater"/);
  assert.match(source, /classroomId: null/);
});

test("Pisgah Hannah staff creation does not send an invitation or change billing", () => {
  assert.doesNotMatch(source, /sendParentPortalInvitation|sendEmail\(/);
  assert.match(source, /invitationSent: false/);
  assert.match(source, /tuitionChanged: false/);
  assert.match(source, /billingChanged: false/);
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /updateExistingPassword: false/);
});
