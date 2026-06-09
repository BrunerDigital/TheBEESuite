import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { updateSurveyResults } from "@/lib/marketing-workflows";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  const rounded = Math.round(score);
  return rounded >= 0 && rounded <= 10 ? rounded : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const score = parseScore(body.score);
  if (score === null) return NextResponse.json({ ok: false, error: "Score must be a number from 0 to 10." }, { status: 400 });

  const survey = await prisma.survey.findFirst({
    where: { id, status: { in: ["active", "draft"] } },
    select: { id: true, tenantId: true, centerId: true, results: true, name: true },
  });
  if (!survey) return NextResponse.json({ ok: false, error: "Survey not found." }, { status: 404 });

  const familyId = clean(body.familyId) || null;
  let centerId = clean(body.centerId) || survey.centerId || null;
  if (familyId) {
    const family = await prisma.family.findUnique({ where: { id: familyId }, select: { centerId: true } });
    if (!family) return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });
    if (survey.centerId && family.centerId !== survey.centerId) {
      return NextResponse.json({ ok: false, error: "Family is outside this survey center." }, { status: 403 });
    }
    centerId = family.centerId;
  }
  if (centerId && survey.centerId && centerId !== survey.centerId) {
    return NextResponse.json({ ok: false, error: "Response center does not match this survey." }, { status: 403 });
  }

  const comment = clean(body.comment).slice(0, 1_000) || null;
  const respondentName = clean(body.respondentName).slice(0, 160) || null;
  const respondentEmail = clean(body.respondentEmail).slice(0, 200) || null;
  const response = await prisma.surveyResponse.create({
    data: {
      surveyId: survey.id,
      centerId,
      familyId,
      respondentName,
      respondentEmail,
      score,
      comment,
      responseType: clean(body.responseType) || "nps",
      metadata: {
        userAgent: request.headers.get("user-agent"),
        source: clean(body.source) || "family_feedback",
      } as Prisma.InputJsonObject,
    },
  });
  const results = updateSurveyResults(survey.results, { score, comment });
  await prisma.survey.update({
    where: { id: survey.id },
    data: { results: results as Prisma.InputJsonObject },
  });

  if (survey.tenantId) {
    await writeSystemAuditLog({
      tenantId: survey.tenantId,
      centerId,
      action: "survey.response.created",
      resource: "SurveyResponse",
      resourceId: response.id,
      metadata: {
        surveyId: survey.id,
        surveyName: survey.name,
        score,
      },
    });
  }

  return NextResponse.json({ ok: true, response, results }, { status: 201 });
}
