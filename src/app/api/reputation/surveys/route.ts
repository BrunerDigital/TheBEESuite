import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeStatus(value: unknown) {
  const status = clean(value).toLowerCase();
  return ["draft", "active", "paused", "closed", "archived"].includes(status) ? status : "active";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Survey management is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = clean(body.id);
  const centerId = clean(body.centerId) || null;
  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const data = {
    tenantId: user.tenantId,
    centerId,
    name: clean(body.name).slice(0, 160),
    type: clean(body.type).slice(0, 80) || "nps",
    description: clean(body.description).slice(0, 1_000) || null,
    status: safeStatus(body.status),
  };
  if (!data.name) return NextResponse.json({ ok: false, error: "Survey name is required." }, { status: 400 });

  if (id) {
    const existing = await prisma.survey.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, centerId: true },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Survey not found." }, { status: 404 });
    if (existing.centerId && !canAccessCenter(user, existing.centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this survey." }, { status: 403 });
    }
  }

  const survey = id
    ? await prisma.survey.update({ where: { id }, data })
    : await prisma.survey.create({ data: { ...data, results: { responses: [], nps: { total: 0, promoters: 0, passives: 0, detractors: 0, score: 0 } } as Prisma.InputJsonObject } });

  await writeAuditLog(user, {
    centerId,
    action: id ? "survey.updated" : "survey.created",
    resource: "Survey",
    resourceId: survey.id,
    metadata: {
      status: survey.status,
      type: survey.type,
    },
  });

  return NextResponse.json({ ok: true, survey }, { status: id ? 200 : 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
