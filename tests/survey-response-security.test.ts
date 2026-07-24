import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicSurveyResponsePayload } from "../src/lib/survey-responses";

test("public survey response payload never returns prior comments or respondent details", () => {
  const payload = publicSurveyResponsePayload({
    response: {
      id: "response_1",
      score: 9,
      submittedAt: "2026-07-24T12:00:00.000Z",
    },
    results: {
      responses: [
        {
          score: 2,
          comment: "private family complaint",
          respondentEmail: "private@example.com",
        },
      ],
      nps: {
        total: 4,
        promoters: 2,
        passives: 1,
        detractors: 1,
        score: 25,
      },
      lastResponseAt: "2026-07-24T12:00:00.000Z",
    },
  });

  assert.deepEqual(payload.response, {
    id: "response_1",
    score: 9,
    submittedAt: "2026-07-24T12:00:00.000Z",
  });
  assert.deepEqual(payload.results.nps, {
    total: 4,
    promoters: 2,
    passives: 1,
    detractors: 1,
    score: 25,
  });
  assert.doesNotMatch(JSON.stringify(payload), /private family complaint|private@example\.com/);
});

test("public survey submission is active-only, throttled, tenant-scoped, serialized, and audited atomically", () => {
  const source = readFileSync(
    new URL("../src/app/api/reputation/surveys/[id]/responses/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /await checkPersistentRateLimit\(/);
  assert.match(source, /survey\.status !== "active"/);
  assert.match(source, /organization:\s*\{\s*tenantId:\s*survey\.tenantId!/);
  assert.match(source, /family\?\.centerId/);
  assert.match(source, /id:\s*family\.centerId/);
  assert.match(source, /!familyCenter/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /await tx\.auditLog\.create\(/);
  assert.match(source, /publicSurveyResponsePayload\(outcome\)/);
  assert.doesNotMatch(source, /status:\s*\{\s*in:\s*\["active",\s*"draft"\]/);
});
