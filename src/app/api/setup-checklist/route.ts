import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setupChecklistTasksForKey, type SetupChecklistKey } from "@/lib/setup-checklists";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedKeys = new Set<SetupChecklistKey>(["director_launch", "teacher_profile"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function PATCHHandler(request: NextRequest) {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const key = typeof body?.key === "string" ? body.key as SetupChecklistKey : null;
  if (!key || !allowedKeys.has(key)) {
    return NextResponse.json({ ok: false, error: "Checklist key is not valid." }, { status: 400 });
  }

  const allowedTaskIds = new Set(setupChecklistTasksForKey(key).map((task) => task.id));
  const completedIds = Array.isArray(body?.completedIds)
    ? Array.from(new Set(body.completedIds.filter((value): value is string => typeof value === "string" && allowedTaskIds.has(value))))
    : [];

  const existingUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { customFields: true },
  });
  if (!existingUser) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  const customFields = record(existingUser.customFields);
  const setupChecklists = record(customFields.setupChecklists);
  const savedAt = new Date().toISOString();
  const nextCustomFields = {
    ...customFields,
    setupChecklists: {
      ...setupChecklists,
      [key]: {
        completedIds,
        completedCount: completedIds.length,
        totalCount: allowedTaskIds.size,
        updatedAt: savedAt,
      },
    },
  };

  await prisma.user.update({
    where: { id: user.id },
    data: { customFields: nextCustomFields as Prisma.InputJsonValue },
  });

  return NextResponse.json({
    ok: true,
    key,
    completedIds,
    completedCount: completedIds.length,
    totalCount: allowedTaskIds.size,
    updatedAt: savedAt,
  });
}

export const PATCH = withApiLogging("PATCH", PATCHHandler);

