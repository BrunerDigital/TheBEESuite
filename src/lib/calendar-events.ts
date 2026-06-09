const eventTypes = new Set(["event", "closure", "holiday"]);
const visibilityTypes = new Set(["staff", "parents", "public"]);
const statusTypes = new Set(["scheduled", "tentative", "cancelled"]);
const recurrenceFrequencies = new Set(["none", "daily", "weekly", "monthly", "yearly"]);
const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const weekdaySet = new Set<string>(weekdays);

export type CalendarEventType = "event" | "closure" | "holiday";
export type CalendarVisibility = "staff" | "parents" | "public";
export type CalendarEventStatus = "scheduled" | "tentative" | "cancelled";
export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type CalendarEventInput = {
  title: string;
  eventType: CalendarEventType;
  status: CalendarEventStatus;
  visibility: CalendarVisibility;
  allDay: boolean;
  timeZone: string;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceWeekdays: string[];
  recurrenceUntil: Date | null;
  recurrenceRule: string | null;
  closureReason: string | null;
  notes: string | null;
};

export type ExpandableCalendarEvent = {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string | null;
  recurrenceRule: string | null;
};

export type CalendarEventOccurrence<T extends ExpandableCalendarEvent> = {
  event: T;
  occurrenceId: string;
  startsAt: Date;
  endsAt: Date | null;
  isRecurringOccurrence: boolean;
};

export type GoogleCalendarPayloadInput = {
  title: string;
  eventType: string;
  startsAt: Date | string;
  endsAt: Date | string | null;
  allDay: boolean;
  timeZone?: string | null;
  recurrenceRule?: string | null;
  visibility?: string | null;
  notes?: string | null;
  centerName?: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOption<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  const normalized = clean(value).toLowerCase().replaceAll("-", "_");
  return allowed.has(normalized) ? normalized as T : fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(clean(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeWeekdays(value: unknown) {
  const rawValues = Array.isArray(value) ? value : clean(value).split(",");
  const result = rawValues
    .map((item) => clean(item).toUpperCase())
    .filter((item) => weekdaySet.has(item));
  return Array.from(new Set(result));
}

function parseUntilDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    const parsed = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T23:59:59Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (/^\d{8}T\d{6}Z$/.test(raw)) {
    const parsed = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const normalized = raw.length === 10 ? `${raw}T23:59:59Z` : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(value: Date, years: number) {
  const next = new Date(value);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function rruleUntil(value: Date) {
  return value.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function parseRRule(rule: string | null) {
  if (!rule?.startsWith("RRULE:")) return null;
  const pieces = rule.slice("RRULE:".length).split(";");
  const result: Record<string, string> = {};
  for (const piece of pieces) {
    const [key, value] = piece.split("=");
    if (key && value) result[key] = value;
  }
  const frequency = result.FREQ?.toLowerCase();
  if (!frequency || !recurrenceFrequencies.has(frequency)) return null;
  return {
    frequency: frequency as Exclude<RecurrenceFrequency, "none">,
    interval: Math.max(1, Number.parseInt(result.INTERVAL || "1", 10) || 1),
    weekdays: normalizeWeekdays(result.BYDAY || ""),
    until: result.UNTIL ? parseUntilDate(result.UNTIL) : null,
  };
}

export function buildRecurrenceRule({
  frequency,
  interval = 1,
  weekdays: selectedWeekdays = [],
  until,
}: {
  frequency: RecurrenceFrequency;
  interval?: number;
  weekdays?: string[];
  until?: Date | null;
}) {
  if (frequency === "none") return null;
  const components = [`FREQ=${frequency.toUpperCase()}`, `INTERVAL=${Math.max(1, Math.floor(interval))}`];
  const byDay = normalizeWeekdays(selectedWeekdays);
  if (frequency === "weekly" && byDay.length) components.push(`BYDAY=${byDay.join(",")}`);
  if (until) components.push(`UNTIL=${rruleUntil(until)}`);
  return `RRULE:${components.join(";")}`;
}

export function normalizeCalendarEventInput(input: Record<string, unknown>): CalendarEventInput {
  const eventType = normalizeOption<CalendarEventType>(input.eventType ?? input.type, eventTypes, "event");
  const allDay = input.allDay === undefined && (eventType === "closure" || eventType === "holiday")
    ? true
    : input.allDay === true || input.allDay === "true" || input.allDay === "on";
  const recurrenceFrequency = normalizeOption<RecurrenceFrequency>(input.recurrenceFrequency, recurrenceFrequencies, "none");
  const recurrenceInterval = clampInteger(input.recurrenceInterval, 1, 1, 52);
  const recurrenceWeekdays = normalizeWeekdays(input.recurrenceWeekdays);
  const recurrenceUntil = parseUntilDate(input.recurrenceUntil);
  const title = clean(input.title).slice(0, 160);
  const notes = clean(input.notes).slice(0, 2_000);
  const closureReason = clean(input.closureReason).slice(0, 300);

  return {
    title,
    eventType,
    status: normalizeOption<CalendarEventStatus>(input.status, statusTypes, "scheduled"),
    visibility: normalizeOption<CalendarVisibility>(input.visibility, visibilityTypes, eventType === "event" ? "staff" : "parents"),
    allDay,
    timeZone: clean(input.timeZone).slice(0, 80) || "America/New_York",
    recurrenceFrequency,
    recurrenceInterval,
    recurrenceWeekdays,
    recurrenceUntil,
    recurrenceRule: buildRecurrenceRule({
      frequency: recurrenceFrequency,
      interval: recurrenceInterval,
      weekdays: recurrenceWeekdays,
      until: recurrenceUntil,
    }),
    closureReason: closureReason || null,
    notes: notes || null,
  };
}

function occurrenceFrom<T extends ExpandableCalendarEvent>(
  event: T,
  occurrenceStart: Date,
  durationMs: number | null,
  index: number,
) {
  return {
    event,
    occurrenceId: `${event.id}:${occurrenceStart.toISOString()}`,
    startsAt: occurrenceStart,
    endsAt: durationMs === null ? null : new Date(occurrenceStart.getTime() + durationMs),
    isRecurringOccurrence: index > 0,
  } satisfies CalendarEventOccurrence<T>;
}

function pushIfInRange<T extends ExpandableCalendarEvent>(
  occurrences: CalendarEventOccurrence<T>[],
  seen: Set<string>,
  event: T,
  occurrenceStart: Date,
  durationMs: number | null,
  windowStart: Date,
  windowEnd: Date,
  index: number,
) {
  const occurrenceEnd = durationMs === null ? occurrenceStart : new Date(occurrenceStart.getTime() + durationMs);
  if (occurrenceEnd < windowStart || occurrenceStart > windowEnd) return;
  const key = `${event.id}:${occurrenceStart.toISOString()}`;
  if (seen.has(key)) return;
  seen.add(key);
  occurrences.push(occurrenceFrom(event, occurrenceStart, durationMs, index));
}

export function expandCalendarEventOccurrences<T extends ExpandableCalendarEvent>(
  events: T[],
  windowStartInput: Date,
  windowEndInput: Date,
) {
  const windowStart = new Date(windowStartInput);
  const windowEnd = new Date(windowEndInput);
  const occurrences: CalendarEventOccurrence<T>[] = [];

  for (const event of events) {
    const startsAt = toDate(event.startsAt);
    if (!startsAt) continue;
    const endsAt = toDate(event.endsAt);
    const durationMs = endsAt ? Math.max(0, endsAt.getTime() - startsAt.getTime()) : null;
    const recurrence = parseRRule(event.recurrenceRule);
    const seen = new Set<string>();

    if (!recurrence) {
      pushIfInRange(occurrences, seen, event, startsAt, durationMs, windowStart, windowEnd, 0);
      continue;
    }

    const recurrenceEnd = recurrence.until && recurrence.until < windowEnd ? recurrence.until : windowEnd;
    if (recurrenceEnd < startsAt) continue;

    if (recurrence.frequency === "daily") {
      let cursor = new Date(startsAt);
      let index = 0;
      while (cursor <= recurrenceEnd && index < 730) {
        pushIfInRange(occurrences, seen, event, cursor, durationMs, windowStart, windowEnd, index);
        cursor = addDays(cursor, recurrence.interval);
        index += 1;
      }
      continue;
    }

    if (recurrence.frequency === "weekly") {
      const selectedWeekdays = recurrence.weekdays.length ? recurrence.weekdays : [weekdays[startsAt.getUTCDay()]];
      const startWeekAnchor = addDays(startsAt, -startsAt.getUTCDay());
      let cursor = new Date(startsAt);
      let index = 0;
      while (cursor <= recurrenceEnd && index < 730) {
        const cursorWeekAnchor = addDays(cursor, -cursor.getUTCDay());
        const weeksFromStart = Math.floor((cursorWeekAnchor.getTime() - startWeekAnchor.getTime()) / 604_800_000);
        if (weeksFromStart >= 0 && weeksFromStart % recurrence.interval === 0 && selectedWeekdays.includes(weekdays[cursor.getUTCDay()])) {
          const occurrenceStart = new Date(startsAt);
          occurrenceStart.setUTCFullYear(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
          pushIfInRange(occurrences, seen, event, occurrenceStart, durationMs, windowStart, windowEnd, index);
        }
        cursor = addDays(cursor, 1);
        index += 1;
      }
      continue;
    }

    let cursor = new Date(startsAt);
    let index = 0;
    while (cursor <= recurrenceEnd && index < 240) {
      pushIfInRange(occurrences, seen, event, cursor, durationMs, windowStart, windowEnd, index);
      cursor = recurrence.frequency === "monthly"
        ? addMonths(cursor, recurrence.interval)
        : addYears(cursor, recurrence.interval);
      index += 1;
    }
  }

  return occurrences.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}

export function calendarEventToGooglePayload(event: GoogleCalendarPayloadInput) {
  const startsAt = toDate(event.startsAt) ?? new Date();
  const endsAt = toDate(event.endsAt) ?? (event.allDay ? addDays(startsAt, 1) : new Date(startsAt.getTime() + 60 * 60_000));
  const timeZone = clean(event.timeZone) || "America/New_York";
  const description = [
    event.centerName ? `Center: ${event.centerName}` : "",
    `Type: ${event.eventType}`,
    event.visibility ? `Visibility: ${event.visibility}` : "",
    clean(event.notes),
  ].filter(Boolean).join("\n");

  return {
    summary: event.title,
    description,
    start: event.allDay ? { date: dateOnly(startsAt) } : { dateTime: startsAt.toISOString(), timeZone },
    end: event.allDay ? { date: dateOnly(endsAt) } : { dateTime: endsAt.toISOString(), timeZone },
    recurrence: event.recurrenceRule ? [event.recurrenceRule] : undefined,
    extendedProperties: {
      private: {
        beeSuiteEventType: event.eventType,
        beeSuiteVisibility: event.visibility ?? "staff",
      },
    },
  };
}

export function readGoogleEventDate(value: { date?: string; dateTime?: string } | undefined | null) {
  if (!value) return null;
  if (value.dateTime) return new Date(value.dateTime);
  if (value.date) return new Date(`${value.date}T00:00:00.000Z`);
  return null;
}

export function isGoogleAllDayEvent(value: { date?: string; dateTime?: string } | undefined | null) {
  return Boolean(value?.date && !value.dateTime);
}

export function eventDateKey(value: Date | string | null) {
  const date = toDate(value);
  return date ? dateKey(date) : "";
}
