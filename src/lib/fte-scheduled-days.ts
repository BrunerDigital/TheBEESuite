const weekdayAliases = new Map([
  ["mon", "monday"],
  ["monday", "monday"],
  ["tue", "tuesday"],
  ["tues", "tuesday"],
  ["tuesday", "tuesday"],
  ["wed", "wednesday"],
  ["weds", "wednesday"],
  ["wednesday", "wednesday"],
  ["thu", "thursday"],
  ["thur", "thursday"],
  ["thurs", "thursday"],
  ["thursday", "thursday"],
  ["fri", "friday"],
  ["friday", "friday"],
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedWeekday(value: unknown) {
  if (typeof value !== "string") return null;
  return weekdayAliases.get(value.trim().toLowerCase().replace(/[^a-z]/g, "")) ?? null;
}

function activeDayValue(value: unknown) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return Boolean(value.trim());
  return true;
}

function numericDayCount(...values: unknown[]) {
  for (const value of values) {
    const count = Number(value);
    if (Number.isInteger(count) && count >= 2 && count <= 5) return count as 2 | 3 | 4 | 5;
  }
  return null;
}

export function scheduledDaysPerWeek(input: { schedule: unknown; customFields: unknown }) {
  const schedule = record(input.schedule);
  const customFields = record(input.customFields);
  const explicitCount = numericDayCount(
    schedule.daysPerWeek,
    schedule.scheduledDaysPerWeek,
    customFields.daysPerWeek,
    customFields.scheduledDaysPerWeek,
    customFields.fteDaysPerWeek,
  );
  if (explicitCount) return explicitCount;

  const weekdays = new Set<string>();
  for (const value of [schedule.days, schedule.scheduleDays, customFields.days, customFields.scheduleDays]) {
    if (!Array.isArray(value)) continue;
    for (const day of value) {
      const normalized = normalizedWeekday(day);
      if (normalized) weekdays.add(normalized);
    }
  }
  for (const day of weekdayAliases.values()) {
    if (activeDayValue(schedule[day]) || activeDayValue(customFields[day])) weekdays.add(day);
  }
  if (weekdays.size >= 2 && weekdays.size <= 5) return weekdays.size as 2 | 3 | 4 | 5;

  const text = JSON.stringify({ schedule, customFields }).toLowerCase();
  if (/\b(?:mon(?:day)?\s*[-–—]\s*fri(?:day)?|monday\s+(?:through|to)\s+friday)\b/.test(text)) return 5;
  const textWeekdays = new Set<string>();
  for (const match of text.matchAll(/\b(?:mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?)\b/g)) {
    const normalized = normalizedWeekday(match[0]);
    if (normalized) textWeekdays.add(normalized);
  }
  if (textWeekdays.size >= 2 && textWeekdays.size <= 5) return textWeekdays.size as 2 | 3 | 4 | 5;
  const textMatch = text.match(/\b([2-5])\s*[- ]?days?(?:\s+per\s+week)?\b/);
  if (textMatch) return Number(textMatch[1]) as 2 | 3 | 4 | 5;
  if (/\b(two|three|four|five)\s*[- ]?days?(?:\s+per\s+week)?\b/.test(text)) {
    if (/\btwo\s*[- ]?days?\b/.test(text)) return 2;
    if (/\bthree\s*[- ]?days?\b/.test(text)) return 3;
    if (/\bfour\s*[- ]?days?\b/.test(text)) return 4;
    if (/\bfive\s*[- ]?days?\b/.test(text)) return 5;
  }

  const explicitType = String(customFields.careScheduleType || customFields.fteScheduleType || customFields.fullTimePartTime || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (["full_time", "fulltime", "full"].includes(explicitType)) return 5;
  return null;
}
