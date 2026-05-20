import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageClassroomTasks, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function fileToDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Only image uploads are supported.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Photo must be 3MB or smaller.");
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${bytes.toString("base64")}`;
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

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    childId = clean(formData.get("childId"));
    caption = clean(formData.get("caption"));
    dailyReportId = clean(formData.get("dailyReportId")) || null;
    sharedWithParents = formData.get("sharedWithParents") !== "false";
    const file = formData.get("photo");
    if (file instanceof File && file.size > 0) {
      photoUrl = await fileToDataUrl(file);
      storageKey = `inline-demo-upload:${file.name}`;
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

  if (!childId || !photoUrl) {
    return NextResponse.json({ ok: false, error: "Child and photo are required." }, { status: 400 });
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

  const media = await prisma.childMedia.create({
    data: {
      childId,
      classroomId: child.classroom?.id ?? null,
      uploadedById: user.id,
      dailyReportId,
      url: photoUrl,
      storageKey,
      caption: caption || null,
      sharedWithParents,
      status: sharedWithParents ? "shared" : "draft",
    },
    include: { child: { select: { fullName: true } } },
  });

  await writeAuditLog(user, {
    centerId,
    action: "teacher.media.created",
    resource: "ChildMedia",
    resourceId: media.id,
    metadata: {
      childId,
      sharedWithParents,
      inlineStorage: Boolean(storageKey?.startsWith("inline-demo-upload")),
    },
  });

  return NextResponse.json({ ok: true, media }, { status: 201 });
}
