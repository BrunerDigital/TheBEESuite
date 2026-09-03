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

test("child duplicate scoring ignores siblings and placeholder records that only share dates or programs", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Finn Mahoney",
      preferredName: "Finn",
      dateOfBirth: "2022-10-10",
      ageGroup: "Fireflies",
    },
    {
      id: "child_2",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Mason Mahoney",
      preferredName: "Mason",
      dateOfBirth: "2022-10-10",
      ageGroup: "Fireflies",
    },
  );

  assert.equal(score, null);
});

test("child duplicate scoring recognizes ProCare last-first formatting", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Avery Smith",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Smith, Avery",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring preserves conventional suffix position", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Avery Smith, Jr.",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery Smith Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring allows optional ProCare middle names", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Avery J Rivera",
      preferredName: "Avery",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery Rivera",
      preferredName: "Avery",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring extracts a suffix attached to a ProCare given name", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Avery Jr.",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery Smith Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring canonicalizes omitted apostrophes", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Sean O'Connor",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Sean OConnor",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring preserves exact non-Latin names", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "李美玲",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "李美玲",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
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

test("guardian duplicate scoring recognizes ProCare last-first formatting", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Samantha Robbins",
      phone: "7209998260",
      relation: "Mom",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Robbins, Samantha",
      phone: "Cell 720 9998260",
      relation: "Mom",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
  assert.ok(score?.reasons.includes("same guardian phone"));
});

test("guardian duplicate scoring ignores distinct co-parents who share a household phone", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Brian Thompson",
      email: "brian@example.com",
      phone: "5053281322",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alexa Thompson",
      email: "alexa@example.com",
      phone: "5053281322",
      relation: "Parent",
    },
  );

  assert.equal(score, null);
});

test("guardian duplicate scoring folds name diacritics", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "José García",
      phone: "7205550101",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Jose Garcia",
      phone: "7205550101",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring preserves exact non-Latin names", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "王小明",
      phone: "7205550109",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "王小明",
      phone: "7205550109",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring transliterates stroked Latin letters", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Søren Jørgensen",
      phone: "7205550106",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Soren Jorgensen",
      phone: "7205550106",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring canonicalizes dotted credentials", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith, M.D.",
      phone: "7205550102",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith MD",
      phone: "7205550102",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring canonicalizes dotted credentials without commas", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith M.D.",
      phone: "7205550103",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith MD",
      phone: "7205550103",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring canonicalizes lowercase credentials without commas", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith rn",
      phone: "7205550110",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith, RN",
      phone: "7205550110",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring ignores common professional credentials", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith, RN, BSN",
      phone: "7205550107",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith RN",
      phone: "7205550107",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring preserves credential-like surnames", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Ma",
      phone: "7205550108",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Pa",
      phone: "7205550108",
      relation: "Parent",
    },
  );

  assert.equal(score, null);
});

test("guardian duplicate scoring allows optional ProCare middle names", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Jordan M Rivera",
      phone: "7205550104",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Jordan Rivera",
      phone: "7205550104",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring matches a middle initial to its full name", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Jordan M Rivera",
      phone: "7205550105",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Jordan Michael Rivera",
      phone: "7205550105",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});
