import { parseOperationalDate } from "@/lib/date-guardrails";

const MAX_CARE_ENTRIES = 12;
const MAX_CHILDREN_PER_REPORT_BATCH = 40;

export type DailyReportMealInput = {
  mealType: string;
  food: string;
  amount: string | null;
};

export type DailyReportNapInput = {
  startsAt: Date;
  endsAt: Date | null;
};

export type DailyReportDiaperInput = {
  type: string;
  occurredAt: Date;
  notes: string | null;
};

export type DailyReportActivityInput = {
  title: string;
  notes: string | null;
};

export type ParsedTeacherDailyReportPayload = {
  childId: string;
  childIds: string[];
  date: Date;
  mood: string | null;
  teacherNote: string | null;
  suppliesNeeded: string | null;
  sendToParent: boolean;
  meals: DailyReportMealInput[];
  naps: DailyReportNapInput[];
  diapers: DailyReportDiaperInput[];
  activities: DailyReportActivityInput[];
};

type ParseResult =
  | { ok: true; report: ParsedTeacherDailyReportPayload }
  | { ok: false; status: number; error: string };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseBoolean(value: unknown) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function collectChildIds(input: Record<string, unknown>): { ok: true; childIds: string[] } | { ok: false; status: number; error: string } {
  const ids = new Set<string>();
  const childId = clean(input.childId);
  if (childId) ids.add(childId);

  if (input.childIds !== undefined && input.childIds !== null) {
    if (!Array.isArray(input.childIds)) {
      return { ok: false, status: 400, error: "Child IDs must be an array." };
    }
    if (input.childIds.length > MAX_CHILDREN_PER_REPORT_BATCH) {
      return { ok: false, status: 400, error: `Daily reports can be created for at most ${MAX_CHILDREN_PER_REPORT_BATCH} children at once.` };
    }
    for (const item of input.childIds) {
      const id = clean(item);
      if (id) ids.add(id);
    }
  }

  const childIds = Array.from(ids);
  if (!childIds.length) {
    return { ok: false, status: 400, error: "At least one child ID is required." };
  }
  if (childIds.length > MAX_CHILDREN_PER_REPORT_BATCH) {
    return { ok: false, status: 400, error: `Daily reports can be created for at most ${MAX_CHILDREN_PER_REPORT_BATCH} children at once.` };
  }

  return { ok: true, childIds };
}

function normalizeDateInput(value: unknown) {
  const raw = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00`;
  return value;
}

function dateInputValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeDateTimeInput(value: unknown, fallback?: Date) {
  const raw = clean(value);
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch && fallback) {
    const hour = timeMatch[1].padStart(2, "0");
    const second = timeMatch[3] ? `:${timeMatch[3]}` : "";
    return `${dateInputValue(fallback)}T${hour}:${timeMatch[2]}${second}`;
  }
  return normalizeDateInput(value);
}

function parseDateField(value: unknown, fieldLabel: string, fallback?: Date) {
  return parseOperationalDate(normalizeDateTimeInput(value, fallback), fieldLabel, fallback);
}

function getRecordArray(value: unknown, fieldLabel: string): { ok: true; records: Record<string, unknown>[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, records: [] };
  if (!Array.isArray(value)) return { ok: false, error: `${fieldLabel} must be an array.` };
  if (value.length > MAX_CARE_ENTRIES) return { ok: false, error: `${fieldLabel} can include at most ${MAX_CARE_ENTRIES} entries.` };
  const records: Record<string, unknown>[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) records.push(item as Record<string, unknown>);
  }
  return { ok: true, records };
}

function collectMeals(input: Record<string, unknown>) {
  const meals = getRecordArray(input.meals, "Meals");
  if (!meals.ok) return meals;

  const records: DailyReportMealInput[] = meals.records
    .map((meal) => ({
      mealType: clean(meal.mealType) || "Meal",
      food: clean(meal.food),
      amount: clean(meal.amount) || null,
    }))
    .filter((meal) => Boolean(meal.food));

  const legacyMeal = clean(input.meal);
  if (legacyMeal) {
    records.push({
      mealType: clean(input.mealType) || "Meal",
      food: legacyMeal,
      amount: clean(input.mealAmount) || null,
    });
  }

  return { ok: true as const, records };
}

function collectActivities(input: Record<string, unknown>) {
  const activities = getRecordArray(input.activities, "Activities");
  if (!activities.ok) return activities;

  const records: DailyReportActivityInput[] = activities.records
    .map((activity) => ({
      title: clean(activity.title),
      notes: clean(activity.notes) || null,
    }))
    .filter((activity) => Boolean(activity.title));

  const legacyActivity = clean(input.activity);
  if (legacyActivity) {
    records.push({
      title: legacyActivity,
      notes: clean(input.activityNotes) || null,
    });
  }

  return { ok: true as const, records };
}

function collectNaps(input: Record<string, unknown>, fallbackDate: Date): { ok: true; records: DailyReportNapInput[] } | { ok: false; status: number; error: string } {
  const naps = getRecordArray(input.naps, "Naps");
  if (!naps.ok) return { ok: false, status: 400, error: naps.error };

  const records: DailyReportNapInput[] = [];
  const napRecords = [...naps.records];
  const legacyNapStart = clean(input.napStart);
  if (legacyNapStart) napRecords.push({ startsAt: legacyNapStart, endsAt: clean(input.napEnd) });

  for (const [index, nap] of napRecords.entries()) {
    const startRaw = clean(nap.startsAt) || clean(nap.start) || clean(nap.napStart);
    const endRaw = clean(nap.endsAt) || clean(nap.end) || clean(nap.napEnd);
    if (!startRaw && !endRaw) continue;
    if (!startRaw) return { ok: false, status: 400, error: `Nap ${index + 1} start time is required.` };

    const parsedStart = parseDateField(startRaw, `Nap ${index + 1} start`, fallbackDate);
    if (!parsedStart.ok) return parsedStart;
    const parsedEnd = endRaw ? parseDateField(endRaw, `Nap ${index + 1} end`, fallbackDate) : null;
    if (parsedEnd && !parsedEnd.ok) return parsedEnd;
    if (parsedEnd?.date && parsedEnd.date.getTime() < parsedStart.date.getTime()) {
      return { ok: false, status: 400, error: `Nap ${index + 1} end time cannot be before the start time.` };
    }

    records.push({ startsAt: parsedStart.date, endsAt: parsedEnd?.date ?? null });
  }

  return { ok: true, records };
}

function collectDiapers(input: Record<string, unknown>, fallbackDate: Date): { ok: true; records: DailyReportDiaperInput[] } | { ok: false; status: number; error: string } {
  const diapers = getRecordArray(input.diapers, "Diaper and potty logs");
  if (!diapers.ok) return { ok: false, status: 400, error: diapers.error };

  const records: DailyReportDiaperInput[] = [];
  const diaperRecords = [...diapers.records];
  const legacyDiaperType = clean(input.diaperType);
  if (legacyDiaperType) {
    diaperRecords.push({
      type: legacyDiaperType,
      occurredAt: input.diaperOccurredAt,
      notes: input.diaperNotes,
    });
  }

  for (const [index, diaper] of diaperRecords.entries()) {
    const type = clean(diaper.type);
    if (!type) continue;
    const occurredAtRaw = clean(diaper.occurredAt);
    const parsedOccurredAt = occurredAtRaw ? parseDateField(occurredAtRaw, `Diaper/potty ${index + 1} time`, fallbackDate) : { ok: true as const, date: fallbackDate };
    if (!parsedOccurredAt.ok) return parsedOccurredAt;

    records.push({
      type,
      occurredAt: parsedOccurredAt.date,
      notes: clean(diaper.notes) || null,
    });
  }

  return { ok: true, records };
}

export function parseTeacherDailyReportPayload(body: unknown): ParseResult {
  const input = asRecord(body);
  const childIds = collectChildIds(input);
  if (!childIds.ok) return childIds;

  const parsedDate = parseDateField(input.date, "Daily report date");
  if (!parsedDate.ok) return parsedDate;

  const meals = collectMeals(input);
  if (!meals.ok) return { ok: false, status: 400, error: meals.error };
  const naps = collectNaps(input, parsedDate.date);
  if (!naps.ok) return naps;
  const diapers = collectDiapers(input, parsedDate.date);
  if (!diapers.ok) return diapers;
  const activities = collectActivities(input);
  if (!activities.ok) return { ok: false, status: 400, error: activities.error };

  return {
    ok: true,
    report: {
      childId: childIds.childIds[0],
      childIds: childIds.childIds,
      date: parsedDate.date,
      mood: clean(input.mood) || null,
      teacherNote: clean(input.teacherNote) || null,
      suppliesNeeded: clean(input.suppliesNeeded) || null,
      sendToParent: parseBoolean(input.sendToParent),
      meals: meals.records,
      naps: naps.records,
      diapers: diapers.records,
      activities: activities.records,
    },
  };
}
