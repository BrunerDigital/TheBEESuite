import { isParentHistoryId } from "./parent-message-history";

export const PARENT_ANNOUNCEMENT_PAGE_SIZE = 8;
export type ParentAnnouncementView = { id: string; title: string; body: string; sendAt: string | Date | null };
export type ParentAnnouncementPage = { ok: true; familyId: string; requestCursor: string | null; items: ParentAnnouncementView[]; nextCursor: string | null };
export const EMPTY_PARENT_ANNOUNCEMENTS: ParentAnnouncementView[] = [];
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const canonicalDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function parseParentAnnouncementRequest(params: URLSearchParams) {
  if ([...params.keys()].some(key => !["familyId", "cursor"].includes(key) || params.getAll(key).length !== 1)) return null;
  const familyId = params.get("familyId"), cursor = params.get("cursor");
  return isParentHistoryId(familyId) && (cursor === null || isParentHistoryId(cursor)) ? { familyId, cursor } : null;
}
/** Descending published timestamp, null dates last, deterministic ID tie-break. */
export function isEarlierParentAnnouncement(candidate: ParentAnnouncementView, anchor: ParentAnnouncementView) {
  if (candidate.id === anchor.id) return false;
  const time = candidate.sendAt === null ? null : new Date(candidate.sendAt).getTime();
  const anchorTime = anchor.sendAt === null ? null : new Date(anchor.sendAt).getTime();
  if (time !== null && !Number.isFinite(time) || anchorTime !== null && !Number.isFinite(anchorTime)) return false;
  if (anchorTime === null) return time === null && candidate.id < anchor.id;
  return time === null || time < anchorTime || time === anchorTime && candidate.id < anchor.id;
}
export function isParentAnnouncementPage(value: unknown, familyId: string, cursor: string | null): value is ParentAnnouncementPage {
  const page = object(value);
  if (!page || !exactKeys(page, ["ok", "familyId", "requestCursor", "items", "nextCursor"]) || page.ok !== true || page.familyId !== familyId || page.requestCursor !== cursor || !Array.isArray(page.items) || page.items.length > PARENT_ANNOUNCEMENT_PAGE_SIZE || !(page.nextCursor === null || isParentHistoryId(page.nextCursor))) return false;
  const ids = new Set<string>(); let previous: ParentAnnouncementView | null = null;
  for (const raw of page.items) {
    const row = object(raw);
    if (!row || !exactKeys(row, ["id", "title", "body", "sendAt"]) || !isParentHistoryId(row.id) || row.id === cursor || ids.has(row.id) || typeof row.title !== "string" || row.title.length > 1000 || typeof row.body !== "string" || row.body.length > 100000 || !(row.sendAt === null || canonicalDate(row.sendAt))) return false;
    const item = row as ParentAnnouncementView;
    if (previous && !isEarlierParentAnnouncement(item, previous)) return false;
    previous = item; ids.add(item.id);
  }
  return page.nextCursor === null || page.items.length === PARENT_ANNOUNCEMENT_PAGE_SIZE && page.nextCursor === page.items.at(-1)?.id && page.nextCursor !== cursor;
}
export function appendEarlierParentAnnouncements(current: ParentAnnouncementView[], earlier: ParentAnnouncementView[]) {
  const ids = new Set(current.map(item => item.id));
  return [...current, ...earlier.filter(item => !ids.has(item.id))];
}
