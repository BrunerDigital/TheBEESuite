import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { custodyWarningSummary, hasCustodyWarning } from "@/lib/custody-visibility";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { validateDailyReportMediaLink, validateMediaUploadInput } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import { createChildMediaSignedUrl, uploadChildMediaBuffer } from "@/lib/supabase-storage";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
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

  if (!childId) {
    return NextResponse.json({ ok: false, error: "Child and photo are required." }, { status: 400 });
  }
  const uploadGuard = validateMediaUploadInput({ hasUploadedFile: Boolean(uploadedFile), photoUrl });
  if (!uploadGuard.ok) {
    return NextResponse.json({ ok: false, error: uploadGuard.error }, { status: uploadGuard.status });
  }

  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      classroom: { select: { id: true, centerId: true } },
      family: { select: { centerId: true, custodyNotes: true } },
    },
  });
  if (!child) {
    return NextResponse.json({ ok: false, error: "Child not found." }, { status: 404 });
  }

  const centerId = child.classroom?.centerId ?? child.family.centerId;
  const accessGuard = centerScopedAccessGuard({
    centerId,
    hasTenantWideAccess: canAccessAllCenters(user),
    hasCenterAccess: Boolean(centerId && canAccessCenter(user, centerId)),
    resourceLabel: "Child",
  });
  if (!accessGuard.ok) {
    return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
  }

  if (dailyReportId) {
    const dailyReport = await prisma.dailyReport.findUnique({
      where: { id: dailyReportId },
      select: { childId: true },
    });
    const guard = validateDailyReportMediaLink({
      dailyReportChildId: dailyReport?.childId ?? null,
      childId,
    });
    if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
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

  if (sharedWithParents && !child.photoVideoPermission && centerId) {
    const directors = await getCenterLeadershipUsers({
      centerId,
      excludeUserId: user.id,
      roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
    });
    await Promise.all(
      directors.map((director) =>
        prisma.notification.create({
          data: {
            userId: director.id,
            title: "Photo needs parent permission review",
            body: `${child.fullName}'s photo is held until photo/video permission is confirmed.`,
            type: "parent_media",
            priority: "high",
          },
        }),
      ),
    );
  }

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
      custodyWarning: hasCustodyWarning(child.family),
    },
  });

  const custodyWarning = custodyWarningSummary(child.family);
  return NextResponse.json(
    {
      ok: true,
      media: responseMedia,
      warning: sharedWithParents && !child.photoVideoPermission
        ? "Photo saved for director review. It is not visible to parents because photo/video permission is not enabled for this child."
        : undefined,
      custodyWarning,
    },
    { status: 201 },
  );
}

export const POST = withApiLogging("POST", POSTHandler);
