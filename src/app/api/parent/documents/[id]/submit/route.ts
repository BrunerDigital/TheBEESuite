import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, UserRole } from "@prisma/client";
import { canAccessAllCenters, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { canSubmitDocumentForReview } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import { uploadDocumentBuffer } from "@/lib/supabase-storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function contentTypeForFile(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") || "";
  let noteText = "";
  let signatureAcknowledged = false;
  let uploadedFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    noteText = clean(formData.get("note"));
    signatureAcknowledged = clean(formData.get("signatureAcknowledged")) === "true";
    const file = formData.get("file") ?? formData.get("document");
    uploadedFile = file instanceof File && file.size > 0 ? file : null;
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    noteText = clean(body.note);
    signatureAcknowledged = Boolean(body.signatureAcknowledged);
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

  let nextStorageKey = document.storageKey;
  let uploadedFileName: string | null = null;
  if (uploadedFile) {
    const bytes = Buffer.from(await uploadedFile.arrayBuffer());
    uploadedFileName = uploadedFile.name || "uploaded document";
    try {
      const upload = await uploadDocumentBuffer({
        bytes,
        contentType: contentTypeForFile(uploadedFile),
        originalName: uploadedFile.name,
        tenantId: user.tenantId,
        centerId,
        familyId: family.id,
        childId: document.childId,
        documentId: document.id,
      });
      nextStorageKey = upload.storageKey;
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Document could not be uploaded to secure storage." },
        { status: 502 },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextDocument = await tx.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.SUBMITTED,
        storageKey: nextStorageKey,
      },
    });

    await tx.note.create({
      data: {
        familyId: family.id,
        userId: user.id,
        body: [
          `${document.name} submitted for review from the parent portal.`,
          document.childId ? `Child ID: ${document.childId}.` : "",
          uploadedFileName ? `Uploaded file: ${uploadedFileName}.` : "",
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
      uploadedFile: Boolean(uploadedFileName),
      storageProvider: uploadedFileName ? "supabase" : "unchanged",
    },
  });

  return NextResponse.json({ ok: true, document: updated });
}
