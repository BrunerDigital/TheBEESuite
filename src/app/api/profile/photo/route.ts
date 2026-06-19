import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  contentTypeForProfilePhotoFile,
  mergeProfilePhotoCustomFields,
  validateProfilePhotoFile,
} from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
import { isSupabaseStorageConfigured, uploadProfilePhotoBuffer } from "@/lib/supabase-storage";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
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
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Profile photo could not be uploaded." },
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

  await prisma.user.update({
    where: { id: user.id },
    data: {
      customFields: mergeProfilePhotoCustomFields(existingUser.customFields, profilePhoto) as Prisma.InputJsonValue,
    },
  });

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
