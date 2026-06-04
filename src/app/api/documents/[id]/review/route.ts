import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function reviewStatus(value: unknown) {
  const normalized = clean(value).toUpperCase();
  if (normalized === "APPROVED") return DocumentStatus.APPROVED;
  if (normalized === "REJECTED") return DocumentStatus.REJECTED;
  return null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Document review is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = reviewStatus(body.status || body.action);
  const noteText = clean(body.note);
  if (!status) {
    return NextResponse.json({ ok: false, error: "Review status must be approved or rejected." }, { status: 400 });
  }

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      family: { include: { guardians: { select: { userId: true } } } },
      child: {
        include: {
          family: { include: { guardians: { select: { userId: true } } } },
          classroom: { select: { centerId: true } },
        },
      },
    },
  });
  if (!document) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }

  const family = document.family ?? document.child?.family ?? null;
  if (!family) {
    return NextResponse.json({ ok: false, error: "Document is not linked to a family." }, { status: 400 });
  }

  const centerId = family.centerId ?? document.child?.classroom?.centerId ?? null;
  const hasCenterAccess = canAccessAllCenters(user) || Boolean(centerId && canAccessCenter(user, centerId));
  if (!hasCenterAccess) {
    return NextResponse.json({ ok: false, error: "You do not have access to this document." }, { status: 403 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextDocument = await tx.document.update({
      where: { id: document.id },
      data: { status },
    });

    await tx.note.create({
      data: {
        familyId: family.id,
        userId: user.id,
        body: [
          `${document.name} marked ${status.toLowerCase()} by ${user.name}.`,
          noteText ? `Review note: ${noteText}` : "",
        ].filter(Boolean).join(" "),
        restricted: document.restricted,
      },
    });

    const guardianUserIds = Array.from(new Set(family.guardians.map((guardian) => guardian.userId).filter((value): value is string => Boolean(value))));
    await Promise.all(
      guardianUserIds.map((userId) =>
        tx.notification.create({
          data: {
            userId,
            title: `Document ${status.toLowerCase()}`,
            body: `${document.name} was ${status.toLowerCase()} by the school.`,
            type: "document",
            priority: status === DocumentStatus.REJECTED ? "high" : "normal",
          },
        }),
      ),
    );

    return nextDocument;
  });

  await writeAuditLog(user, {
    centerId,
    action: "document.reviewed",
    resource: "Document",
    resourceId: document.id,
    metadata: {
      familyId: family.id,
      childId: document.childId,
      previousStatus: document.status,
      nextStatus: updated.status,
      hasReviewNote: Boolean(noteText),
    },
  });

  return NextResponse.json({ ok: true, document: updated });
}
