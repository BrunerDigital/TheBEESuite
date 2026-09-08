import { isEnrollmentPipelineStatus } from "@/lib/enrollment-status";

export const EXPECTED_CHILD_DATE_OF_BIRTH = "1900-01-01T12:00:00.000Z";

export type ChildBirthStatus = "born" | "expected";

type ChildBirthRecord = {
  dateOfBirth?: Date | string | null;
  enrollmentStatus?: string | null;
  customFields?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeChildBirthStatus(value: unknown): ChildBirthStatus | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "born" || normalized === "expected" ? normalized : null;
}

export function normalizeCalendarDateValue(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const calendarDate = text.slice(0, 10);
  const timestampIsValid = text.length === 10 || !Number.isNaN(new Date(text).getTime());
  return timestampIsValid
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? calendarDate
    : null;
}

export function expectedChildPlaceholderDate() {
  return new Date(EXPECTED_CHILD_DATE_OF_BIRTH);
}

export function suggestedExpectedDueDate(current: unknown, dateOfBirth: unknown, asOf = new Date()) {
  const existing = normalizeCalendarDateValue(current);
  if (existing) return existing;
  const possibleDueDate = normalizeCalendarDateValue(dateOfBirth);
  return possibleDueDate && possibleDueDate >= asOf.toISOString().slice(0, 10) ? possibleDueDate : "";
}

export function childBirthFormState(child: ChildBirthRecord | null | undefined, asOf = new Date()) {
  const fields = record(child?.customFields);
  const storedBirthDate = normalizeCalendarDateValue(child?.dateOfBirth);
  const storedExpectedDueDate = normalizeCalendarDateValue(fields.expectedDueDate);
  const today = asOf.toISOString().slice(0, 10);
  const inferredFromFutureBirthDate = Boolean(
    storedBirthDate
    && storedBirthDate !== EXPECTED_CHILD_DATE_OF_BIRTH.slice(0, 10)
    && storedBirthDate > today
    && isEnrollmentPipelineStatus(child?.enrollmentStatus),
  );
  const expected = normalizeChildBirthStatus(fields.birthStatus) === "expected"
    || Boolean(storedExpectedDueDate)
    || inferredFromFutureBirthDate;

  return {
    birthStatus: expected ? "expected" as const : "born" as const,
    dateOfBirth: expected || storedBirthDate === EXPECTED_CHILD_DATE_OF_BIRTH.slice(0, 10)
      ? ""
      : storedBirthDate ?? "",
    expectedDueDate: storedExpectedDueDate ?? (inferredFromFutureBirthDate ? storedBirthDate ?? "" : ""),
  };
}

export function childBirthCustomFields(
  existing: unknown,
  input: {
    birthStatus: ChildBirthStatus;
    expectedDueDate?: string | null;
    actualDateOfBirthProvided?: boolean;
  },
) {
  const fields = { ...record(existing) };
  if (input.birthStatus === "expected") {
    fields.birthStatus = "expected";
    fields.expectedDueDate = normalizeCalendarDateValue(input.expectedDueDate);
    fields.dateOfBirthMissing = true;
    return fields;
  }

  delete fields.birthStatus;
  delete fields.expectedDueDate;
  if (input.actualDateOfBirthProvided) delete fields.dateOfBirthMissing;
  return fields;
}
