import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";
import { hashStaffPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { readStaffKioskPinHash, staffKioskPinFields } from "@/lib/staff-kiosk";
import {
  normalizeTeacherProfileSetupPayload,
  teacherProfileSetupCustomFields,
} from "@/lib/teacher-profile-setup";

export const runtime = "nodejs";

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== UserRole.TEACHER) {
    return NextResponse.json({ ok: false, error: "Only teacher accounts can complete teacher profile setup." }, { status: 403 });
  }

  const existingProfile = await prisma.staffProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      centerId: true,
      classroomId: true,
      customFields: true,
    },
  });
  const centerId = existingProfile?.centerId ?? user.primaryCenterId;
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "A school assignment is required before profile setup." }, { status: 400 });
  }
  if (!canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 });
  }

  const [center, classrooms] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId }, select: { id: true, organizationId: true } }),
    prisma.classroom.findMany({ where: { centerId }, select: { id: true }, take: 200 }),
  ]);
  if (!center) {
    return NextResponse.json({ ok: false, error: "Assigned school was not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const normalized = normalizeTeacherProfileSetupPayload(body, {
    allowedClassroomIds: classrooms.map((classroom) => classroom.id),
  });
  if (!normalized.ok) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  }

  const input = normalized.input;
  const updatedAt = new Date();
  const classroomId = input.classroomId ?? existingProfile?.classroomId ?? null;
  const record = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        role: UserRole.TEACHER,
        isActive: true,
        organizationId: center.organizationId,
      },
    });

    const customFields = teacherProfileSetupCustomFields({
      customFields: existingProfile?.customFields,
      input,
      updatedAt,
      updatedById: user.id,
    });

    const savedProfile = existingProfile
      ? await tx.staffProfile.update({
          where: { id: existingProfile.id },
          data: {
            classroomId,
            title: input.title,
            phone: input.phone,
            customFields,
          },
          select: { id: true, centerId: true, classroomId: true, title: true, phone: true, customFields: true },
        })
      : await tx.staffProfile.create({
          data: {
            userId: user.id,
            centerId: center.id,
            classroomId,
            title: input.title,
            phone: input.phone,
            backgroundCheckStatus: "pending",
            customFields,
          },
          select: { id: true, centerId: true, classroomId: true, title: true, phone: true, customFields: true },
        });

    if (!input.staffKioskPin) return savedProfile;

    return tx.staffProfile.update({
      where: { id: savedProfile.id },
      data: {
        customFields: staffKioskPinFields({
          customFields: savedProfile.customFields,
          pinHash: hashStaffPin(savedProfile.id, input.staffKioskPin),
          pinSetAt: updatedAt,
          pinSetById: user.id,
        }),
      },
      select: { id: true, centerId: true, classroomId: true, title: true, phone: true, customFields: true },
    });
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "teacher.profile_setup.updated",
    resource: "StaffProfile",
    resourceId: record.id,
    metadata: {
      mode: existingProfile ? "updated" : "created",
      classroomId: record.classroomId,
      contactEmailCaptured: Boolean(input.contactEmail),
      staffKioskCodeSet: Boolean(input.staffKioskPin),
    },
  });

  return NextResponse.json({
    ok: true,
    mode: existingProfile ? "updated" : "created",
    profile: {
      id: record.id,
      name: input.name,
      contactEmail: input.contactEmail,
      phone: record.phone,
      title: record.title,
      centerId: record.centerId,
      classroomId: record.classroomId,
      hasStaffKioskCode: Boolean(readStaffKioskPinHash(record.customFields)),
    },
  });
}

export const POST = withApiLogging("POST", POSTHandler);
