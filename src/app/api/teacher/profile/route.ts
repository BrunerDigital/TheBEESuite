import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";
import { activeClassroomWhere } from "@/lib/classroom-status";
import { hashStaffPin } from "@/lib/kiosk";
import { prisma } from "@/lib/prisma";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { withApiLogging } from "@/lib/request-response-logging";
import { readStaffKioskPinHash, staffKioskPinFields } from "@/lib/staff-kiosk";
import { normalizeTeacherProfileSetupPayload, teacherProfileSetupCustomFields } from "@/lib/teacher-profile-setup";

export const runtime = "nodejs";

const profileSelect = { id: true, centerId: true, classroomId: true, title: true, phone: true, customFields: true } satisfies Prisma.StaffProfileSelect;
class TeacherProfileConflict extends Error {}

async function POSTHandler(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (user.role !== UserRole.TEACHER) return NextResponse.json({ ok: false, error: "Only teacher accounts can complete teacher profile setup." }, { status: 403 });
  if (appReviewReservedIdentityKind(user.email)) {
    return NextResponse.json({ ok: false, error: "Profile and staff kiosk-code changes are disabled for the shared App Review account." }, { status: 403 });
  }
  const existingProfile = await prisma.staffProfile.findUnique({ where: { userId: user.id }, select: profileSelect });
  const centerId = existingProfile?.centerId ?? user.primaryCenterId;
  if (!centerId) return NextResponse.json({ ok: false, error: "A school assignment is required before profile setup." }, { status: 400 });
  if (!canAccessCenter(user, centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 });
  const center = await prisma.center.findFirst({ where: { id: centerId, organization: { tenantId: user.tenantId } }, select: { id: true, organizationId: true } });
  if (!center) return NextResponse.json({ ok: false, error: "Assigned school was not found." }, { status: 404 });
  const normalized = normalizeTeacherProfileSetupPayload(await request.json().catch(() => null));
  if (!normalized.ok) return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  const input = normalized.input;

  try {
    const record = await prisma.$transaction(async (tx) => {
      const currentActor = await tx.user.findFirst({
        where: { id: user.id, tenantId: user.tenantId, email: user.email, role: UserRole.TEACHER, isActive: true, organizationId: user.organizationId, name: user.name },
        select: { id: true, updatedAt: true },
      });
      const currentCenter = await tx.center.findFirst({ where: { id: center.id, organizationId: center.organizationId, organization: { tenantId: user.tenantId } }, select: { id: true } });
      const currentProfile = await tx.staffProfile.findUnique({ where: { userId: user.id }, select: profileSelect });
      if (!currentActor || !currentCenter || (existingProfile
        ? !currentProfile || currentProfile.id !== existingProfile.id || currentProfile.centerId !== center.id || currentProfile.classroomId !== existingProfile.classroomId || currentProfile.title !== existingProfile.title || currentProfile.phone !== existingProfile.phone
        : currentProfile !== null)) throw new TeacherProfileConflict();

      // A retained StaffProfile already grants its exact school. Bootstrapping a
      // new one requires fresh exact-school teacher authority, not a cached ID.
      if (!currentProfile) {
        const at = new Date();
        const grant = await tx.userAccessGrant.findFirst({ where: {
          userId: user.id, tenantId: user.tenantId, role: UserRole.TEACHER, scopeType: "CENTER", centerId: center.id, isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
            { OR: [{ organizationId: null }, { organizationId: center.organizationId }] },
          ],
        }, select: { id: true } });
        if (!grant) throw new TeacherProfileConflict();
      }
      if (currentProfile?.classroomId && input.classroomId && currentProfile.classroomId !== input.classroomId) throw new TeacherProfileConflict();
      const classroomId = input.classroomId ?? currentProfile?.classroomId ?? null;
      if (classroomId) {
        const roomScope = { id: classroomId, centerId: center.id, center: { organization: { tenantId: user.tenantId } } };
        const classroom = await tx.classroom.findFirst({ where: currentProfile?.classroomId === classroomId ? roomScope : activeClassroomWhere(roomScope), select: { id: true } });
        if (!classroom) throw new TeacherProfileConflict();
      }
      const nameUpdate = await tx.user.updateMany({
        where: { id: currentActor.id, tenantId: user.tenantId, email: user.email, role: UserRole.TEACHER, isActive: true, organizationId: user.organizationId, updatedAt: currentActor.updatedAt },
        data: { name: input.name },
      });
      if (nameUpdate.count !== 1) throw new TeacherProfileConflict();
      const updatedAt = new Date();
      let customFields = teacherProfileSetupCustomFields({ customFields: currentProfile?.customFields, input, updatedAt, updatedById: user.id });
      if (currentProfile && input.staffKioskPin) customFields = staffKioskPinFields({ customFields, pinHash: hashStaffPin(currentProfile.id, input.staffKioskPin), pinSetAt: updatedAt, pinSetById: user.id });
      const data = { classroomId, title: input.title, phone: input.phone, customFields };
      let savedProfile;
      if (currentProfile) {
        const mutation = await tx.staffProfile.updateMany({ where: {
          id: currentProfile.id, userId: user.id, centerId: center.id, classroomId: currentProfile.classroomId, title: currentProfile.title, phone: currentProfile.phone,
          customFields: { equals: currentProfile.customFields ?? Prisma.AnyNull },
        }, data });
        if (mutation.count !== 1) throw new TeacherProfileConflict();
        savedProfile = { id: currentProfile.id, centerId: center.id, ...data };
      } else {
        savedProfile = await tx.staffProfile.create({ data: { ...data, userId: user.id, centerId: center.id, backgroundCheckStatus: "pending" }, select: profileSelect });
        if (input.staffKioskPin) savedProfile = await tx.staffProfile.update({ where: { id: savedProfile.id }, data: {
          customFields: staffKioskPinFields({ customFields: savedProfile.customFields, pinHash: hashStaffPin(savedProfile.id, input.staffKioskPin), pinSetAt: updatedAt, pinSetById: user.id }),
        }, select: profileSelect });
      }
      await writeAuditLog(user, { centerId: center.id, action: "teacher.profile_setup.updated", resource: "StaffProfile", resourceId: savedProfile.id, metadata: {
        mode: existingProfile ? "updated" : "created", classroomId: savedProfile.classroomId, contactEmailCaptured: Boolean(input.contactEmail), staffKioskCodeSet: Boolean(input.staffKioskPin),
      } }, tx);
      return savedProfile;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true, mode: existingProfile ? "updated" : "created", profile: {
      id: record.id, name: input.name, contactEmail: input.contactEmail, phone: record.phone, title: record.title, centerId: record.centerId,
      classroomId: record.classroomId, hasStaffKioskCode: Boolean(readStaffKioskPinHash(record.customFields)),
    } });
  } catch (error) {
    if (error instanceof TeacherProfileConflict || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code))) {
      return NextResponse.json({ ok: false, error: "Your profile or school assignment changed. Reload to review the saved profile before trying again." }, { status: 409 });
    }
    throw error;
  }
}

export const POST = withApiLogging("POST", POSTHandler);
