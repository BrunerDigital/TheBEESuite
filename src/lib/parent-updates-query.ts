import type { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "./enrollment-status";
import { parentCurrentChildScope } from "./parent-document-query";
import { parentMessageFamilyWhere } from "./parent-message-query";
import { readCenterLocationTimeZone, serviceDayWindowInTimeZone } from "./attendance-state";
import { zonedDateInputToUtc, zonedDateKey } from "./zoned-date-time";
import { isParentUpdateDay, PARENT_UPDATES_PAGE_SIZE, type ParentPhotoView, type ParentReportView, type ParentUpdatesPage, type ParentUpdatesRequest } from "./parent-updates-history";
import { safeMessageDownloadUrl } from "./parent-message-history";
import { createChildMediaSignedUrl } from "./supabase-storage";

type Reader = Pick<Prisma.TransactionClient, "family" | "center" | "dailyReport" | "childMedia" | "checkInOutLog">;
export type ParentUpdatesActor = { familyId: string; userId: string; tenantId: string; tenantCenterIds: string[] };
export const parentReportSelect = {
  id: true, childId: true, date: true, sentAt: true, mood: true, teacherNote: true, suppliesNeeded: true,
  child: { select: { fullName: true } },
  meals: { select: { id: true, mealType: true, food: true, amount: true } },
  naps: { select: { id: true, startsAt: true, endsAt: true } },
  diapers: { select: { id: true, type: true, occurredAt: true, notes: true } },
  activities: { select: { id: true, title: true, notes: true } },
} satisfies Prisma.DailyReportSelect;
const photoSelect = { id: true, url: true, storageKey: true, caption: true, takenAt: true, child: { select: { fullName: true } } } satisfies Prisma.ChildMediaSelect;
type ReportRow = Prisma.DailyReportGetPayload<{ select: typeof parentReportSelect }>;
type PhotoRow = Prisma.ChildMediaGetPayload<{ select: typeof photoSelect }>;
export const parentReportOrder = [{ date: "desc" }, { id: "desc" }] satisfies Prisma.DailyReportOrderByWithRelationInput[];
export const parentPhotoOrder = [{ takenAt: "desc" }, { id: "desc" }] satisfies Prisma.ChildMediaOrderByWithRelationInput[];

export function parentUpdateDayWindow(day: string, timeZone: string) {
  if (!isParentUpdateDay(day)) return null;
  const date = zonedDateInputToUtc(day, timeZone);
  if (!date || zonedDateKey(date, timeZone) !== day) return null;
  return serviceDayWindowInTimeZone(date, timeZone);
}
export async function readParentUpdatesContext(db: Reader, actor: ParentUpdatesActor) {
  const familyWhere = parentMessageFamilyWhere(actor);
  const family = await db.family.findFirst({ where: familyWhere, select: {
    id: true, centerId: true, children: { where: currentlyEnrolledChildWhere(), select: {
      classroom: { select: { center: { select: { id: true, organization: { select: { tenantId: true } } } } } },
    } },
  } });
  if (!family?.children.length) return null;
  const centers = family.children.map(child => child.classroom?.center);
  const centerId = centers[0]?.id;
  if (!centerId || centers.some(center => !center || center.id !== centerId || center.organization.tenantId !== actor.tenantId)
    || (family.centerId !== null && family.centerId !== centerId)) return null;
  const center = await db.center.findFirst({ where: { id: centerId, organization: { tenantId: actor.tenantId } }, select: { id: true, timezone: true, customFields: true, city: true, state: true } });
  if (!center) return null;
  const child: Prisma.ChildWhereInput = { AND: [
    parentCurrentChildScope(actor.tenantId), { familyId: actor.familyId, family: familyWhere },
    { classroom: { centerId, center: { organization: { tenantId: actor.tenantId } } } },
  ] };
  const classroom = { OR: [{ classroomId: null }, { classroom: { centerId, center: { organization: { tenantId: actor.tenantId } } } }] };
  const reports: Prisma.DailyReportWhereInput = { AND: [{ child, sentAt: { not: null } }, classroom] };
  const photos: Prisma.ChildMediaWhereInput = { AND: [{ child, sharedWithParents: true, status: "shared" }, classroom,
    // An independently shared photo may belong to a report still being drafted.
    // ChildMedia.childId owns the display name; linked reports must independently pass
    // the same family/school scope. Upload validation enforces exact child equality.
    { OR: [{ dailyReportId: null }, { dailyReport: { AND: [{ child }, classroom] } }] },
  ] };
  const attendance: Prisma.CheckInOutLogWhereInput = { AND: [{ child }, classroom, { OR: [{ centerId: null }, { centerId }] }] };
  return { familyId: actor.familyId, centerId, timeZone: readCenterLocationTimeZone(center), reports, photos, attendance };
}
export type ParentUpdatesContext = NonNullable<Awaited<ReturnType<typeof readParentUpdatesContext>>>;
function pageRows<T extends { id: string }>(rows: T[]) {
  const items = rows.slice(0, PARENT_UPDATES_PAGE_SIZE);
  return { items, nextCursor: rows.length > PARENT_UPDATES_PAGE_SIZE ? items.at(-1)!.id : null };
}
function reportView(row: ReportRow, attendance?: { checkInAt: Date | null; checkOutAt: Date | null }): ParentReportView {
  return { id: row.id, date: row.date, sentAt: row.sentAt, mood: row.mood, teacherNote: row.teacherNote, suppliesNeeded: row.suppliesNeeded,
    checkInAt: attendance?.checkInAt ?? null, checkOutAt: attendance?.checkOutAt ?? null, child: { fullName: row.child.fullName },
    meals: row.meals.map(({ id, mealType, food, amount }) => ({ id, mealType, food, amount })),
    naps: row.naps.map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt })),
    diapers: row.diapers.map(({ id, type, occurredAt, notes }) => ({ id, type, occurredAt, notes })),
    activities: row.activities.map(({ id, title, notes }) => ({ id, title, notes })),
  };
}
async function adjacentUpdateDay(db: Reader, context: ParentUpdatesContext, boundary: Date | null, direction: "earlier" | "later") {
  const order = direction === "earlier" ? "desc" : "asc";
  const filter = boundary ? direction === "earlier" ? { lt: boundary } : { gte: boundary } : undefined;
  const report = await db.dailyReport.findFirst({ where: { AND: [context.reports, ...(filter ? [{ date: filter }] : [])] }, orderBy: [{ date: order }, { id: order }], select: { date: true } });
  const photo = await db.childMedia.findFirst({ where: { AND: [context.photos, ...(filter ? [{ takenAt: filter }] : [])] }, orderBy: [{ takenAt: order }, { id: order }], select: { takenAt: true } });
  const dates = [report?.date, photo?.takenAt].filter((date): date is Date => Boolean(date));
  if (!dates.length) return null;
  return zonedDateKey(new Date(direction === "earlier" ? Math.max(...dates.map(Number)) : Math.min(...dates.map(Number))), context.timeZone);
}
/** Caller owns a short RepeatableRead transaction; signing occurs afterward. */
export async function readParentUpdatesRows(db: Reader, context: ParentUpdatesContext, request: ParentUpdatesRequest) {
  if (request.familyId !== context.familyId) return null;
  const day = request.day ?? await adjacentUpdateDay(db, context, null, "earlier");
  const window = day ? parentUpdateDayWindow(day, context.timeZone) : null;
  if (day && !window) return null;
  const envelope = { ok: true as const, familyId: request.familyId, requestDay: request.day, day, timeZone: context.timeZone, requestKind: request.kind, requestCursor: request.cursor };
  if (!window) return { ...envelope, reports: [] as ParentReportView[], photos: [] as PhotoRow[], nextReportCursor: null, nextPhotoCursor: null, earlierDay: null, laterDay: null };
  const reportWhere: Prisma.DailyReportWhereInput = { AND: [context.reports, { date: { gte: window.start, lt: window.end } }] };
  const photoWhere: Prisma.ChildMediaWhereInput = { AND: [context.photos, { takenAt: { gte: window.start, lt: window.end } }] };
  let reportAnchor: { id: string; date: Date } | null = null, photoAnchor: { id: string; takenAt: Date } | null = null;
  if (request.kind === "reports") reportAnchor = await db.dailyReport.findFirst({ where: { AND: [reportWhere, { id: request.cursor! }] }, select: { id: true, date: true } });
  if (request.kind === "photos") photoAnchor = await db.childMedia.findFirst({ where: { AND: [photoWhere, { id: request.cursor! }] }, select: { id: true, takenAt: true } });
  if ((request.kind === "reports" && !reportAnchor) || (request.kind === "photos" && !photoAnchor)) return null;
  const reportRows = request.kind === "photos" ? [] : await db.dailyReport.findMany({
    where: { AND: [reportWhere, ...(reportAnchor ? [{ OR: [{ date: { lt: reportAnchor.date } }, { date: reportAnchor.date, id: { lt: reportAnchor.id } }] }] : [])] },
    orderBy: parentReportOrder, take: PARENT_UPDATES_PAGE_SIZE + 1, select: parentReportSelect,
  });
  const photoRows = request.kind === "reports" ? [] : await db.childMedia.findMany({
    where: { AND: [photoWhere, ...(photoAnchor ? [{ OR: [{ takenAt: { lt: photoAnchor.takenAt } }, { takenAt: photoAnchor.takenAt, id: { lt: photoAnchor.id } }] }] : [])] },
    orderBy: parentPhotoOrder, take: PARENT_UPDATES_PAGE_SIZE + 1, select: photoSelect,
  });
  const reports = pageRows(reportRows), photos = pageRows(photoRows);
  const logs = reports.items.length ? await db.checkInOutLog.groupBy({ by: ["childId", "type"],
    where: { AND: [context.attendance, { childId: { in: reports.items.map(row => row.childId) }, type: { in: ["check_in", "check_out"] }, occurredAt: { gte: window.start, lt: window.end } }] },
    _min: { occurredAt: true }, _max: { occurredAt: true },
  }) : [];
  const attendance = new Map<string, { checkInAt: Date | null; checkOutAt: Date | null }>();
  for (const log of logs) {
    const value = attendance.get(log.childId) ?? { checkInAt: null, checkOutAt: null };
    if (log.type === "check_in") value.checkInAt = log._min.occurredAt;
    if (log.type === "check_out") value.checkOutAt = log._max.occurredAt;
    attendance.set(log.childId, value);
  }
  return { ...envelope, reports: reports.items.map(row => reportView(row, attendance.get(row.childId))), photos: photos.items,
    nextReportCursor: reports.nextCursor, nextPhotoCursor: photos.nextCursor,
    earlierDay: await adjacentUpdateDay(db, context, window.start, "earlier"), laterDay: await adjacentUpdateDay(db, context, window.end, "later"),
  };
}
export async function parentPhotoViews(rows: PhotoRow[]): Promise<ParentPhotoView[]> {
  return Promise.all(rows.map(async row => {
    let url: string | null = null;
    if (row.storageKey && !row.storageKey.startsWith("inline-demo-upload")) {
      try { url = safeMessageDownloadUrl(await createChildMediaSignedUrl(row.storageKey)); } catch { /* Display metadata remains available; no internal URL fallback. */ }
    } else url = safeMessageDownloadUrl(row.url);
    return { id: row.id, takenAt: row.takenAt, caption: row.caption, child: { fullName: row.child.fullName }, url };
  }));
}
export async function parentUpdatesView(rows: NonNullable<Awaited<ReturnType<typeof readParentUpdatesRows>>>): Promise<ParentUpdatesPage> {
  return { ok: true, familyId: rows.familyId, requestDay: rows.requestDay, day: rows.day, timeZone: rows.timeZone,
    requestKind: rows.requestKind, requestCursor: rows.requestCursor, reports: rows.reports, photos: await parentPhotoViews(rows.photos),
    nextReportCursor: rows.nextReportCursor, nextPhotoCursor: rows.nextPhotoCursor, earlierDay: rows.earlierDay, laterDay: rows.laterDay };
}
export async function readParentUpdatesHome(db: Reader, context: ParentUpdatesContext, today: Date) {
  const window = serviceDayWindowInTimeZone(today, context.timeZone);
  const latestReport = await db.dailyReport.findFirst({ where: context.reports, orderBy: parentReportOrder, select: { id: true, date: true, child: { select: { fullName: true } } } });
  const reported = await db.dailyReport.groupBy({ by: ["childId"], where: { AND: [context.reports, { date: { gte: window.start, lt: window.end } }] } });
  return { latestReport, reportedChildIds: reported.map(row => row.childId) };
}
