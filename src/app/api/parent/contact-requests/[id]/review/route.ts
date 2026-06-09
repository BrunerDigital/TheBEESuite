import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  formatGuardianChangeRequestBody,
  normalizeGuardianChangeRequestStatus,
  parseGuardianChangeRequestNote,
} from "@/lib/guardian-change-requests";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Guardian change request review is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = normalizeGuardianChangeRequestStatus(body.status || body.action);
  const reviewNote = clean(body.note);
  if (status === "pending") {
    return NextResponse.json({ ok: false, error: "Review status must be approved or rejected." }, { status: 400 });
  }

  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      family: {
        include: {
          guardians: { select: { userId: true } },
        },
      },
    },
  });
  if (!note || !note.family) {
    return NextResponse.json({ ok: false, error: "Guardian change request not found." }, { status: 404 });
  }

  const requestDetails = parseGuardianChangeRequestNote(note.body);
  if (!requestDetails) {
    return NextResponse.json({ ok: false, error: "This note is not a guardian change request." }, { status: 400 });
  }

  const centerId = note.family.centerId;
  const hasCenterAccess = canAccessAllCenters(user) || Boolean(centerId && canAccessCenter(user, centerId));
  if (!hasCenterAccess) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family request." }, { status: 403 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextBody = [
      formatGuardianChangeRequestBody({ ...requestDetails, status }),
      reviewNote ? `Review note: ${reviewNote}` : "",
    ].filter(Boolean).join("\n");
    const nextNote = await tx.note.update({
      where: { id: note.id },
      data: { body: nextBody, restricted: true },
    });

    const guardianUserIds = Array.from(new Set(note.family!.guardians.map((guardian) => guardian.userId).filter((value): value is string => Boolean(value))));
    await Promise.all(
      guardianUserIds.map((guardianUserId) =>
        tx.notification.create({
          data: {
            userId: guardianUserId,
            title: `Request ${status}`,
            body: `${note.family!.name}: your ${requestDetails.requestType.toLowerCase()} request was ${status}.`,
            type: "parent_request",
            priority: status === "rejected" ? "high" : "normal",
          },
        }),
      ),
    );

    return nextNote;
  });

  await writeAuditLog(user, {
    centerId,
    action: "parent.contact_update.reviewed",
    resource: "Note",
    resourceId: note.id,
    metadata: {
      familyId: note.familyId,
      requestType: requestDetails.requestType,
      previousStatus: requestDetails.status,
      nextStatus: status,
      hasReviewNote: Boolean(reviewNote),
    },
  });

  return NextResponse.json({ ok: true, request: updated });
}

export const POST = withApiLogging("POST", POSTHandler);
