export type AnnouncementRecord = { id: string; centerId: string | null; title: string; body: string; audience: unknown; status: string; sendAt: Date | string | null };
export type AnnouncementDraft = { centerId: string | null; title: string; body: string };
export type AnnouncementIntent = "save" | "publish";
export const schoolParentAudience = { label: "school_parent_portal" };
export const legacyParentAudienceLabels = ["school_parent_portal", "families", "parents", "all families", "parent portal", "Families", "Parents", "All families", "Parent portal"];
const parentLabels = new Set(legacyParentAudienceLabels);
export function isSchoolParentAudience(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 1 && typeof input.label === "string" && parentLabels.has(input.label);
}
export function isPublishedAnnouncement(status: string) { return ["active", "sent", "published"].includes(status); }
export function announcementDraft(record: AnnouncementDraft): AnnouncementDraft { return { centerId: record.centerId, title: record.title, body: record.body }; }
export function normalizeAnnouncementDraft(value: unknown): AnnouncementDraft {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  return { centerId: text("centerId") || null, title: text("title"), body: text("body") };
}
export function announcementDraftSignature(value: AnnouncementDraft) { return JSON.stringify([value.centerId, value.title, value.body]); }
function canonical(value: unknown): string {
  const sort = (item: unknown): unknown => item instanceof Date ? item.toISOString() : Array.isArray(item) ? item.map(sort)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => [key, sort(val)])) : item;
  return JSON.stringify(sort(value));
}
export function announcementRecordSignature(record: AnnouncementRecord) { return canonical([record.id, record.centerId, record.title, record.body, record.audience, record.status, record.sendAt]); }
export function announcementCreateId(requestId: unknown) { return typeof requestId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId) ? `ann_${requestId.toLowerCase()}` : null; }
export function announcementRecordFrom(value: unknown): AnnouncementRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || (r.centerId !== null && typeof r.centerId !== "string") || typeof r.title !== "string" || typeof r.body !== "string" || typeof r.status !== "string" || !("audience" in r)
    || (r.sendAt !== null && (typeof r.sendAt !== "string" || !Number.isFinite(Date.parse(r.sendAt))))) return null;
  return { id: r.id, centerId: r.centerId, title: r.title, body: r.body, audience: r.audience, status: r.status, sendAt: r.sendAt };
}
export function readAnnouncementReceipt(value: unknown, expected: { id: string; requestId: string; intent: AnnouncementIntent; draft: AnnouncementDraft; source?: AnnouncementRecord }): AnnouncementRecord | null {
  const envelope = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const record = announcementRecordFrom(envelope.record);
  const unchanged = record && expected.source && announcementRecordSignature(record) === announcementRecordSignature(expected.source);
  if (!record || envelope.ok !== true || envelope.entity !== "announcement" || envelope.portalOnly !== true || envelope.intent !== expected.intent
    || record.id !== (expected.id || announcementCreateId(expected.requestId)) || announcementDraftSignature(unchanged ? normalizeAnnouncementDraft(record) : record) !== announcementDraftSignature(normalizeAnnouncementDraft(expected.draft))
    || canonical(record.audience) !== canonical(expected.source ? expected.source.audience : schoolParentAudience)) return null;
  if (expected.intent === "publish") return record.status === "published" && record.sendAt !== null ? record : null;
  return record.status === (expected.source?.status ?? "draft") && canonical(record.sendAt) === canonical(expected.source?.sendAt ?? null) ? record : null;
}
