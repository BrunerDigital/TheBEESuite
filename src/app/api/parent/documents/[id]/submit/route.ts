import { NextRequest, NextResponse } from "next/server";
import { DocumentStatus, Prisma, UserRole } from "@prisma/client";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canSubmitDocumentForReview, parentPortalFamilyScopeWhere } from "@/lib/portal-guardrails";
import { getParentPortalFamilyScope, getParentPortalTenantCenterIds, parentPortalTenantFamilyWhere } from "@/lib/parent-portal-family-scope";
import { parentCurrentChildScope, parentDocumentScope } from "@/lib/parent-document-query";
import { teamAccessGrantWhere } from "@/lib/team-permissions-scope";
import { prisma } from "@/lib/prisma";
import {
  buildInternalSignatureCertificate,
  isInternalSignatureRequest,
  signatureEvidenceHash,
  validateSignatureCapture,
} from "@/lib/signature-capture";
import { contentTypeForDocumentFile, deleteDocumentObject, uploadDocumentBuffer } from "@/lib/supabase-storage";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

class DocumentSubmissionConflict extends Error {}

async function POSTHandler(request: NextRequest, context: RouteContext) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Parent or guardian access is required." }, { status: 403 });
  }
  const appReviewKind = appReviewReservedIdentityKind(user.email);

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") || "";
  let noteText = "";
  let signatureAcknowledged = false;
  let signatureConsentAccepted = false;
  let signatureName = "";
  let uploadedFile: File | null = null;
  let requestedFamilyId = "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    requestedFamilyId = clean(formData.get("familyId"));
    noteText = clean(formData.get("note"));
    signatureAcknowledged = clean(formData.get("signatureAcknowledged")) === "true";
    signatureConsentAccepted = clean(formData.get("signatureConsentAccepted")) === "true";
    signatureName = clean(formData.get("signatureName"));
    const file = formData.get("file") ?? formData.get("document");
    uploadedFile = file instanceof File && file.size > 0 ? file : null;
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    requestedFamilyId = clean(body.familyId);
    noteText = clean(body.note);
    signatureAcknowledged = body.signatureAcknowledged === true;
    signatureConsentAccepted = body.signatureConsentAccepted === true;
    signatureName = clean(body.signatureName);
  }

  const scope = await getParentPortalFamilyScope(user.id, user.tenantId, requestedFamilyId || null);
  if (!scope.ok) return NextResponse.json({ ok: false, error: "Select a current linked family before submitting a document." }, { status: 403 });
  const tenantCenterIds = await getParentPortalTenantCenterIds(user.tenantId);
  const familyWhereFor = (centerIds: string[]): Prisma.FamilyWhereInput => ({ AND: [
    parentPortalFamilyScopeWhere({ userId: user.id, requestedFamilyId: scope.familyId }),
    parentPortalTenantFamilyWhere(centerIds),
    { children: { some: parentCurrentChildScope(user.tenantId) } },
  ] });
  const familySelect = { id: true, name: true, centerId: true, children: {
    where: parentCurrentChildScope(user.tenantId), select: { id: true, classroom: { select: { centerId: true } } },
  } } satisfies Prisma.FamilySelect;
  const family = await prisma.family.findFirst({ where: familyWhereFor(tenantCenterIds), select: familySelect });
  if (!family) return NextResponse.json({ ok: false, error: "Current family access is required to submit this document." }, { status: 403 });
  const document = await prisma.document.findFirst({
    where: { AND: [parentDocumentScope(family.id, family.children.map((child) => child.id)), { id }] },
    include: { child: { select: { fullName: true } } },
  });

  if (!document) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }

  const centerId = family.centerId ?? family.children.find((child) => child.id === document.childId)?.classroom?.centerId ?? family.children[0]?.classroom?.centerId ?? null;
  const guard = canSubmitDocumentForReview({
    status: document.status,
    isLinkedGuardian: true,
    hasCenterAccess: false,
  });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }
  const signatureRequired = isInternalSignatureRequest(document);
  if (!signatureRequired && !uploadedFile) return NextResponse.json({ ok: false, error: "Choose a document file before submitting." }, { status: 400 });
  const signatureGuard = validateSignatureCapture({
    required: signatureRequired,
    signerName: signatureName,
    consentAccepted: signatureConsentAccepted || signatureAcknowledged,
  });
  if (!signatureGuard.ok) {
    return NextResponse.json({ ok: false, error: signatureGuard.error }, { status: signatureGuard.status });
  }

  let nextStorageKey = document.storageKey;
  let uploadedStorageKey: string | null = null;
  let uploadedFileName: string | null = null;
  let signatureEvidence: { signerName: string; signedAt: Date; evidenceHash: string } | null = null;
  if (signatureRequired) {
    const signedAt = new Date();
    const evidenceHash = signatureEvidenceHash([
      document.id,
      family.id,
      document.childId,
      user.id,
      user.email,
      signatureGuard.signerName,
      signedAt.toISOString(),
      request.headers.get("user-agent"),
      request.headers.get("x-forwarded-for"),
    ]);
    const certificate = buildInternalSignatureCertificate({
      documentId: document.id,
      documentName: document.name,
      documentType: document.type,
      familyName: family.name,
      childName: document.child?.fullName,
      signerName: signatureGuard.signerName,
      signerEmail: user.email,
      signerUserId: user.id,
      signedAt,
      evidenceHash,
    });

    try {
      const upload = await uploadDocumentBuffer({
        bytes: certificate,
        contentType: "text/plain",
        originalName: `${document.name}-signed-certificate.txt`,
        tenantId: user.tenantId,
        centerId,
        familyId: family.id,
        childId: document.childId,
        documentId: document.id,
        appReviewDemo: Boolean(appReviewKind),
      });
      nextStorageKey = upload.storageKey;
      uploadedStorageKey = upload.storageKey;
      signatureEvidence = { signerName: signatureGuard.signerName, signedAt, evidenceHash };
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "We couldn't save the signed document. It has not been submitted. Try again.",
        },
        { status: 502 },
      );
    }
  } else if (uploadedFile) {
    const bytes = Buffer.from(await uploadedFile.arrayBuffer());
    uploadedFileName = uploadedFile.name || "uploaded document";
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
        appReviewDemo: Boolean(appReviewKind),
      });
      nextStorageKey = upload.storageKey;
      uploadedStorageKey = upload.storageKey;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "We couldn't upload the document. It has not been submitted. Try again.",
        },
        { status: 502 },
      );
    }
  }

  let updated: { id: string; status: DocumentStatus };
  let callbackFailed = false;
  try {
    updated = await prisma.$transaction(async (tx) => {
      try {
      const currentActor = await tx.user.findFirst({ where: { id: user.id, tenantId: user.tenantId, role: UserRole.PARENT_GUARDIAN, isActive: true }, select: { id: true } });
      const currentCenters = currentActor ? await tx.center.findMany({ where: { organization: { tenantId: user.tenantId } }, select: { id: true } }) : [];
      const currentFamily = currentActor ? await tx.family.findFirst({ where: familyWhereFor(currentCenters.map((center) => center.id)), select: familySelect }) : null;
      const currentCenterId = currentFamily?.centerId ?? currentFamily?.children.find((child) => child.id === document.childId)?.classroom?.centerId ?? currentFamily?.children[0]?.classroom?.centerId ?? null;
      if (!currentFamily || currentCenterId !== centerId) throw new DocumentSubmissionConflict();
      const mutation = await tx.document.updateMany({
        where: { AND: [
          parentDocumentScope(currentFamily.id, currentFamily.children.map((child) => child.id)),
          { id: document.id, status: document.status, storageKey: document.storageKey, familyId: document.familyId, childId: document.childId, name: document.name, type: document.type, restricted: document.restricted },
        ] },
      data: {
        status: DocumentStatus.SUBMITTED,
        storageKey: nextStorageKey,
      },
      });
      if (mutation.count !== 1) throw new DocumentSubmissionConflict();

    await tx.note.create({
      data: {
        familyId: family.id,
        userId: user.id,
        body: [
          `${document.name} submitted for review from the parent portal.`,
          document.childId ? `Child ID: ${document.childId}.` : "",
          uploadedFileName ? `Uploaded file: ${uploadedFileName}.` : "",
          noteText ? `Parent note: ${noteText}` : "",
          signatureEvidence ? `Typed signature captured from ${signatureEvidence.signerName}.` : "",
          signatureAcknowledged ? "Signature/acknowledgement box checked by parent." : "",
        ].filter(Boolean).join(" "),
        restricted: document.restricted,
      },
    });

      await writeAuditLog(user, {
    centerId,
    action: "parent.document.submitted",
    resource: "Document",
    resourceId: document.id,
    metadata: {
      familyId: family.id,
      childId: document.childId,
      previousStatus: document.status,
      nextStatus: DocumentStatus.SUBMITTED,
      signatureAcknowledged,
      signatureCaptured: Boolean(signatureEvidence),
      signatureName: signatureEvidence?.signerName,
      signatureEvidenceHash: signatureEvidence?.evidenceHash,
      signedAt: signatureEvidence?.signedAt.toISOString(),
      uploadedFile: Boolean(uploadedFileName),
      storageProvider: signatureEvidence || uploadedFileName ? "supabase" : "unchanged",
      appReviewOutboundSuppressed: Boolean(appReviewKind),
    },
      }, tx);
      return { id: document.id, status: DocumentStatus.SUBMITTED };
      } catch (error) {
        // The callback rejected before Prisma could attempt COMMIT.
        callbackFailed = true;
        throw error;
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const conflict = error instanceof DocumentSubmissionConflict || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
    if (callbackFailed || conflict) {
      // These failures prove the transaction rolled back. Never remove a new
      // object on an ambiguous commit failure, nor delete the previous version.
      if (uploadedStorageKey && uploadedStorageKey !== document.storageKey) {
        try { await deleteDocumentObject(uploadedStorageKey); }
        catch { console.error("parent_document_submission_uncommitted_upload_cleanup_failed"); }
      }
    }
    if (conflict) {
      return NextResponse.json({ ok: false, error: "This document or your family access changed. Reload to review its current status before submitting again." }, { status: 409 });
    }
    throw error;
  }

  // The submission is committed. Notification delivery must not manufacture a
  // failed save or encourage a duplicate submission after a successful commit.
  try {
    const roles = [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR];
    const directors = !appReviewKind && centerId ? await prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true, role: { in: roles }, OR: [
        { staffProfile: { is: { centerId, center: { organization: { tenantId: user.tenantId } } } } },
        { accessGrants: { some: { AND: [teamAccessGrantWhere({ tenantId: user.tenantId, tenantWide: false, visibleCenterIds: [centerId], at: new Date() }), { scopeType: "CENTER", centerId, role: { in: roles } }] } } },
      ] }, select: { id: true },
    }) : [];
    await Promise.all(directors.map((director) => prisma.notification.create({ data: {
      userId: director.id, title: "Parent document submitted", body: `${family.name}: ${document.name} is ready for review.`, type: "document", priority: document.restricted ? "high" : "normal",
    } })));
  } catch { console.error("parent_document_submission_notification_failed_after_commit"); }

  return NextResponse.json({ ok: true, document: updated });
}

export const POST = withApiLogging("POST", POSTHandler);
