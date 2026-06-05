export const CUSTODY_WARNING_LABEL = "Custody / pickup review";

export const CUSTODY_WARNING_DETAIL =
  "Review restricted custody and pickup notes before release, classroom transfer, parent communication, media sharing, or incident follow-up.";

export function normalizeCustodyNotes(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function hasCustodyWarning(input: { custodyNotes?: unknown } | null | undefined) {
  return Boolean(normalizeCustodyNotes(input?.custodyNotes));
}

export function custodyWarningSummary(input: { custodyNotes?: unknown } | null | undefined) {
  if (!hasCustodyWarning(input)) return null;
  return CUSTODY_WARNING_DETAIL;
}

export function custodyWarningPreview(input: { custodyNotes?: unknown } | null | undefined, maxLength = 96) {
  const notes = normalizeCustodyNotes(input?.custodyNotes);
  if (!notes) return "";
  if (notes.length <= maxLength) return notes;
  return `${notes.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}
