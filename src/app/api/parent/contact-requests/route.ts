import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json();
  const familyId = clean(body.familyId);
  const requestType = clean(body.requestType) || "Contact update";
  const details = clean(body.details);

  if (!familyId || !details) {
    return NextResponse.json({ ok: false, error: "Family ID and details are required." }, { status: 400 });
  }

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { guardians: { select: { userId: true } } },
  });
  if (!family) {
    return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });
  }

  const isGuardian = family.guardians.some((guardian) => guardian.userId === user.id);
  const hasCenterAccess = canAccessAllCenters(user) || !family.centerId || user.centerIds.includes(family.centerId);
  if (!isGuardian && !hasCenterAccess) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
  }

  const note = await prisma.note.create({
    data: {
      familyId,
      userId: user.id,
      body: `${requestType} request: ${details}`,
      restricted: true,
    },
  });

  const directors = family.centerId
    ? await getCenterLeadershipUsers({
        centerId: family.centerId,
        roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
      })
    : [];

  await Promise.all(
    directors.map((director) =>
      prisma.notification.create({
        data: {
          userId: director.id,
          title: `${requestType} request`,
          body: `${family.name}: ${details}`,
          type: "parent_request",
          priority: "high",
        },
      }),
    ),
  );

  await writeAuditLog(user, {
    centerId: family.centerId,
    action: "parent.contact_update.requested",
    resource: "Family",
    resourceId: familyId,
    metadata: {
      noteId: note.id,
      requestType,
    },
  });

  return NextResponse.json({ ok: true, note }, { status: 201 });
}
