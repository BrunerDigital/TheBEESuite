function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCalendarDateOrTimestamp(input: unknown) {
  const raw = clean(input);
  if (!raw) return null;

  // HTML date inputs submit a calendar date without a time zone. Parsing that
  // value directly uses UTC midnight, which displays as the prior day in US
  // time zones. Noon UTC keeps the stored calendar day stable while preserving
  // exact timestamps supplied by datetime controls and integrations.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00.000Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseOperationalDate(input: unknown, fieldLabel: string, fallback = new Date()) {
  const raw = clean(input);
  if (!raw) return { ok: true as const, date: fallback, provided: false as const };

  const date = parseCalendarDateOrTimestamp(raw);
  if (!date) {
    return {
      ok: false as const,
      status: 400,
      error: `${fieldLabel} must be a valid date or timestamp.`,
    };
  }

  return { ok: true as const, date, provided: true as const };
}
