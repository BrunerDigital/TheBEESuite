import { Prisma, type UserRole } from "@prisma/client";
import { legacyParentAudienceLabels } from "./announcement-workflow";

/** Unknown or targeted audience JSON must not become a school-wide broadcast. */
export function parentAnnouncementAudienceWhere(): Prisma.AnnouncementWhereInput {
  return { OR: [{ audience: { equals: Prisma.AnyNull } }, ...legacyParentAudienceLabels.map(label => ({ audience: { equals: { label } } }))] };
}

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
