import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function PATCHHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Photo review is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action);
  const note = clean(body.note);

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Review action must be approve or reject." }, { status: 400 });
  }

  const media = await prisma.childMedia.findUnique({
    where: { id },
    include: {
      child: {
        include: {
          family: { select: { centerId: true, name: true } },
        },
      },
      classroom: { select: { id: true, centerId: true, name: true } },
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  if (!media) {
    return NextResponse.json({ ok: false, error: "Photo not found." }, { status: 404 });
  }

  const centerId = media.classroom?.centerId ?? media.child.family.centerId;
  const accessGuard = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Photo",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (action === "approve") {
      await tx.child.update({
        where: { id: media.childId },
        data: { photoVideoPermission: true },
      });
      return tx.childMedia.update({
        where: { id },
        data: {
          status: "shared",
          sharedWithParents: true,
        },
      });
    }

    return tx.childMedia.update({
      where: { id },
      data: {
        status: "rejected",
        sharedWithParents: false,
      },
    });
  });

  if (media.uploadedBy?.id && media.uploadedBy.id !== user.id) {
    await prisma.notification.create({
      data: {
        userId: media.uploadedBy.id,
        title: action === "approve" ? "Photo approved for parent portal" : "Photo sharing rejected",
        body:
          action === "approve"
            ? `${media.child.fullName}'s photo was approved and shared with parents.`
            : `${media.child.fullName}'s photo was kept internal after director review.`,
        type: "parent_media",
        priority: action === "approve" ? "normal" : "high",
      },
    });
  }

  await writeAuditLog(user, {
    centerId,
    action: action === "approve" ? "child_media.approved" : "child_media.rejected",
    resource: "ChildMedia",
    resourceId: id,
    metadata: {
      childId: media.childId,
      childName: media.child.fullName,
      classroomId: media.classroomId,
      previousStatus: media.status,
      newStatus: updated.status,
      photoVideoPermissionEnabled: action === "approve",
      note: note || null,
    },
  });

  return NextResponse.json({ ok: true, media: updated });
}

export const PATCH = withApiLogging("PATCH", PATCHHandler);
