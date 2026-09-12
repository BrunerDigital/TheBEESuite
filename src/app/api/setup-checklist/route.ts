import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
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
  const centerId = key === "director_launch" && typeof body?.centerId === "string" ? body.centerId.trim() : null;
  if (key === "director_launch" && !centerId) {
    return NextResponse.json({ ok: false, error: "Choose a school before saving its launch checklist." }, { status: 400 });
  }
  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to that school." }, { status: 403 });
  }
  if (centerId) {
    const scopedCenter = await prisma.center.findFirst({
      where: { id: centerId, organization: { tenantId: user.tenantId } },
      select: { id: true },
    });
    if (!scopedCenter) return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  }

  const checklistTasks = setupChecklistTasksForKey(key);
  const allowedTaskIds = new Set(checklistTasks.map((task) => task.id));
  const allowedManualTaskIds = new Set(checklistTasks
    .filter((task) => !task.requiresVerifiedEvidence)
    .map((task) => task.id));
  const completedIds = Array.isArray(body?.completedIds)
    ? Array.from(new Set(body.completedIds.filter((value): value is string => typeof value === "string" && allowedManualTaskIds.has(value))))
    : [];

  const savedAt = new Date().toISOString();
  let saved = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { customFields: true, updatedAt: true },
    });
    if (!existingUser) {
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    }

    const customFields = record(existingUser.customFields);
    const setupChecklists = record(customFields.setupChecklists);
    const existingChecklist = record(setupChecklists[key]);
    const checklistProgress = {
      completedIds,
      completedCount: completedIds.length,
      totalCount: allowedTaskIds.size,
      updatedAt: savedAt,
    };
    const nextCustomFields = {
      ...customFields,
      setupChecklists: {
        ...setupChecklists,
        [key]: key === "director_launch" && centerId
          ? {
              ...existingChecklist,
              centers: {
                ...record(existingChecklist.centers),
                [centerId]: checklistProgress,
              },
            }
          : checklistProgress,
      },
    };

    const update = await prisma.user.updateMany({
      where: { id: user.id, updatedAt: existingUser.updatedAt },
      data: { customFields: nextCustomFields as Prisma.InputJsonValue },
    });
    if (update.count === 1) {
      saved = true;
      break;
    }
  }

  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "Your profile changed while this checklist was saving. Try that step again." },
      { status: 409 },
    );
  }

  await writeAuditLog(user, {
    action: "school_setup.checklist.saved",
    resource: "User",
    resourceId: user.id,
    centerId,
    metadata: { key, completedIds, savedAt },
  });

  return NextResponse.json({
    ok: true,
    key,
    centerId,
    completedIds,
    completedCount: completedIds.length,
    totalCount: allowedTaskIds.size,
    updatedAt: savedAt,
  });
}

export const PATCH = withApiLogging("PATCH", PATCHHandler);

