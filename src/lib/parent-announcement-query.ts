import type { Prisma } from "@prisma/client";
import { parentAnnouncementAudienceWhere } from "./announcement-scope";
import { PARENT_ANNOUNCEMENT_PAGE_SIZE, type ParentAnnouncementPage } from "./parent-announcement-history";

export const parentAnnouncementSelect = { id: true, title: true, body: true, sendAt: true } satisfies Prisma.AnnouncementSelect;
export const parentAnnouncementOrder = [{ sendAt: { sort: "desc", nulls: "last" } }, { id: "desc" }] satisfies Prisma.AnnouncementOrderByWithRelationInput[];
export function parentAnnouncementWhere(centerId: string): Prisma.AnnouncementWhereInput {
  return { AND: [{ OR: [{ centerId }, { centerId: null }] }, { status: { in: ["active", "sent", "published"] } }, parentAnnouncementAudienceWhere()] };
}
/** Caller proves current-family/tenant/single-school context inside the same snapshot. */
export async function readParentAnnouncementRows(db: Pick<Prisma.TransactionClient, "announcement">, context: { familyId: string; centerId: string }, cursor: string | null, suppressAppReview = false): Promise<ParentAnnouncementPage | null> {
  const envelope = { ok: true as const, familyId: context.familyId, requestCursor: cursor };
  // Reserved reviewers must never see real school or centerless platform notices.
  if (suppressAppReview) return cursor ? null : { ...envelope, items: [], nextCursor: null };
  const where = parentAnnouncementWhere(context.centerId);
  const anchor = cursor ? await db.announcement.findFirst({ where: { AND: [where, { id: cursor }] }, select: { id: true, sendAt: true } }) : null;
  if (cursor && !anchor) return null;
  const earlier: Prisma.AnnouncementWhereInput | null = !anchor ? null : anchor.sendAt === null
    ? { sendAt: null, id: { lt: anchor.id } }
    : { OR: [{ sendAt: { lt: anchor.sendAt } }, { sendAt: anchor.sendAt, id: { lt: anchor.id } }, { sendAt: null }] };
  const rows = await db.announcement.findMany({ where: { AND: [where, ...(earlier ? [earlier] : [])] }, orderBy: parentAnnouncementOrder, select: parentAnnouncementSelect, take: PARENT_ANNOUNCEMENT_PAGE_SIZE + 1 });
  const items = rows.slice(0, PARENT_ANNOUNCEMENT_PAGE_SIZE);
  return { ...envelope, items, nextCursor: rows.length > PARENT_ANNOUNCEMENT_PAGE_SIZE ? items.at(-1)!.id : null };
}
