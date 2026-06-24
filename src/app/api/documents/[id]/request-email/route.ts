import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { sendParentDocumentRequestEmailForDocument } from "@/lib/parent-document-requests";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Parent document requests are not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      family: { select: { centerId: true } },
      child: { select: { family: { select: { centerId: true } } } },
    },
  });
  if (!document) {
    return NextResponse.json({ ok: false, error: "Document request was not found." }, { status: 404 });
  }
  const centerId = document.family?.centerId ?? document.child?.family.centerId ?? null;
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "Document request is not linked to a school." }, { status: 400 });
  }
  if (!canAccessAllCenters(user) && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this document request." }, { status: 403 });
  }

  const result = await sendParentDocumentRequestEmailForDocument({
    documentId: id,
    user,
    requestUrl: request.url,
  });

  return NextResponse.json(result, { status: result.status });
}

export const POST = withApiLogging("POST", POSTHandler);
