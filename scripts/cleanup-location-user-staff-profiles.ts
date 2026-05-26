import "./load-env";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const locationUserRoles = [
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
];

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "unknown";
  return `${name.slice(0, 2)}***@${domain}`;
}

async function ensureCenterGrant(profile: Awaited<ReturnType<typeof getTargetProfiles>>[number], apply: boolean) {
  const tenantId = profile.center.organization.tenantId;
  const organizationId = profile.center.organizationId;
  const brandId = profile.center.organization.brandId ?? null;
  const ownerGroupId = profile.center.ownerGroupId ?? null;

  const existing = await prisma.userAccessGrant.findFirst({
    where: {
      userId: profile.userId,
      centerId: profile.centerId,
      role: profile.user.role,
      scopeType: "CENTER",
    },
    select: { id: true, isActive: true },
  });

  if (!apply) {
    return existing ? "existing" : "would_create";
  }

  const permissions = {
    source: "cleanup_location_user_staff_profiles",
    migratedFromStaffProfileId: profile.id,
    migratedFromStaffProfileTitle: profile.title,
    migratedAt: new Date().toISOString(),
  };

  if (existing) {
    if (!existing.isActive) {
      await prisma.userAccessGrant.update({
        where: { id: existing.id },
        data: {
          tenantId,
          organizationId,
          brandId,
          ownerGroupId,
          centerId: profile.centerId,
          role: profile.user.role,
          scopeType: "CENTER",
          permissions,
          isActive: true,
        },
      });
      return "activated";
    }
    return "existing";
  }

  await prisma.userAccessGrant.create({
    data: {
      userId: profile.userId,
      tenantId,
      organizationId,
      brandId,
      ownerGroupId,
      centerId: profile.centerId,
      role: profile.user.role,
      scopeType: "CENTER",
      permissions,
      isActive: true,
    },
  });
  return "created";
}

function getTargetProfiles() {
  return prisma.staffProfile.findMany({
    where: {
      user: {
        role: { in: locationUserRoles },
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          tenantId: true,
        },
      },
      center: {
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          crmLocationId: true,
          locationId: true,
          organizationId: true,
          ownerGroupId: true,
          organization: {
            select: {
              tenantId: true,
              brandId: true,
            },
          },
        },
      },
      _count: {
        select: {
          schedules: true,
          certifications: true,
        },
      },
    },
    orderBy: [{ center: { state: "asc" } }, { center: { city: "asc" } }, { user: { email: "asc" } }],
  });
}

async function main() {
  const apply = hasFlag("--apply");
  const profiles = await getTargetProfiles();
  const otherNonTeacherProfiles = await prisma.staffProfile.count({
    where: {
      user: {
        role: { not: UserRole.TEACHER },
      },
      NOT: {
        user: {
          role: { in: locationUserRoles },
        },
      },
    },
  });

  const grantStatuses = new Map<string, number>();
  let schedulesDeleted = 0;
  let certificationsDeleted = 0;
  let staffProfilesDeleted = 0;

  for (const profile of profiles) {
    const status = await ensureCenterGrant(profile, apply);
    grantStatuses.set(status, (grantStatuses.get(status) ?? 0) + 1);

    if (!apply) continue;

    const [scheduleResult, certificationResult] = await prisma.$transaction([
      prisma.staffSchedule.deleteMany({ where: { staffId: profile.id } }),
      prisma.certification.deleteMany({ where: { staffId: profile.id } }),
    ]);
    schedulesDeleted += scheduleResult.count;
    certificationsDeleted += certificationResult.count;

    await prisma.staffProfile.delete({ where: { id: profile.id } });
    staffProfilesDeleted += 1;
  }

  const teacherStaffProfiles = await prisma.staffProfile.count({
    where: { user: { role: UserRole.TEACHER } },
  });
  const remainingLocationUserStaffProfiles = apply
    ? await prisma.staffProfile.count({
        where: { user: { role: { in: locationUserRoles } } },
      })
    : profiles.length;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        targetLocationUserStaffProfiles: profiles.length,
        grantStatuses: Object.fromEntries(grantStatuses.entries()),
        dependentRows: {
          schedules: profiles.reduce((total, profile) => total + profile._count.schedules, 0),
          certifications: profiles.reduce((total, profile) => total + profile._count.certifications, 0),
        },
        deleted: {
          staffProfiles: staffProfilesDeleted,
          schedules: schedulesDeleted,
          certifications: certificationsDeleted,
        },
        remaining: {
          locationUserStaffProfiles: remainingLocationUserStaffProfiles,
          teacherStaffProfiles,
          otherNonTeacherStaffProfiles: otherNonTeacherProfiles,
        },
        sample: profiles.slice(0, 5).map((profile) => ({
          email: maskEmail(profile.user.email),
          role: profile.user.role,
          center: `${profile.center.city ?? ""}, ${profile.center.state ?? ""}`.trim(),
          centerName: profile.center.name,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
