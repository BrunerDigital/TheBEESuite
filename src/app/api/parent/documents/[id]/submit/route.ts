import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, UserRole } from "@prisma/client";
import { canAccessAllCenters, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { canSubmitDocumentForReview } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const noteText = clean(body.note);
  const signatureAcknowledged = Boolean(body.signatureAcknowledged);

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
  const isLinkedGuardian = family.guardians.some((guardian) => guardian.userId === user.id);
  const hasCenterAccess = canAccessAllCenters(user) || Boolean(centerId && user.centerIds.includes(centerId));
  const guard = canSubmitDocumentForReview({
    status: document.status,
    isLinkedGuardian,
    hasCenterAccess,
  });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  if (isParentGuardian(user) && !isLinkedGuardian) {
    return NextResponse.json({ ok: false, error: "You do not have access to this document." }, { status: 403 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextDocument = await tx.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.SUBMITTED,
      },
    });

    await tx.note.create({
      data: {
        familyId: family.id,
        userId: user.id,
        body: [
          `${document.name} submitted for review from the parent portal.`,
          document.childId ? `Child ID: ${document.childId}.` : "",
          noteText ? `Parent note: ${noteText}` : "",
          signatureAcknowledged ? "Signature/acknowledgement box checked by parent." : "",
        ].filter(Boolean).join(" "),
        restricted: document.restricted,
      },
    });

    return nextDocument;
  });

  const directors = centerId
    ? await getCenterLeadershipUsers({
        centerId,
        roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
      })
    : [];
  await Promise.all(
    directors.map((director) =>
      prisma.notification.create({
        data: {
          userId: director.id,
          title: "Parent document submitted",
          body: `${family.name}: ${document.name} is ready for review.`,
          type: "document",
          priority: document.restricted ? "high" : "normal",
        },
      }),
    ),
  );

  await writeAuditLog(user, {
    centerId,
    action: "parent.document.submitted",
    resource: "Document",
    resourceId: document.id,
    metadata: {
      familyId: family.id,
      childId: document.childId,
      previousStatus: document.status,
      nextStatus: updated.status,
      signatureAcknowledged,
    },
  });

  return NextResponse.json({ ok: true, document: updated });
}
