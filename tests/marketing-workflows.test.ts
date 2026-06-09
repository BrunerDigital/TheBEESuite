import assert from "node:assert/strict";
import { test } from "node:test";
import {
  campaignTemplateByKey,
  draftReviewResponse,
  normalizeCampaignDraft,
  npsSummary,
  updateSurveyResults,
} from "../src/lib/marketing-workflows";

test("campaign drafts inherit template defaults and schedule status", () => {
  const draft = normalizeCampaignDraft({
    templateKey: "tour_follow_up",
    audience: "Completed tours",
    scheduledAt: "2026-06-10T14:00:00.000Z",
  });

  assert.equal(draft.name, "Tour follow-up");
  assert.equal(draft.type, "email");
  assert.equal(draft.templateKey, "tour_follow_up");
  assert.equal(draft.subject, campaignTemplateByKey("tour_follow_up")?.subject);
  assert.deepEqual(draft.audience, { label: "Completed tours" });
  assert.equal(draft.status, "scheduled");
});

test("nps summary separates promoters passives and detractors", () => {
  assert.deepEqual(
    npsSummary([{ score: 10 }, { score: 9 }, { score: 8 }, { score: 6 }]),
    { total: 4, promoters: 2, passives: 1, detractors: 1, score: 25 },
  );
});

test("survey results append response rollups", () => {
  const results = updateSurveyResults(null, { score: 10, comment: "Great communication" });

  assert.equal((results.nps as { total: number }).total, 1);
  assert.equal((results.nps as { score: number }).score, 100);
  assert.equal(results.responses.length, 1);
  assert.equal(results.responses[0]?.comment, "Great communication");
});

test("review response drafts include human review guardrails", () => {
  const response = draftReviewResponse({ rating: 2, body: "Pickup communication was confusing.", source: "Google" });

  assert.match(response.draft, /leadership team/i);
  assert.match(response.guardrailNote, /human review/i);
});
