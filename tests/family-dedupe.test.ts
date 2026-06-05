import assert from "node:assert/strict";
import { test } from "node:test";
import { findFamilyDuplicateCandidates, scoreFamilyDuplicate } from "@/lib/family-dedupe";

test("family duplicate scoring finds strong matches inside the same center", () => {
  const score = scoreFamilyDuplicate(
    {
      id: "family_1",
      centerId: "center_1",
      name: "Johnson Family",
      billingEmail: "Parent@Example.com",
      guardians: [{ fullName: "Alex Johnson", email: "alex@example.com", phone: "(555) 111-2222" }],
      children: [{ fullName: "Riley Johnson", dateOfBirth: "2022-03-01" }],
    },
    {
      id: "family_2",
      centerId: "center_1",
      name: "Johnson Family",
      billingEmail: "parent@example.com",
      guardians: [{ fullName: "A. Johnson", email: "alex@example.com", phone: "5551112222" }],
      children: [{ fullName: "Riley Johnson", dateOfBirth: new Date("2022-03-01T12:00:00.000Z") }],
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same billing email"));
  assert.ok(score?.reasons.includes("matching child name and date of birth"));
});

test("family duplicate scoring does not cross center boundaries", () => {
  const score = scoreFamilyDuplicate(
    { id: "family_1", centerId: "center_1", billingEmail: "parent@example.com" },
    { id: "family_2", centerId: "center_2", billingEmail: "parent@example.com" },
  );

  assert.equal(score, null);
});

test("family duplicate candidates are sorted by score", () => {
  const candidates = findFamilyDuplicateCandidates(
    [
      { id: "family_1", centerId: "center_1", billingEmail: "parent@example.com", guardians: [{ phone: "5551112222" }] },
      { id: "family_2", centerId: "center_1", billingEmail: "parent@example.com" },
      { id: "family_3", centerId: "center_1", guardians: [{ phone: "(555) 111-2222" }] },
    ],
    "family_1",
  );

  assert.deepEqual(candidates.map((candidate) => candidate.candidateId), ["family_2", "family_3"]);
});
