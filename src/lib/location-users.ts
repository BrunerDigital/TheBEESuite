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
      select: { user: { select: { id: true, email: true } } },
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
      select: { user: { select: { id: true, email: true } } },
    }),
  ]);

  const usersById = new Map<string, { id: string; email: string }>();
  for (const item of [...grantUsers, ...legacyProfileUsers]) {
    usersById.set(item.user.id, item.user);
  }
  return Array.from(usersById.values());
}
