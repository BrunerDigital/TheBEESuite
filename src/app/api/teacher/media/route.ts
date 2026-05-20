import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createChildMediaSignedUrl, uploadChildMediaBuffer } from "@/lib/supabase-storage";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageClassroomTasks(user)) {
    return NextResponse.json({ ok: false, error: "Photo sharing is not allowed for this role." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  let childId = "";
  let caption = "";
  let photoUrl = "";
  let dailyReportId: string | null = null;
  let sharedWithParents = true;
  let storageKey: string | null = null;
  let uploadedFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    childId = clean(formData.get("childId"));
    caption = clean(formData.get("caption"));
    dailyReportId = clean(formData.get("dailyReportId")) || null;
    sharedWithParents = formData.get("sharedWithParents") !== "false";
    const file = formData.get("photo");
    if (file instanceof File && file.size > 0) {
      uploadedFile = file;
    } else {
      photoUrl = clean(formData.get("photoUrl"));
    }
  } else {
    const body = await request.json().catch(() => ({}));
    childId = clean(body.childId);
    caption = clean(body.caption);
    photoUrl = clean(body.photoUrl);
    dailyReportId = clean(body.dailyReportId) || null;
    sharedWithParents = body.sharedWithParents !== false;
  }

  if (!childId || (!uploadedFile && !photoUrl)) {
    return NextResponse.json({ ok: false, error: "Child and photo are required." }, { status: 400 });
  }
  if (photoUrl.startsWith("data:")) {
    return NextResponse.json({ ok: false, error: "Inline image data is no longer accepted. Upload a photo file so it can be stored securely." }, { status: 400 });
  }
  if (photoUrl && !/^https:\/\//i.test(photoUrl)) {
    return NextResponse.json({ ok: false, error: "Photo URL must use HTTPS." }, { status: 400 });
  }

  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      classroom: { select: { id: true, centerId: true } },
      family: { select: { centerId: true } },
    },
  });
  if (!child) {
    return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
  }

  const centerId = child.classroom?.centerId ?? child.family.centerId;
  if (centerId && !canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this child." }, { status: 403 });
  }

  if (uploadedFile) {
    const bytes = Buffer.from(await uploadedFile.arrayBuffer());
    try {
      const upload = await uploadChildMediaBuffer({
        bytes,
        contentType: uploadedFile.type || "image/jpeg",
        originalName: uploadedFile.name,
        tenantId: user.tenantId,
        centerId,
        classroomId: child.classroom?.id ?? null,
        childId,
      });
      photoUrl = upload.recordUrl;
      storageKey = upload.storageKey;
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Photo could not be uploaded to secure storage." },
        { status: 502 },
      );
    }
  }

  const canShareWithParents = sharedWithParents && child.photoVideoPermission;
  const media = await prisma.childMedia.create({
    data: {
      childId,
      classroomId: child.classroom?.id ?? null,
      uploadedById: user.id,
      dailyReportId,
      url: photoUrl,
      storageKey,
      caption: caption || null,
      sharedWithParents: canShareWithParents,
      status: canShareWithParents ? "shared" : sharedWithParents ? "permission_review" : "draft",
    },
    include: { child: { select: { fullName: true } } },
  });
  const responseMedia = storageKey ? { ...media, url: await createChildMediaSignedUrl(storageKey).catch(() => media.url) } : media;

  await writeAuditLog(user, {
    centerId,
    action: "teacher.media.created",
    resource: "ChildMedia",
    resourceId: media.id,
    metadata: {
      childId,
      requestedParentShare: sharedWithParents,
      sharedWithParents: canShareWithParents,
      photoVideoPermission: child.photoVideoPermission,
      storageProvider: storageKey ? "supabase" : "external_url",
    },
  });

  return NextResponse.json(
    {
      ok: true,
      media: responseMedia,
      warning: sharedWithParents && !child.photoVideoPermission
        ? "Photo saved for director review. It is not visible to parents because photo/video permission is not enabled for this child."
        : undefined,
    },
    { status: 201 },
  );
}
