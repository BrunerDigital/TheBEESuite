import assert from "node:assert/strict";
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
