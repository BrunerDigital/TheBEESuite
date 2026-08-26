import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import {
  contentTypeForProfilePhotoFile,
  matchesProfilePhotoSignature,
  mergeProfilePhotoCustomFields,
  readProfilePhotoStorageKey,
  removeProfilePhotoCustomFields,
  validateProfilePhotoFile,
} from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
import {
  deleteChildMediaObject,
  isSupabaseStorageConfigured,
  uploadChildMediaBuffer,
} from "@/lib/supabase-storage";
import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type PhotoUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

class ProfilePhotoScopeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function currentAuthorizedChild(tx: Prisma.TransactionClient, id: string, user: PhotoUser) {
  const child = await tx.child.findUnique({
    where: { id },
    select: {
      id: true,
      classroomId: true,
      customFields: true,
      family: { select: { centerId: true } },
      classroom: { select: { centerId: true } },
    },
  });
  if (!child) throw new ProfilePhotoScopeError("Child not found.", 404);
  const centerId = child.classroom?.centerId ?? child.family.centerId;
  const access = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Child",
  });
  if (!access.ok) throw new ProfilePhotoScopeError(access.error, access.status);
  return { child, centerId };
}

async function authorizedChild(id: string) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }) } as const;
  if (!canManageOperations(user)) {
    return { response: NextResponse.json({ ok: false, error: "Student profile photo changes are not allowed for this role." }, { status: 403 }) } as const;
  }
  const child = await prisma.child.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      classroomId: true,
      customFields: true,
      family: { select: { centerId: true } },
      classroom: { select: { centerId: true } },
    },
  });
  if (!child) return { response: NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 }) } as const;
  const centerId = child.classroom?.centerId ?? child.family.centerId;
  const access = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Child",
  });
  if (!access.ok) return { response: NextResponse.json({ ok: false, error: access.error }, { status: access.status }) } as const;
  return { user, child, centerId } as const;
}

async function POSTHandler(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const authorization = await authorizedChild(id);
  if ("response" in authorization) return authorization.response!;
  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json({ ok: false, error: "Secure image storage is not configured yet." }, { status: 503 });
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "Choose a student profile photo before uploading." }, { status: 400 });
  }
  const contentType = contentTypeForProfilePhotoFile({ type: file.type, name: file.name });
  const guard = validateProfilePhotoFile({ size: file.size, contentType });
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matchesProfilePhotoSignature(bytes, contentType)) {
    return NextResponse.json({ ok: false, error: "The selected file does not match its JPG, PNG, or WebP image type." }, { status: 400 });
  }

  let uploaded: Awaited<ReturnType<typeof uploadChildMediaBuffer>>;
  try {
    uploaded = await uploadChildMediaBuffer({
      bytes,
      contentType,
      originalName: file.name,
      tenantId: authorization.user.tenantId,
      centerId: authorization.centerId,
      classroomId: authorization.child.classroomId,
      childId: authorization.child.id,
    });
  } catch (error) {
    logOperationalError("child.profile_photo.upload_failed", error, { childId: authorization.child.id, centerId: authorization.centerId });
    return NextResponse.json({ ok: false, error: "We couldn't upload this student profile photo. Try again." }, { status: 502 });
  }

  const profilePhoto = {
    url: uploaded.recordUrl,
    bucket: uploaded.bucket,
    storageKey: uploaded.storageKey,
    contentType,
    uploadedAt: new Date().toISOString(),
  };
  let previousStorageKey: string | null = null;
  let persistedCenterId = authorization.centerId;
  try {
    const persisted = await prisma.$transaction(async (tx) => {
      const current = await currentAuthorizedChild(tx, authorization.child.id, authorization.user);
      const currentStorageKey = readProfilePhotoStorageKey(current.child.customFields);
      await tx.child.update({
        where: { id: current.child.id },
        data: { customFields: mergeProfilePhotoCustomFields(current.child.customFields, profilePhoto) as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          tenantId: authorization.user.tenantId,
          centerId: current.centerId,
          userId: authorization.user.id,
          action: currentStorageKey ? "child.profile_photo.replaced" : "child.profile_photo.created",
          resource: "Child",
          resourceId: current.child.id,
          metadata: { storageProvider: "supabase", bucket: uploaded.bucket, contentType, previousPhotoReplaced: Boolean(currentStorageKey) },
        },
      });
      return { previousStorageKey: currentStorageKey, centerId: current.centerId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    previousStorageKey = persisted.previousStorageKey;
    persistedCenterId = persisted.centerId;
  } catch (error) {
    await deleteChildMediaObject(uploaded.storageKey).catch(() => undefined);
    if (error instanceof ProfilePhotoScopeError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (previousStorageKey && previousStorageKey !== uploaded.storageKey) {
    await deleteChildMediaObject(previousStorageKey).catch((error) => {
      logOperationalError("child.profile_photo.previous_object_cleanup_failed", error, { childId: authorization.child.id, centerId: persistedCenterId });
    });
  }
  return NextResponse.json({ ok: true, profilePhotoUrl: uploaded.signedUrl, profilePhotoStorageKey: uploaded.storageKey });
}

async function DELETEHandler(_request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const authorization = await authorizedChild(id);
  if ("response" in authorization) return authorization.response!;
  let storageKey: string | null;
  let persistedCenterId = authorization.centerId;
  try {
    const persisted = await prisma.$transaction(async (tx) => {
      const current = await currentAuthorizedChild(tx, authorization.child.id, authorization.user);
      const currentStorageKey = readProfilePhotoStorageKey(current.child.customFields);
      await tx.child.update({
        where: { id: current.child.id },
        data: { customFields: removeProfilePhotoCustomFields(current.child.customFields) as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          tenantId: authorization.user.tenantId,
          centerId: current.centerId,
          userId: authorization.user.id,
          action: "child.profile_photo.removed",
          resource: "Child",
          resourceId: current.child.id,
          metadata: { storageProvider: currentStorageKey ? "supabase" : "none", objectRemoved: Boolean(currentStorageKey) },
        },
      });
      return { storageKey: currentStorageKey, centerId: current.centerId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    storageKey = persisted.storageKey;
    persistedCenterId = persisted.centerId;
  } catch (error) {
    if (error instanceof ProfilePhotoScopeError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (storageKey) {
    await deleteChildMediaObject(storageKey).catch((error) => {
      logOperationalError("child.profile_photo.object_cleanup_failed", error, { childId: authorization.child.id, centerId: persistedCenterId });
    });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withApiLogging("api.children.profile-photo.post", POSTHandler);
export const DELETE = withApiLogging("api.children.profile-photo.delete", DELETEHandler);
