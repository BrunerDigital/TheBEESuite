export type CampaignTemplate = {
  key: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  audienceLabel: string;
};

export const campaignTemplates: CampaignTemplate[] = [
  {
    key: "inquiry_nurture",
    name: "Inquiry nurture",
    type: "nurture",
    subject: "Next steps with {{center.name}}",
    body: "Hi {{guardian.firstName}},\n\nThank you for your interest in {{center.name}}. We would be happy to answer questions, confirm availability, or help schedule your next step.\n\nThe {{center.name}} team",
    audienceLabel: "Open inquiries",
  },
  {
    key: "tour_follow_up",
    name: "Tour follow-up",
    type: "email",
    subject: "Thanks for visiting {{center.name}}",
    body: "Hi {{guardian.firstName}},\n\nThank you for touring {{center.name}}. We would love to support your family's next steps and answer any questions about classrooms, tuition, or start dates.",
    audienceLabel: "Tour completed",
  },
  {
    key: "waitlist_update",
    name: "Waitlist update",
    type: "newsletter",
    subject: "Waitlist update from {{center.name}}",
    body: "Hi {{guardian.firstName}},\n\nWe are sending a quick waitlist update from {{center.name}}. Our team will continue to keep your family posted as availability changes.",
    audienceLabel: "Waitlisted families",
  },
  {
    key: "review_request",
    name: "Review request",
    type: "review_request",
    subject: "How was your experience with {{center.name}}?",
    body: "Hi {{guardian.firstName}},\n\nIf your family has had a positive experience with {{center.name}}, would you take a moment to share feedback? Your review helps other families learn about our school.",
    audienceLabel: "Active enrolled families",
  },
  {
    key: "nps_survey",
    name: "NPS survey",
    type: "survey",
    subject: "Quick family feedback for {{center.name}}",
    body: "Hi {{guardian.firstName}},\n\nWe are collecting a quick family feedback score for {{center.name}}. Your response helps the director improve communication, classrooms, and family support.",
    audienceLabel: "Active families",
  },
];

export type CampaignDraftInput = {
  name?: unknown;
  type?: unknown;
  templateKey?: unknown;
  subject?: unknown;
  body?: unknown;
  audience?: unknown;
  status?: unknown;
  scheduledAt?: unknown;
};

export type CampaignDraft = {
  name: string;
  type: string;
  templateKey: string | null;
  subject: string | null;
  body: string | null;
  audience: Record<string, unknown> | null;
  status: string;
  scheduledAt: Date | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeStatus(value: unknown, fallback = "draft") {
  const normalized = clean(value).toLowerCase();
  return ["draft", "active", "paused", "scheduled", "sent", "archived"].includes(normalized) ? normalized : fallback;
}

export function campaignTemplateByKey(key: unknown) {
  const normalized = clean(key);
  return campaignTemplates.find((template) => template.key === normalized) ?? null;
}

export function normalizeCampaignDraft(input: CampaignDraftInput): CampaignDraft {
  const template = campaignTemplateByKey(input.templateKey);
  const name = clean(input.name) || template?.name || "Untitled campaign";
  const subject = clean(input.subject) || template?.subject || null;
  const body = clean(input.body) || template?.body || null;
  const audienceLabel = clean(input.audience) || template?.audienceLabel || "";
  const scheduledAt = parseDate(input.scheduledAt);

  return {
    name: name.slice(0, 160),
    type: (clean(input.type) || template?.type || "email").slice(0, 80),
    templateKey: template?.key ?? null,
    subject: subject?.slice(0, 200) ?? null,
    body: body?.slice(0, 8_000) ?? null,
    audience: audienceLabel ? { label: audienceLabel } : null,
    status: scheduledAt ? "scheduled" : safeStatus(input.status),
    scheduledAt,
  };
}

export function npsBucket(score: number) {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export function npsSummary(responses: Array<{ score: number }>) {
  const total = responses.length;
  const promoters = responses.filter((response) => npsBucket(response.score) === "promoter").length;
  const passives = responses.filter((response) => npsBucket(response.score) === "passive").length;
  const detractors = responses.filter((response) => npsBucket(response.score) === "detractor").length;
  const score = total ? Math.round(((promoters - detractors) / total) * 100) : 0;
  return { total, promoters, passives, detractors, score };
}

export function updateSurveyResults(existing: unknown, response: { score: number; comment?: string | null }) {
  const current = asRecord(existing);
  const responses = Array.isArray(current.responses) ? current.responses : [];
  const nextResponses = [
    ...responses.slice(-199),
    {
      score: response.score,
      bucket: npsBucket(response.score),
      comment: clean(response.comment).slice(0, 1_000) || null,
      submittedAt: new Date().toISOString(),
    },
  ];
  const summary = npsSummary(nextResponses.map((item) => ({ score: Number(asRecord(item).score) || 0 })));
  return {
    ...current,
    responses: nextResponses,
    nps: summary,
    lastResponseAt: nextResponses[nextResponses.length - 1]?.submittedAt ?? null,
  };
}

export function buildReviewRequestCopy(input: { centerName?: string | null; reviewUrl?: string | null }) {
  const centerName = clean(input.centerName) || "our school";
  const reviewUrl = clean(input.reviewUrl);
  return [
    `Hi there,`,
    "",
    `If your family has had a positive experience with ${centerName}, would you take a moment to share a review? Your feedback helps other families learn about the school and helps our team celebrate what is working.`,
    reviewUrl ? "" : "",
    reviewUrl || "",
    "",
    `Thank you,`,
    `${centerName}`,
  ].filter((line, index, lines) => line || lines[index - 1] !== "").join("\n");
}

export function draftReviewResponse(input: { rating: number; body?: string | null; source?: string | null }) {
  const source = clean(input.source) || "review";
  const body = clean(input.body);
  const positive = input.rating >= 4;
  const neutral = input.rating === 3;
  const opening = positive
    ? "Thank you for sharing this thoughtful feedback."
    : neutral
      ? "Thank you for taking the time to share this feedback."
      : "Thank you for bringing this to our attention.";
  const acknowledgment = body
    ? "We appreciate the specific details you shared and will make sure the appropriate school leader reviews them."
    : "We appreciate the opportunity to learn from your family's experience.";
  const followUp = positive
    ? "Our team is grateful for the trust families place in us each day."
    : "A member of our leadership team can follow up directly so we can better understand and address your concerns.";

  return {
    draft: `${opening} ${acknowledgment} ${followUp}`,
    guardrailNote: `Review response drafts for ${source} require human review before posting or sending.`,
  };
}
