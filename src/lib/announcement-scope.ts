import type { Prisma, UserRole } from "@prisma/client";

export function canWriteCenterlessAnnouncement(role: UserRole) {
  return role === "PLATFORM_OWNER";
}

export function announcementWhereForViewer(input: {
  role: UserRole;
  allCenters: boolean;
  centerIds: readonly string[];
}): Prisma.AnnouncementWhereInput {
  if (input.role === "PLATFORM_OWNER" && input.allCenters) return {};
  return {
    OR: [
      { centerId: { in: [...input.centerIds] } },
      { centerId: null },
    ],
  };
}
