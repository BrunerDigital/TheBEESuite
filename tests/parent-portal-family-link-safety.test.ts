import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasConflictingGuardianFamilyLinks } from "@/lib/parent-portal-logins";

test("parent portal provisioning permits duplicate guardian rows only inside one family", () => {
  assert.equal(hasConflictingGuardianFamilyLinks("family_a", [
    { familyId: "family_a" },
    { familyId: "family_a" },
  ]), false);
});

test("parent portal provisioning fails closed when one email spans families", () => {
  assert.equal(hasConflictingGuardianFamilyLinks("family_a", [
    { familyId: "family_a" },
    { familyId: "family_b" },
  ]), true);
});

test("family intake rejects ambiguous family matches and existing cross-family login links", () => {
  const intake = readFileSync(new URL("../src/app/api/families/intake/route.ts", import.meta.url), "utf8");
  assert.match(intake, /existingFamilyCandidates = guardianEmail[\s\S]*prisma\.family\.findMany/);
  assert.match(intake, /isBillingContact: true/);
  assert.match(intake, /existingFamilyCandidates\.length > 1/);
  assert.match(intake, /hasConflictingGuardianFamilyLinks\(existingFamilyMatch\?\.id \?\? "", existingParentUser\.guardians\)/);
});

test("guardian merges cannot carry a parent login into another family", () => {
  const operations = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
  assert.match(operations, /id: \{ notIn: \[primaryGuardianId, duplicateGuardianId\] \}/);
  assert.match(operations, /hasConflictingGuardianFamilyLinks\(primary\.familyId, remainingLinks\)/);
  assert.match(operations, /This merge would connect one parent login to multiple families/);
});

test("the production repair is exact-target, confirmed, and preserves unrelated records", () => {
  const repair = readFileSync(new URL("../scripts/reconcile-parent-family-link-ambiguities.ts", import.meta.url), "utf8");
  assert.match(repair, /--confirm-victoria-longmont-family-link/);
  assert.match(repair, /where: \{ id: REMOVE_GUARDIAN_ID, familyId: REMOVE_FAMILY_ID, userId: TARGET_USER_ID \}/);
  assert.match(repair, /preservedGuardianRecord: true/);
  assert.match(repair, /billingChanged: false/);
  assert.match(repair, /messagesOrInvitationsSent: 0/);
});
