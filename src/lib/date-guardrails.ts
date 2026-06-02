function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseOperationalDate(input: unknown, fieldLabel: string, fallback = new Date()) {
  const raw = clean(input);
  if (!raw) return { ok: true as const, date: fallback, provided: false as const };

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      status: 400,
      error: `${fieldLabel} must be a valid date or timestamp.`,
    };
  }

  return { ok: true as const, date, provided: true as const };
}
