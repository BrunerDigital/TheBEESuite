import { MAX_CHILDREN_PER_REPORT_BATCH } from "./teacher-daily-report";

export function validateTeacherDraftTargets(requested: readonly string[], rosterIds: readonly string[]) {
  const ids = Array.from(new Set(requested));
  if (ids.some((id) => !rosterIds.includes(id))) return { ok: false as const, error: "A selected child is no longer in your current roster. Review the recipients before continuing." };
  if (ids.length > MAX_CHILDREN_PER_REPORT_BATCH) return { ok: false as const, error: `Choose no more than ${MAX_CHILDREN_PER_REPORT_BATCH} children per report batch. Your existing selection has not changed.` };
  return { ok: true as const, ids };
}

export function sameTeacherDraftTargets(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

/** Local-only comparison; generated row IDs are not user-entered report content. */
export function teacherReportDraftSignature(draft: object) {
  return JSON.stringify(draft, (key, value: unknown) => key === "id" ? undefined : value);
}
