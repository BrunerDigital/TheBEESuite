import { UserRole } from "@prisma/client";
import {
  appReviewCenterScopeSelect,
  appReviewCenterScopeViolation,
  appReviewClassroomRosterSelect,
  appReviewClassroomScopeViolation,
  appReviewFamilyScopeSelect,
  appReviewFamilyScopeViolation,
  appReviewIdentityKind,
  appReviewReservedIdentityKind,
  appReviewTeacherStaffMarkerIsValid,
} from "@/lib/app-review-targeting";
import { prisma } from "@/lib/prisma";

type RuntimeReviewUser = {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  organizationId: string | null;
  customFields: unknown;
  assignedClassroomId: string | null;
};

function hasExactReviewGrant(
  grants: Array<{
    tenantId: string;
    organizationId: string | null;
    centerId: string | null;
    role: UserRole;
    scopeType: string;
    startsAt: Date | null;
    endsAt: Date | null;
  }>,
  input: RuntimeReviewUser,
  center: { id: string; organizationId: string },
) {
  return grants.length === 1
    && grants[0].tenantId === input.tenantId
    && grants[0].organizationId === center.organizationId
    && grants[0].centerId === center.id
    && grants[0].role === input.role
    && grants[0].scopeType === "CENTER"
    && grants[0].startsAt === null
    && grants[0].endsAt === null;
}

export async function appReviewRuntimeScopeIsValid(input: RuntimeReviewUser) {
  const reservedKind = appReviewReservedIdentityKind(input.email);
  if (!reservedKind) return true;
  if (appReviewIdentityKind(input) !== reservedKind) return false;

  try {
    const activeGrants = await prisma.userAccessGrant.findMany({
      where: { userId: input.id, isActive: true },
      select: {
        tenantId: true,
        organizationId: true,
        centerId: true,
        role: true,
        scopeType: true,
        startsAt: true,
        endsAt: true,
      },
      take: 2,
    });

    if (reservedKind === "parent") {
      const guardianLinks = await prisma.guardian.findMany({
        where: { userId: input.id },
        select: {
          id: true,
          familyId: true,
          family: { select: appReviewFamilyScopeSelect },
        },
        take: 2,
      });
      if (guardianLinks.length !== 1) return false;
      const family = guardianLinks[0].family;
      if (!family.centerId || guardianLinks[0].familyId !== family.id) return false;
      const center = await prisma.center.findUnique({
        where: { id: family.centerId },
        select: appReviewCenterScopeSelect,
      });
      return Boolean(
        center
        && input.role === UserRole.PARENT_GUARDIAN
        && input.organizationId === center.organizationId
        && hasExactReviewGrant(activeGrants, input, center)
        && !appReviewCenterScopeViolation({ center, tenantId: input.tenantId })
        && !appReviewFamilyScopeViolation({ family, centerId: center.id, tenantId: input.tenantId }),
      );
    }

    const profile = await prisma.staffProfile.findUnique({
      where: { userId: input.id },
      select: {
        centerId: true,
        classroomId: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        classroom: { select: appReviewClassroomRosterSelect },
        center: { select: appReviewCenterScopeSelect },
      },
    });
    return Boolean(
      profile?.classroom
      && input.role === UserRole.TEACHER
      && input.organizationId === profile.center.organizationId
      && appReviewTeacherStaffMarkerIsValid(profile)
      && input.assignedClassroomId === profile.classroom.id
      && profile.classroomId === profile.classroom.id
      && profile.centerId === profile.center.id
      && hasExactReviewGrant(activeGrants, input, profile.center)
      && !appReviewCenterScopeViolation({ center: profile.center, tenantId: input.tenantId })
      && !appReviewClassroomScopeViolation({
        classroom: profile.classroom,
        centerId: profile.center.id,
        tenantId: input.tenantId,
      }),
    );
  } catch {
    return false;
  }
}
