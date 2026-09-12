import { isParentUpdateDay, type ParentUpdatesPage, type ParentReportView } from "./parent-updates-history";

// Fixed, fictional data for the development-only /device-preview route. No provider reads.
export const PARENT_UPDATES_PREVIEW_FAMILY = "preview-parent-updates";
export function parentUpdatesPreview(requestedDay: unknown): ParentUpdatesPage | null {
  if (requestedDay !== undefined && !isParentUpdateDay(requestedDay)) return null;
  const day = typeof requestedDay === "string" ? requestedDay : "2026-09-12";
  const days = ["2026-09-12", "2026-09-11", "2026-09-09"];
  const child = { fullName: "Fake Avery Rivera" };
  const report: ParentReportView = { id: `preview-report-${day}`, date: `${day}T12:00:00.000Z`, sentAt: `${day}T20:00:00.000Z`,
    child, mood: "happy", teacherNote: "Fake classroom note for history navigation.", suppliesNeeded: null,
    checkInAt: `${day}T12:00:00.000Z`, checkOutAt: `${day}T20:00:00.000Z`,
    meals: [{ id: "preview-meal", mealType: "lunch", food: "Fake classroom lunch", amount: "all" }], naps: [], diapers: [], activities: [] };
  return { ok: true, familyId: PARENT_UPDATES_PREVIEW_FAMILY, requestDay: typeof requestedDay === "string" ? requestedDay : null,
    day, timeZone: "America/New_York", requestKind: "day", requestCursor: null,
    reports: days.includes(day) && day !== "2026-09-12" ? [report] : [],
    photos: day === "2026-09-12" ? [{ id: "preview-history-photo", takenAt: `${day}T12:00:00.000Z`, caption: "Fake photo-only latest day", child, url: null }] : [],
    nextReportCursor: null, nextPhotoCursor: null, earlierDay: days.find(value => value < day) ?? null, laterDay: days.toReversed().find(value => value > day) ?? null };
}
