export const CHECK_ACTIONS = ["check_in", "check_out"] as const;
export type CheckAction = typeof CHECK_ACTIONS[number];

export function normalizeCheckAction(value: unknown): CheckAction | null {
  return CHECK_ACTIONS.includes(value as CheckAction) ? value as CheckAction : null;
}

export function validateNextCheckAction(action: CheckAction, latestType?: string | null) {
  if (action === "check_in" && latestType === "check_in") {
    return { ok: false as const, error: "Child is already checked in for today." };
  }
  if (action === "check_out" && latestType !== "check_in") {
    return { ok: false as const, error: "Child must be checked in before check-out." };
  }
  return { ok: true as const };
}

export function latestLogMap<T extends { childId: string; type: string; occurredAt: Date }>(logs: T[]) {
  const latest = new Map<string, T>();
  for (const log of logs) {
    const current = latest.get(log.childId);
    if (!current || log.occurredAt > current.occurredAt) latest.set(log.childId, log);
  }
  return latest;
}

export function validateSelectedChildren(input: {
  requestedChildIds: string[];
  allowedChildIds: string[];
}) {
  const requested = Array.from(new Set(input.requestedChildIds));
  const allowed = new Set(input.allowedChildIds);
  const unauthorizedChildIds = requested.filter((childId) => !allowed.has(childId));
  if (unauthorizedChildIds.length) {
    return {
      ok: false as const,
      status: 403,
      error: "One or more selected children are not linked to this guardian at this school.",
      unauthorizedChildIds,
    };
  }
  return { ok: true as const };
}

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

function zonedDateTimeToUtc(parts: ReturnType<typeof datePartsInTimeZone>, timeZone: string) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let utc = new Date(target);
  for (let index = 0; index < 3; index += 1) {
    const current = datePartsInTimeZone(utc, timeZone);
    const currentAsUtc = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
    utc = new Date(utc.getTime() + target - currentAsUtc);
  }
  return utc;
}

export function startOfServiceDay(date = new Date(), timeZone = "America/New_York") {
  const parts = datePartsInTimeZone(date, timeZone);
  return zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone);
}

export function readCenterTimeZone(customFields: unknown) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return "America/New_York";
  const value = (customFields as Record<string, unknown>).timeZone ?? (customFields as Record<string, unknown>).timezone;
  return typeof value === "string" && value.trim() ? value.trim() : "America/New_York";
}
