import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { prisma } from "@/lib/prisma";
import { contentTypeForDocumentFile, uploadDocumentBuffer } from "@/lib/supabase-storage";

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
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Document uploads are not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Upload must be sent as multipart form data." }, { status: 400 });
  }

  const formData = await request.formData();
  const noteText = clean(formData.get("note"));
  const file = formData.get("file") ?? formData.get("document");
  const uploadedFile = file instanceof File && file.size > 0 ? file : null;
  if (!uploadedFile) {
    return NextResponse.json({ ok: false, error: "Choose a document file before uploading." }, { status: 400 });
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

  const bytes = Buffer.from(await uploadedFile.arrayBuffer());
  let storageKey: string;
  try {
    const upload = await uploadDocumentBuffer({
      bytes,
      contentType: contentTypeForDocumentFile(uploadedFile),
      originalName: uploadedFile.name,
      tenantId: user.tenantId,
      centerId,
      familyId: family.id,
      childId: document.childId,
      documentId: document.id,
    });
    storageKey = upload.storageKey;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Document could not be uploaded to secure storage." },
      { status: 502 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextDocument = await tx.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.SUBMITTED,
        storageKey,
      },
    });

    await tx.note.create({
      data: {
        familyId: family.id,
        userId: user.id,
        body: [
          `${document.name} uploaded by ${user.name} and submitted for document review.`,
          document.childId ? `Child ID: ${document.childId}.` : "",
          uploadedFile.name ? `Uploaded file: ${uploadedFile.name}.` : "",
          noteText ? `Upload note: ${noteText}` : "",
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
    directors
      .filter((director) => director.id !== user.id)
      .map((director) =>
        prisma.notification.create({
          data: {
            userId: director.id,
            title: "Document uploaded",
            body: `${family.name}: ${document.name} is ready for review.`,
            type: "document",
            priority: document.restricted ? "high" : "normal",
          },
        }),
      ),
  );

  await writeAuditLog(user, {
    centerId,
    action: "document.uploaded",
    resource: "Document",
    resourceId: document.id,
    metadata: {
      familyId: family.id,
      childId: document.childId,
      previousStatus: document.status,
      nextStatus: updated.status,
      fileName: uploadedFile.name,
      fileSize: uploadedFile.size,
      contentType: contentTypeForDocumentFile(uploadedFile),
      storageProvider: "supabase",
    },
  });

  return NextResponse.json({ ok: true, document: updated });
}
