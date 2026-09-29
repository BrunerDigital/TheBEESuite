import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  contentTypeForProfilePhotoFile,
  mergeProfilePhotoCustomFields,
  validateProfilePhotoFile,
} from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
import { getSupabaseStorageClient, isSupabaseStorageConfigured, uploadProfilePhotoBuffer } from "@/lib/supabase-storage";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (appReviewReservedIdentityKind(user.email)) {
    return NextResponse.json(
      { ok: false, error: "Profile-photo changes are disabled for the shared App Review account." },
      { status: 403 },
    );
  }

  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Secure image storage is not configured yet." },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "Choose a profile photo before uploading." }, { status: 400 });
  }

  const contentType = contentTypeForProfilePhotoFile({ type: file.type, name: file.name });
  const guard = validateProfilePhotoFile({ size: file.size, contentType });
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { customFields: true },
  });
  if (!existingUser) {
    return NextResponse.json({ ok: false, error: "Profile not found." }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let upload;
  try {
    upload = await uploadProfilePhotoBuffer({
      bytes,
      contentType,
      originalName: file.name,
      tenantId: user.tenantId,
      userId: user.id,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We couldn't upload your profile photo. Try again." },
      { status: 502 },
    );
  }

  const profilePhoto = {
    url: upload.recordUrl,
    bucket: upload.bucket,
    storageKey: upload.storageKey,
    contentType,
    uploadedAt: new Date().toISOString(),
  };

  const saved = await prisma.$transaction(async tx => {
    // Serialize the profile write with account cleanup after the external upload.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} AND "tenantId" = ${user.identityTenantId} FOR UPDATE`;
    const current = await tx.user.findFirst({ where: { id: user.id, tenantId: user.identityTenantId, isActive: true }, select: { customFields: true } });
    const deletion = await tx.dataDeletionRequest.findFirst({ where: { userId: user.id, status: { in: ["executing", "partially_completed", "completed"] } }, select: { id: true } });
    if (!current || deletion) return false;
    await tx.user.update({ where: { id: user.id }, data: { customFields: mergeProfilePhotoCustomFields(current.customFields, profilePhoto) as Prisma.InputJsonValue } });
    return true;
  });
  if (!saved) {
    const { error } = await getSupabaseStorageClient().storage.from(upload.bucket).remove([upload.storageKey]);
    if (error) throw new Error("An interrupted profile upload needs storage cleanup.");
    return NextResponse.json({ ok: false, error: "Your account is being deleted. This profile photo was not saved." }, { status: 409 });
  }

  await writeAuditLog(user, {
    action: "user.profile_photo.updated",
    resource: "User",
    resourceId: user.id,
    metadata: {
      storageProvider: "supabase",
      bucket: upload.bucket,
      contentType,
    },
  });

  return NextResponse.json({
    ok: true,
    profilePhotoUrl: upload.signedUrl,
    profilePhotoStorageKey: upload.storageKey,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
