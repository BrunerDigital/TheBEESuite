import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { draftReviewResponse } from "@/lib/marketing-workflows";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Review response drafting is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const review = await prisma.review.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!review) return NextResponse.json({ ok: false, error: "Review not found." }, { status: 404 });
  if (review.centerId && !canAccessCenter(user, review.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this review." }, { status: 403 });
  }

  const { draft, guardrailNote } = draftReviewResponse({
    rating: review.rating,
    body: review.body,
    source: review.source,
  });
  const updated = await prisma.review.update({
    where: { id: review.id },
    data: {
      responseDraft: draft,
      status: "drafted",
    },
  });
  await writeAuditLog(user, {
    centerId: updated.centerId,
    action: "review.ai_response.generated",
    resource: "Review",
    resourceId: updated.id,
    metadata: {
      guardrailNote,
      source: updated.source,
      rating: updated.rating,
    },
  });

  return NextResponse.json({ ok: true, review: updated, draft, guardrailNote });
}
