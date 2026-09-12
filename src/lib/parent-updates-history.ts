import { isParentHistoryId, safeMessageDownloadUrl } from "./parent-message-history";
import { zonedDateKey } from "./zoned-date-time";

export const PARENT_UPDATES_PAGE_SIZE = 50;
type PortalDate = string | Date;
export type ParentReportView = {
  id: string; date: PortalDate; sentAt: PortalDate | null; mood: string | null;
  teacherNote: string | null; suppliesNeeded: string | null;
  checkInAt: PortalDate | null; checkOutAt: PortalDate | null; child: { fullName: string };
  meals: Array<{ id: string; mealType: string; food: string; amount: string | null }>;
  naps: Array<{ id: string; startsAt: PortalDate; endsAt: PortalDate | null }>;
  diapers: Array<{ id: string; type: string; occurredAt: PortalDate; notes: string | null }>;
  activities: Array<{ id: string; title: string; notes: string | null }>;
};
export type ParentPhotoView = { id: string; takenAt: PortalDate; caption: string | null; url: string | null; child: { fullName: string } };
export type ParentUpdateKind = "day" | "reports" | "photos";
export type ParentUpdatesRequest = { familyId: string; day: string | null; kind: ParentUpdateKind; cursor: string | null };
export type ParentUpdatesPage = {
  ok: true; familyId: string; requestDay: string | null; day: string | null; timeZone: string;
  requestKind: ParentUpdateKind; requestCursor: string | null;
  reports: ParentReportView[]; photos: ParentPhotoView[];
  nextReportCursor: string | null; nextPhotoCursor: string | null;
  earlierDay: string | null; laterDay: string | null;
};

/** Reject impossible dates before timezone helpers can normalize them into another day. */
export function isParentUpdateDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function parseParentUpdatesRequest(params: URLSearchParams): ParentUpdatesRequest | null {
  const familyId = params.get("familyId"), day = params.get("day"), kind = params.get("kind") ?? "day", cursor = params.get("cursor");
  if ([...params.keys()].some(key => !["familyId", "day", "kind", "cursor"].includes(key) || params.getAll(key).length !== 1)
    || !isParentHistoryId(familyId) || (day !== null && !isParentUpdateDay(day))
    || !["day", "reports", "photos"].includes(kind)
    || (kind === "day" ? cursor !== null : !day || !isParentHistoryId(cursor))) return null;
  return { familyId, day, kind: kind as ParentUpdateKind, cursor };
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const nullableText = (value: unknown) => value === null || typeof value === "string";
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const nullableTimestamp = (value: unknown) => value === null || timestamp(value);
function exactKeys(value: Record<string, unknown>, names: string[]) {
  return Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function namedChild(value: unknown) {
  const child = object(value); return child && exactKeys(child, ["fullName"]) && typeof child.fullName === "string";
}
function nestedRows(value: unknown, keys: string[], valid: (row: Record<string, unknown>) => boolean) {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(raw => {
    const row = object(raw);
    if (!row || !exactKeys(row, keys) || !isParentHistoryId(row.id) || ids.has(row.id) || !valid(row)) return false;
    ids.add(row.id); return true;
  });
}
function reportValid(row: Record<string, unknown>) {
  return exactKeys(row, ["id", "date", "sentAt", "mood", "teacherNote", "suppliesNeeded", "checkInAt", "checkOutAt", "child", "meals", "naps", "diapers", "activities"])
    && timestamp(row.date) && timestamp(row.sentAt) && nullableText(row.mood) && nullableText(row.teacherNote) && nullableText(row.suppliesNeeded)
    && nullableTimestamp(row.checkInAt) && nullableTimestamp(row.checkOutAt) && namedChild(row.child)
    && nestedRows(row.meals, ["id", "mealType", "food", "amount"], meal => typeof meal.mealType === "string" && typeof meal.food === "string" && nullableText(meal.amount))
    && nestedRows(row.naps, ["id", "startsAt", "endsAt"], nap => timestamp(nap.startsAt) && nullableTimestamp(nap.endsAt))
    && nestedRows(row.diapers, ["id", "type", "occurredAt", "notes"], entry => typeof entry.type === "string" && timestamp(entry.occurredAt) && nullableText(entry.notes))
    && nestedRows(row.activities, ["id", "title", "notes"], entry => typeof entry.title === "string" && nullableText(entry.notes));
}
function photoValid(row: Record<string, unknown>) {
  return exactKeys(row, ["id", "takenAt", "caption", "url", "child"]) && timestamp(row.takenAt)
    && nullableText(row.caption) && (row.url === null || Boolean(safeMessageDownloadUrl(row.url))) && namedChild(row.child);
}
function orderedRows(value: unknown, field: "date" | "takenAt", day: string | null, timeZone: string, cursor: string | null) {
  if (!Array.isArray(value) || value.length > PARENT_UPDATES_PAGE_SIZE) return false;
  const ids = new Set<string>(); let previous: { time: number; id: string } | null = null;
  for (const raw of value) {
    const row = object(raw);
    if (!row || !isParentHistoryId(row.id) || ids.has(row.id) || row.id === cursor || !(field === "date" ? reportValid(row) : photoValid(row))) return false;
    if (!timestamp(row[field]) || zonedDateKey(row[field], timeZone) !== day) return false;
    const time = Date.parse(row[field]);
    if (previous && (time > previous.time || (time === previous.time && row.id >= previous.id))) return false;
    ids.add(row.id); previous = { time, id: row.id };
  }
  return true;
}
/** Never replace a visible day with an uncorrelated or partial-success response. */
export function isParentUpdatesPage(value: unknown, request: ParentUpdatesRequest, timeZone: string): value is ParentUpdatesPage {
  const page = object(value);
  if (!page || !exactKeys(page, ["ok", "familyId", "requestDay", "day", "timeZone", "requestKind", "requestCursor", "reports", "photos", "nextReportCursor", "nextPhotoCursor", "earlierDay", "laterDay"])
    || page.ok !== true || page.familyId !== request.familyId || page.requestDay !== request.day || page.requestKind !== request.kind || page.requestCursor !== request.cursor || page.timeZone !== timeZone
    || !(page.day === null || isParentUpdateDay(page.day)) || (request.day !== null && page.day !== request.day)) return false;
  try {
    if (!orderedRows(page.reports, "date", page.day, timeZone, request.kind === "reports" ? request.cursor : null)
      || !orderedRows(page.photos, "takenAt", page.day, timeZone, request.kind === "photos" ? request.cursor : null)) return false;
  } catch { return false; }
  const reports = page.reports as ParentReportView[], photos = page.photos as ParentPhotoView[];
  for (const [rows, next] of [[reports, page.nextReportCursor], [photos, page.nextPhotoCursor]] as const) {
    if (!(next === null || (isParentHistoryId(next) && rows.length === PARENT_UPDATES_PAGE_SIZE && rows.at(-1)?.id === next && next !== request.cursor))) return false;
  }
  if (request.kind === "reports" && (photos.length || page.nextPhotoCursor !== null)) return false;
  if (request.kind === "photos" && (reports.length || page.nextReportCursor !== null)) return false;
  if (page.day === null && (reports.length || photos.length || page.earlierDay !== null || page.laterDay !== null)) return false;
  return (page.earlierDay === null || (isParentUpdateDay(page.earlierDay) && typeof page.day === "string" && page.earlierDay < page.day))
    && (page.laterDay === null || (isParentUpdateDay(page.laterDay) && typeof page.day === "string" && page.laterDay > page.day));
}
export function appendParentUpdateRows<T extends { id: string }>(current: T[], older: T[]) {
  const ids = new Set(current.map(row => row.id));
  return [...current, ...older.filter(row => !ids.has(row.id))];
}
