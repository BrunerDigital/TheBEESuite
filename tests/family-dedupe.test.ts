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

test("family duplicate scoring preserves spaced apostrophe variants", () => {
  const score = scoreFamilyDuplicate(
    {
      id: "family_1",
      centerId: "center_1",
      name: "O Connor Family",
      address: "123 Main Street",
    },
    {
      id: "family_2",
      centerId: "center_1",
      name: "O'Connor Family",
      address: "123 Main Street",
    },
  );

  assert.equal(score?.score, 35);
  assert.ok(score?.reasons.includes("same family name"));
  assert.ok(score?.reasons.includes("same address"));
});

test("family duplicate scoring preserves French spaced apostrophe variants", () => {
  const score = scoreFamilyDuplicate(
    {
      id: "family_1",
      centerId: "center_1",
      name: "L Heureux Family",
      address: "123 Main Street",
    },
    {
      id: "family_2",
      centerId: "center_1",
      name: "L'Heureux Family",
      address: "123 Main Street",
    },
  );

  assert.equal(score?.score, 35);
  assert.ok(score?.reasons.includes("same family name"));
  assert.ok(score?.reasons.includes("same address"));
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

test("child duplicate scoring preserves credential-like given names in ProCare formatting", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Ma Smith",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Smith, Ma",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring preserves credential-like given names after compound surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Ma De La Cruz",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "De La Cruz, Ma",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring preserves suffix-like given initials in ProCare formatting", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "V Smith",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Smith, V.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring preserves suffix-like initials after compound surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "V De La Cruz",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "De La Cruz, V.",
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

test("child duplicate scoring preserves V as a conventional generational suffix", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "John Smith, V",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith V",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring preserves dotted V as a conventional generational suffix", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "John Smith, V.",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith V",
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

test("child duplicate scoring recognizes suffixes between surname and given name", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Jr., John",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith Jr.",
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

test("child duplicate scoring canonicalizes spaced apostrophe variants", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Sean O Connor",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Sean O'Connor",
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

test("child duplicate scoring matches an abbreviated given name", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "A. Johnson",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Johnson",
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

test("guardian duplicate scoring strips credentials attached to last-first given names", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Alex RN",
      phone: "7205550118",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith",
      phone: "7205550118",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring strips last-first credentials before suffixes", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Alex RN, Jr.",
      phone: "7205550119",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith Jr.",
      phone: "7205550119",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring strips credentials after infix suffixes", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Jr., Alex RN",
      phone: "7205550121",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith Jr.",
      phone: "7205550121",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring strips credentials from compound-surname variants", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Garcia Marquez, Alex RN",
      phone: "7205550120",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Garcia Marquez",
      phone: "7205550120",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring ignores imported honorifics", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Dr. Alex Smith",
      phone: "7205550112",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith",
      phone: "7205550112",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
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

test("guardian duplicate scoring folds uppercase sharp S", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "ALEX GROẞ",
      phone: "7205550111",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Gross",
      phone: "7205550111",
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

test("guardian duplicate scoring strips grouped comma-separated credentials", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith, RN BSN",
      phone: "7205550115",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith",
      phone: "7205550115",
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

test("child duplicate scoring preserves all-caps credential-like surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "AVERY JAMES MA",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "AVERY JAMES PA",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score, null);
});

test("guardian duplicate scoring recognizes uppercase comma credentials", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith, MA",
      phone: "7205550113",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith",
      phone: "7205550113",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring strips credentials before generational suffixes", () => {
  const directScore = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith MD Jr.",
      phone: "7205550116",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith Jr.",
      phone: "7205550116",
      relation: "Parent",
    },
  );
  const commaScore = scoreGuardianDuplicate(
    {
      id: "guardian_3",
      familyId: "family_3",
      centerId: "center_1",
      fullName: "Alex Smith, MD, Jr.",
      phone: "7205550117",
      relation: "Parent",
    },
    {
      id: "guardian_4",
      familyId: "family_4",
      centerId: "center_1",
      fullName: "Alex Smith Jr.",
      phone: "7205550117",
      relation: "Parent",
    },
  );

  assert.equal(directScore?.confidence, "high");
  assert.equal(commaScore?.confidence, "high");
});

test("child duplicate scoring preserves credential-like surnames after middle names", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Avery James Ma",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Ma, Avery James",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring preserves compound surname particles", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz, Juan",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Juan Cruz",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score, null);
});

test("child duplicate scoring preserves unmarked compound surname boundaries", () => {
  const matchingScore = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Garcia Marquez, Avery",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery Garcia Marquez",
      dateOfBirth: "2022-10-10",
    },
  );
  const shortenedScore = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Garcia Marquez, Avery",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_3",
      familyId: "family_3",
      centerId: "center_1",
      fullName: "Avery Marquez",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(matchingScore?.confidence, "high");
  assert.equal(shortenedScore, null);
});

test("child duplicate scoring retains suffixes with compound surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Garcia Marquez, Avery Jr.",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery Garcia Marquez Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring canonicalizes omitted given-name hyphens", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Anne-Marie Smith",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "AnneMarie Smith",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring canonicalizes omitted surname hyphens in last-first names", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith-Jones, Avery",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery SmithJones",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring does not omit direct compound surname components", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Avery Garcia Marquez",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery Marquez",
      dateOfBirth: "2022-10-10",
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

test("guardian duplicate scoring preserves standalone O and D middle initials", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Jordan O Smith",
      phone: "7205550114",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Jordan Smith",
      phone: "7205550114",
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

test("child duplicate scoring treats a particle-like middle name as a middle name", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Jordan Van Smith",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Jordan V Smith",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring treats a particle-like middle name as a middle name", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Jordan Van Smith",
      phone: "7205550122",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Jordan V Smith",
      phone: "7205550122",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring preserves suffixes attached to last-first surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith Jr., John",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring preserves suffixes attached to last-first surnames", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith Jr., John",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring preserves dotted V middle initials in last-first names", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Mary V.",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Mary V Smith",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring preserves dotted V middle initials in last-first names", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Mary V.",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Mary V Smith",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring preserves suffixes on compound last-first surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz Jr., Juan",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Juan DeLaCruz Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring preserves suffixes on hyphenated last-first surnames", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith-Jones Jr., Avery",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery SmithJones Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring preserves dotted V middle initials with compound surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz, Juan V.",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Juan V DeLaCruz",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring preserves dotted V middles with suffixed compound surnames", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz Jr., Juan V.",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Juan V DeLaCruz Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring preserves uppercase credential-like given names with compound surnames", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "DE LA CRUZ, MA",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "MA DELACRUZ",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("child duplicate scoring collapses compound surnames before a final comma suffix", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz, Juan, Jr.",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Juan DeLaCruz Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring collapses hyphenated surnames before a final comma suffix", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith-Jones, Avery, Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Avery SmithJones Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring strips credentials before attached given-name suffixes", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, Alex RN Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring strips credentials before compound surname attached suffixes", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz, Alex RN Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex DeLaCruz Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring collapses compound surnames around an infix suffix", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz, Jr., Juan",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Juan DeLaCruz Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring strips credentials after a compound surname infix suffix", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "De La Cruz, Jr., Juan RN",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Juan DeLaCruz Jr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring preserves uppercase credential-like given names after compound surnames", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "DE LA CRUZ, MA",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "MA DELACRUZ",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("guardian duplicate scoring retains the credential interpretation of ambiguous uppercase names", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Alex Smith, MA",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Alex Smith",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring canonicalizes a spelled-out Junior suffix", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, John Junior",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring canonicalizes a spelled-out Senior suffix", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith, John Senior",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith Sr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});

test("child duplicate scoring does not collapse an arbitrary direct middle name into the surname", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "John Adam Smith",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Adamsmith",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score, null);
});

test("guardian duplicate scoring does not collapse an arbitrary direct middle name into the surname", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "John Adam Smith",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Adamsmith",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score, null);
});

test("guardian duplicate scoring rejects surname-only matches after stripping honorifics", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Mr. Smith",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "Mrs. Smith",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score, null);
});

test("child duplicate scoring does not collapse an unpunctuated first and middle name", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "John Adam Smith",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "JohnAdam Smith",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score, null);
});

test("guardian duplicate scoring does not collapse an unpunctuated first and middle name", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "John Adam Smith",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "JohnAdam Smith",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score, null);
});

test("child duplicate scoring canonicalizes a full-word suffix attached to a last-first surname", () => {
  const score = scoreChildDuplicate(
    {
      id: "child_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith Junior, John",
      dateOfBirth: "2022-10-10",
    },
    {
      id: "child_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith Jr.",
      dateOfBirth: "2022-10-10",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same child name and date of birth"));
});

test("guardian duplicate scoring canonicalizes a full-word suffix attached to a last-first surname", () => {
  const score = scoreGuardianDuplicate(
    {
      id: "guardian_1",
      familyId: "family_1",
      centerId: "center_1",
      fullName: "Smith Senior, John",
      phone: "7205550123",
      relation: "Parent",
    },
    {
      id: "guardian_2",
      familyId: "family_2",
      centerId: "center_1",
      fullName: "John Smith Sr.",
      phone: "7205550123",
      relation: "Parent",
    },
  );

  assert.equal(score?.confidence, "high");
  assert.ok(score?.reasons.includes("same guardian name"));
});
