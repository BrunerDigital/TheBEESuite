import type { MessageAttachmentView } from "./message-attachments";

export const PARENT_MESSAGE_PAGE_SIZE = 20;
export type ParentMessageView = {
  id: string; subject: string | null; body: string; createdAt: string | Date;
  sender?: { name: string } | null; isFromFamily?: boolean; canReport?: boolean;
  attachments?: MessageAttachmentView[];
};
export type ParentMessagePage = {
  ok: true; familyId: string; requestCursor: string | null;
  items: ParentMessageView[]; nextCursor: string | null;
};
export function isParentHistoryId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,191}$/.test(value);
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function safeMessageDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
/** A successful HTTP response alone is not a correlated, complete history receipt. */
export function isParentMessagePage(value: unknown, familyId: string, requestCursor: string | null): value is ParentMessagePage {
  const page = record(value);
  if (!page || page.ok !== true || page.familyId !== familyId || page.requestCursor !== requestCursor
    || !Array.isArray(page.items) || page.items.length > PARENT_MESSAGE_PAGE_SIZE
    || !(page.nextCursor === null || isParentHistoryId(page.nextCursor))) return false;
  const ids = new Set<string>();
  let previous: { id: string; time: number } | null = null;
  for (const raw of page.items) {
    const item = record(raw);
    if (!item || !isParentHistoryId(item.id) || ids.has(item.id) || item.id === requestCursor
      || !(item.subject === null || typeof item.subject === "string") || typeof item.body !== "string"
      || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))
      || typeof item.isFromFamily !== "boolean" || typeof item.canReport !== "boolean" || !Array.isArray(item.attachments)) return false;
    if (item.sender !== null && (!record(item.sender) || typeof record(item.sender)?.name !== "string")) return false;
    const time = Date.parse(item.createdAt);
    if (previous && (time > previous.time || (time === previous.time && item.id >= previous.id))) return false;
    previous = { id: item.id, time }; ids.add(item.id);
    for (const rawAttachment of item.attachments) {
      const attachment = record(rawAttachment);
      if (!attachment || !isParentHistoryId(attachment.id) || typeof attachment.filename !== "string"
        || typeof attachment.size !== "number" || !Number.isFinite(attachment.size) || attachment.size < 0
        || !(attachment.kind === "image" || attachment.kind === "file")
        || !(attachment.downloadUrl === null || safeMessageDownloadUrl(attachment.downloadUrl))) return false;
    }
  }
  return page.nextCursor === null || (page.items.length === PARENT_MESSAGE_PAGE_SIZE && page.nextCursor === page.items.at(-1)?.id && page.nextCursor !== requestCursor);
}

export function appendEarlierParentMessages(current: ParentMessageView[], earlier: ParentMessageView[]) {
  const ids = new Set(current.map(item => item.id));
  return [...current, ...earlier.filter(item => !ids.has(item.id))];
}
