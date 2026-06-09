import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findChildDuplicateCandidates,
  findFamilyDuplicateCandidates,
  findGuardianDuplicateCandidates,
  scoreChildDuplicate,
  scoreFamilyDuplicate,
  scoreGuardianDuplicate,
} from "@/lib/family-dedupe";

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

test("child duplicate scoring matches same-school child profiles by name and date of birth", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Riley Johnson",
      preferredName: "Riley",
      dateOfBirth: "2022-03-01",
      ageGroup: "Toddler",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Riley Johnson",
      preferredName: "Riley",
      dateOfBirth: new Date("2022-03-01T12:00:00.000Z"),
      ageGroup: "Toddler",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate candidates stay inside the same school and sort by score", () => {
  const candidates = findChildDuplicateCandidates(
    [
      { id: "child_1", familyId: "family_1", centerId: "center_1", fullName: "Riley Johnson", dateOfBirth: "2022-03-01" },
      { id: "child_2", familyId: "family_2", centerId: "center_1", fullName: "Riley Johnson", dateOfBirth: "2022-03-01" },
      { id: "child_3", familyId: "family_3", centerId: "center_2", fullName: "Riley Johnson", dateOfBirth: "2022-03-01" },
      { id: "child_4", familyId: "family_4", centerId: "center_1", fullName: "Riley Johnson", dateOfBirth: "2021-08-01" },
    ],
    "child_1",
  );

  assert.deepEqual(candidates.map((candidate) => candidate.candidateId), ["child_2", "child_4"]);
});

test("guardian duplicate scoring matches email and phone across same-school families", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Johnson",
      email: "Alex@Example.com",
      phone: "(555) 111-2222",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Johnson",
      email: "alex@example.com",
      phone: "5551112222",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian email"));
  assert.ok(score?.reasons.includes("same guardian phone"));
});

test("guardian duplicate candidates stay inside the same school and sort by score", () => {
  const candidates = findGuardianDuplicateCandidates(
    [
      { id: "guardian_1", familyId: "family_1", centerId: "center_1", fullName: "Alex Johnson", email: "alex@example.com" },
      { id: "guardian_2", familyId: "family_2", centerId: "center_1", fullName: "Alex Johnson", email: "alex@example.com" },
      { id: "guardian_3", familyId: "family_3", centerId: "center_1", phone: "5551112222" },
      { id: "guardian_4", familyId: "family_4", centerId: "center_2", fullName: "Alex Johnson", email: "alex@example.com" },
    ],
    "guardian_1",
  );

  assert.deepEqual(candidates.map((candidate) => candidate.candidateId), ["guardian_2"]);
});
