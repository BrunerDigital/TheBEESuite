import type { ParentPhotoView, ParentReportView, ParentUpdatesPage, ParentUpdatesRequest } from "../../src/lib/parent-updates-history";

export const fakeUpdateFamily = "fake-update-family";
const child = { fullName: "Fake Alexandra Magnolia With A Very Long Family Name" };
export const fakeUpdateReports: ParentReportView[] = Array.from({ length: 101 }, (_, index) => ({
  id: `fake-report-${String(100 - index).padStart(3, "0")}`, date: "2026-09-11T12:00:00.000Z", sentAt: "2026-09-11T21:00:00.000Z",
  mood: "happy", teacherNote: `Fake classroom report ${100 - index}. Learning and play went well.`, suppliesNeeded: "A spare change of clothes",
  checkInAt: "2026-09-11T12:00:00.000Z", checkOutAt: "2026-09-11T20:00:00.000Z", child,
  meals: [{ id: `fake-meal-${index}`, mealType: "lunch", food: "Fake pasta and fruit", amount: "all" }],
  naps: [{ id: `fake-nap-${index}`, startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" }],
  diapers: [], activities: [{ id: `fake-activity-${index}`, title: "Fake classroom painting", notes: "Practiced sharing" }],
}));
export const fakeUpdatePhotos: ParentPhotoView[] = Array.from({ length: 101 }, (_, index) => ({
  id: `fake-photo-${String(100 - index).padStart(3, "0")}`, takenAt: "2026-09-11T13:00:00.000Z", child,
  caption: `Fake classroom photo ${100 - index}`, url: null,
}));
export const fakeUpdateDays = ["2026-09-12", "2026-09-11", ...Array.from({ length: 24 }, (_, index) => new Date(Date.UTC(2026, 8, 9 - index * 2)).toISOString().slice(0, 10))];
export function fakeUpdatesPage(request: ParentUpdatesRequest): ParentUpdatesPage {
  const day = request.day ?? fakeUpdateDays[0];
  const reports = day === "2026-09-11" ? fakeUpdateReports : fakeUpdateDays.includes(day) && day !== "2026-09-12" ? [{ ...fakeUpdateReports[0], id: `fake-older-${day}`, date: `${day}T12:00:00.000Z`, sentAt: `${day}T21:00:00.000Z` }] : [];
  const photos = day === "2026-09-11" ? fakeUpdatePhotos : day === "2026-09-12" ? [{ ...fakeUpdatePhotos[0], id: "fake-latest-photo", takenAt: "2026-09-12T12:00:00.000Z" }] : [];
  const start = (rows: { id: string }[]) => request.cursor ? rows.findIndex(row => row.id === request.cursor) + 1 : 0;
  const reportRows = request.kind === "photos" ? [] : reports.slice(start(reports), start(reports) + 50);
  const photoRows = request.kind === "reports" ? [] : photos.slice(start(photos), start(photos) + 50);
  return { ok: true, familyId: request.familyId, requestDay: request.day, day, timeZone: "America/New_York", requestKind: request.kind, requestCursor: request.cursor,
    reports: reportRows, photos: photoRows,
    nextReportCursor: request.kind !== "photos" && start(reports) + reportRows.length < reports.length ? reportRows.at(-1)!.id : null,
    nextPhotoCursor: request.kind !== "reports" && start(photos) + photoRows.length < photos.length ? photoRows.at(-1)!.id : null,
    earlierDay: fakeUpdateDays.find(value => value < day) ?? null, laterDay: fakeUpdateDays.toReversed().find(value => value > day) ?? null };
}
