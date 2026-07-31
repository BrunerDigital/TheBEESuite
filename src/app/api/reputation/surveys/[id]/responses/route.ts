import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { updateSurveyResults } from "@/lib/marketing-workflows";
import { prisma } from "@/lib/prisma";
import { publicSurveyResponsePayload } from "@/lib/survey-responses";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";

import { withApiLogging } from "@/lib/request-response-logging";
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

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const limited = await checkPersistentRateLimit({
    key: `survey-response:${id}:${requestIp(request.headers)}`,
    limit: 30,
    windowMs: 10 * 60 * 1_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many survey responses were submitted. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)) } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const score = parseScore(body.score);
  if (score === null) return NextResponse.json({ ok: false, error: "Score must be a number from 0 to 10." }, { status: 400 });

  const comment = clean(body.comment).slice(0, 1_000) || null;
  const respondentName = clean(body.respondentName).slice(0, 160) || null;
  const respondentEmail = clean(body.respondentEmail).slice(0, 200) || null;
  const requestedCenterId = clean(body.centerId) || null;
  const requestedFamilyId = clean(body.familyId) || null;
  const responseType = clean(body.responseType).slice(0, 80) || "nps";
  const source = clean(body.source).slice(0, 80) || "family_feedback";
  const userAgent = clean(request.headers.get("user-agent")).slice(0, 500) || null;

  const outcome = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{
      id: string;
      tenantId: string | null;
      centerId: string | null;
      name: string;
      status: string;
      results: Prisma.JsonValue | null;
    }>>`
      SELECT "id", "tenantId", "centerId", "name", "status", "results"
      FROM "Survey"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    const survey = locked[0];
    if (!survey || survey.status !== "active") return { status: "not_found" as const };

    let centerId = survey.centerId;
    let familyId: string | null = null;

    if ((requestedCenterId || requestedFamilyId) && !survey.tenantId) {
      return { status: "scope_mismatch" as const };
    }

    if (requestedCenterId) {
      if (survey.centerId && requestedCenterId !== survey.centerId) {
        return { status: "scope_mismatch" as const };
      }
      const center = await tx.center.findFirst({
        where: {
          id: requestedCenterId,
          organization: { tenantId: survey.tenantId! },
        },
        select: { id: true },
      });
      if (!center) return { status: "scope_mismatch" as const };
      centerId = center.id;
    }

    if (requestedFamilyId) {
      const family = await tx.family.findFirst({
        where: { id: requestedFamilyId },
        select: { id: true, centerId: true },
      });
      const familyCenter = family?.centerId
        ? await tx.center.findFirst({
            where: {
              id: family.centerId,
              organization: { tenantId: survey.tenantId! },
            },
            select: { id: true },
          })
        : null;
      if (!family || !familyCenter || (centerId && family.centerId !== centerId)) {
        return { status: "scope_mismatch" as const };
      }
      familyId = family.id;
      centerId = family.centerId;
    }

    const response = await tx.surveyResponse.create({
      data: {
        surveyId: survey.id,
        centerId,
        familyId,
        respondentName,
        respondentEmail,
        score,
        comment,
        responseType,
        metadata: { userAgent, source } as Prisma.InputJsonObject,
      },
      select: { id: true, score: true, submittedAt: true },
    });
    const results = updateSurveyResults(survey.results, { score, comment });
    await tx.survey.update({
      where: { id: survey.id },
      data: { results: results as Prisma.InputJsonObject },
    });

    if (survey.tenantId) {
      await tx.auditLog.create({
        data: {
          tenantId: survey.tenantId,
          centerId,
          userId: null,
          action: "survey.response.created",
          resource: "SurveyResponse",
          resourceId: response.id,
          metadata: {
            surveyId: survey.id,
            surveyName: survey.name,
            score,
          },
        },
      });
    }

    return { status: "created" as const, response, results };
  });

  if (outcome.status === "not_found") {
    return NextResponse.json({ ok: false, error: "Active survey not found." }, { status: 404 });
  }
  if (outcome.status === "scope_mismatch") {
    return NextResponse.json({ ok: false, error: "Response details do not match this survey." }, { status: 403 });
  }

  return NextResponse.json(publicSurveyResponsePayload(outcome), { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
