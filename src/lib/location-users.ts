import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const defaultLeadershipRoles = [
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
];

export async function getCenterLeadershipUsers({
  centerId,
  excludeUserId,
  roles = defaultLeadershipRoles,
}: {
  centerId: string;
  excludeUserId?: string;
  roles?: UserRole[];
}) {
  const [grantUsers, legacyProfileUsers] = await Promise.all([
    prisma.userAccessGrant.findMany({
      where: {
        centerId,
        isActive: true,
        role: { in: roles },
        user: {
          isActive: true,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
      },
      select: { role: true, user: { select: { id: true, email: true, role: true, staffProfile: { select: { phone: true } } } } },
    }),
    prisma.staffProfile.findMany({
      where: {
        centerId,
        user: {
          isActive: true,
          role: { in: roles },
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
      },
      select: { user: { select: { id: true, email: true, role: true, staffProfile: { select: { phone: true } } } } },
    }),
  ]);

  const usersById = new Map<string, { id: string; email: string; role: UserRole; phone: string | null }>();
  for (const item of grantUsers) {
    usersById.set(item.user.id, {
      id: item.user.id,
      email: item.user.email,
      role: item.role,
      phone: item.user.staffProfile?.phone ?? null,
    });
  }
  for (const item of legacyProfileUsers) {
    if (usersById.has(item.user.id)) continue;
    usersById.set(item.user.id, {
      id: item.user.id,
      email: item.user.email,
      role: item.user.role,
      phone: item.user.staffProfile?.phone ?? null,
    });
  }
  return Array.from(usersById.values());
}
