function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

export function publicSurveyResponsePayload(input: {
  response: {
    id: string;
    score: number;
    submittedAt: Date | string;
  };
  results: unknown;
}) {
  const results = asRecord(input.results);
  const nps = asRecord(results.nps);

  return {
    ok: true,
    response: {
      id: input.response.id,
      score: input.response.score,
      submittedAt: new Date(input.response.submittedAt).toISOString(),
    },
    results: {
      nps: {
        total: Math.max(0, finiteInteger(nps.total)),
        promoters: Math.max(0, finiteInteger(nps.promoters)),
        passives: Math.max(0, finiteInteger(nps.passives)),
        detractors: Math.max(0, finiteInteger(nps.detractors)),
        score: finiteInteger(nps.score),
      },
      lastResponseAt: typeof results.lastResponseAt === "string" ? results.lastResponseAt : null,
    },
  };
}
