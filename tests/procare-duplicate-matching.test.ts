import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProcareDuplicateMatch,
  normalizeProcareDuplicatePhone,
  scoreProcareDuplicateCandidate,
} from "@/lib/procare-duplicate-matching";

test("scores a high-confidence family match from ProCare import data", () => {
  const candidate = scoreProcareDuplicateCandidate(
    {
      entity: "family",
      externalId: "A-100",
      name: "Johnson Family",
      email: "Parent@Example.com",
      phone: "(555) 111-2222",
      childName: "Riley Johnson",
      dateOfBirth: "2022-03-01",
      guardianName: "Alex Johnson",
    },
    {
      entity: "family",
      recordId: "family_1",
      label: "Johnson Family",
      externalId: "a 100",
      name: "Johnson Family",
      email: "unused@example.com",
      guardianEmails: ["parent@example.com"],
      guardianPhones: ["5551112222"],
      childNames: ["Riley Johnson"],
      childDatesOfBirth: [new Date("2022-03-01T12:00:00.000Z")],
    },
  );

  assert.equal(candidate?.confidence, "high");
  assert.ok(candidate?.reasons.includes("same ProCare ID"));
  assert.ok(candidate?.reasons.includes("matching child date of birth"));
});

test("marks duplicate matches as needing review when no single high-confidence candidate exists", () => {
  const candidates = [
    scoreProcareDuplicateCandidate(
      { entity: "guardian", name: "Alex Johnson", email: "alex@example.com", phone: "(555) 222-3333", relation: "Mother" },
      { entity: "guardian", recordId: "guardian_1", label: "Alex Johnson", name: "Alex Johnson", phone: "5552223333", relation: "Mother" },
    ),
    scoreProcareDuplicateCandidate(
      { entity: "guardian", name: "Alex Johnson", email: "alex@example.com", phone: "(555) 222-3333", relation: "Mother" },
      { entity: "guardian", recordId: "guardian_2", label: "A. Johnson", email: "alex@example.com" },
    ),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  const match = buildProcareDuplicateMatch({
    rowNumber: 4,
    entity: "guardian",
    importLabel: "Alex Johnson",
    candidates,
  });

  assert.equal(match.resolution, "needs_review");
  assert.equal(match.recommendedRecordId, null);
  assert.deepEqual(match.candidates.map((candidate) => candidate.recordId), ["guardian_2", "guardian_1"]);
});

test("normalizes phone numbers before scoring duplicate guardians", () => {
  const candidate = scoreProcareDuplicateCandidate(
    { entity: "guardian", name: "Jamie Smith", phone: "+1 (941) 555-1212" },
    { entity: "guardian", recordId: "guardian_1", label: "Jamie Smith", name: "Jamie Smith", phone: "941.555.1212" },
  );

  assert.equal(normalizeProcareDuplicatePhone("+1 (941) 555-1212"), "9415551212");
  assert.equal(candidate?.confidence, "medium");
  assert.ok(candidate?.reasons.includes("same phone"));
});
