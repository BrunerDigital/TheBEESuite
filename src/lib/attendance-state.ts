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

export type CenterTimeZoneSource = {
  timezone?: string | null;
  timeZone?: string | null;
  customFields?: unknown;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

const FALLBACK_TIME_ZONE = "America/New_York";

const stateTimeZones: Record<string, string> = {
  AK: "America/Anchorage",
  AL: "America/Chicago",
  AR: "America/Chicago",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  IA: "America/Chicago",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  MT: "America/Denver",
  NC: "America/New_York",
  ND: "America/Chicago",
  NE: "America/Chicago",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NV: "America/Los_Angeles",
  NY: "America/New_York",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VA: "America/New_York",
  VT: "America/New_York",
  WA: "America/Los_Angeles",
  WI: "America/Chicago",
  WV: "America/New_York",
  WY: "America/Denver",
};

const floridaCentralCities = new Set([
  "bonifay",
  "crestview",
  "defuniak springs",
  "destin",
  "fort walton beach",
  "freeport",
  "lynn haven",
  "marianna",
  "milton",
  "niceville",
  "panama city",
  "panama city beach",
  "pensacola",
  "santa rosa beach",
]);

const indianaCentralCities = new Set([
  "boonville",
  "chandler",
  "chesterton",
  "crown point",
  "east chicago",
  "evansville",
  "fort branch",
  "gary",
  "hammond",
  "knox",
  "la porte",
  "merrillville",
  "michigan city",
  "mount vernon",
  "newburgh",
  "portage",
  "poseyville",
  "princeton",
  "rensselaer",
  "rockport",
  "santa claus",
  "tell city",
  "valparaiso",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidTimeZone(value: string) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function inferTimeZoneFromLocation(input: CenterTimeZoneSource) {
  const state = stringValue(input.state).toUpperCase();
  const city = stringValue(input.city).toLowerCase();
  if (state === "FL" && floridaCentralCities.has(city)) return "America/Chicago";
  if (state === "IN" && indianaCentralCities.has(city)) return "America/Chicago";
  return stateTimeZones[state] ?? FALLBACK_TIME_ZONE;
}

export function readCenterTimeZone(input: unknown) {
  const record = asRecord(input);
  const customFields = asRecord(record.customFields ? record.customFields : input);
  const inferred = inferTimeZoneFromLocation(record);
  const configured = [
    stringValue(record.timezone),
    stringValue(record.timeZone),
  ].find(isValidTimeZone);
  const legacyConfigured = [
    stringValue(customFields.timezone),
    stringValue(customFields.timeZone),
  ].find(isValidTimeZone);
  if (configured && configured !== FALLBACK_TIME_ZONE) return configured;
  if (legacyConfigured && legacyConfigured !== FALLBACK_TIME_ZONE) return legacyConfigured;
  if (inferred !== FALLBACK_TIME_ZONE) return inferred;
  if (configured) return configured;
  if (legacyConfigured) return legacyConfigured;
  return inferred;
}

export function centerServiceDayWindow(date = new Date(), center: unknown) {
  const timeZone = readCenterTimeZone(center);
  const start = startOfServiceDay(date, timeZone);
  return {
    timeZone,
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

export function readLatePickupCutoff(customFields: unknown) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return "18:00";
  const value = (customFields as Record<string, unknown>).latePickupCutoff;
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : "18:00";
}

export function isLatePickup(date: Date, timeZone: string, cutoff = "18:00") {
  const [cutoffHour, cutoffMinute] = cutoff.split(":").map((part) => Number(part));
  if (!Number.isFinite(cutoffHour) || !Number.isFinite(cutoffMinute)) return false;
  const parts = datePartsInTimeZone(date, timeZone);
  return parts.hour * 60 + parts.minute > cutoffHour * 60 + cutoffMinute;
}
