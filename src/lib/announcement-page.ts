import type { Prisma } from "@prisma/client";
import { recordPagination } from "./record-pagination";
import { announcementRecordSelect } from "./announcement-persistence";
export function announcementPageHref(page: number) { return page > 1 ? `/announcements?page=${page}` : "/announcements"; }
export async function readAnnouncementPage(database: Pick<Prisma.TransactionClient, "announcement">, where: Prisma.AnnouncementWhereInput, requestedPage: unknown) {
  const total = await database.announcement.count({ where });
  const pagination = recordPagination(requestedPage, total, 50);
  const announcements = await database.announcement.findMany({ where, orderBy: [{ sendAt: "desc" }, { title: "asc" }, { id: "asc" }], skip: pagination.skip, take: pagination.pageSize,
    select: { ...announcementRecordSelect, center: { select: { name: true, crmLocationId: true } } } });
  return { announcements, pagination: { ...pagination, previousHref: pagination.page > 1 ? announcementPageHref(pagination.page - 1) : null, nextHref: pagination.page < pagination.totalPages ? announcementPageHref(pagination.page + 1) : null } };
}
