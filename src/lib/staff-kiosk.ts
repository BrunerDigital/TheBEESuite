import type { Prisma } from "@prisma/client";
import { verifyStaffPin } from "@/lib/kiosk";

export const STAFF_CLOCK_ACTIONS = ["clock_in", "clock_out"] as const;
export type StaffClockAction = typeof STAFF_CLOCK_ACTIONS[number];
export type StaffClockStatus = "clocked_in" | "clocked_out";

export type StaffClockEvent = {
  action: StaffClockAction;
  occurredAt: string;
  timeZone?: string | null;
  notes?: string | null;
};

export type StaffClockShift = {
  clockInAt: string;
  clockOutAt: string | null;
  minutes: number;
  status: "closed" | "open";
  notes: string | null;
};

export type StaffClockSummary = {
  totalMinutes: number;
  closedShiftMinutes: number;
  openShiftMinutes: number;
  closedShiftCount: number;
  shiftCount: number;
  openShiftStartedAt: string | null;
  lastShiftMinutes: number | null;
  shifts: StaffClockShift[];
  recentShifts: StaffClockShift[];
};

export type StaffClockState = {
  status: StaffClockStatus;
  lastAction: StaffClockAction | null;
  lastActionAt: string | null;
  currentClockInAt: string | null;
  currentClockOutAt: string | null;
  timeZone: string | null;
  events: StaffClockEvent[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clockEvent(value: unknown): StaffClockEvent | null {
  const record = asRecord(value);
  const action = normalizeStaffClockAction(record.action);
  const occurredAt = stringValue(record.occurredAt);
  if (!action || !occurredAt) return null;
  return {
    action,
    occurredAt,
    timeZone: stringValue(record.timeZone) || stringValue(record.timezone) || null,
    notes: stringValue(record.notes) || null,
  };
}

export function normalizeStaffClockAction(value: unknown): StaffClockAction | null {
  return STAFF_CLOCK_ACTIONS.includes(value as StaffClockAction) ? value as StaffClockAction : null;
}

function dateMs(value: string | Date | null | undefined) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function minutesBetween(startAt: string, endAt: string | Date) {
  const startMs = dateMs(startAt);
  const endMs = dateMs(endAt);
  if (startMs === null || endMs === null || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 60_000);
}

function summarizeClockEvents(
  events: StaffClockEvent[],
  options: {
    now?: Date;
    startDate?: Date | null;
    endDate?: Date | null;
  } = {},
): StaffClockSummary {
  const now = options.now ?? new Date();
  const startMs = dateMs(options.startDate ?? null);
  const endMs = dateMs(options.endDate ?? null);
  const sorted = [...events]
    .filter((event) => dateMs(event.occurredAt) !== null)
    .sort((left, right) => (dateMs(left.occurredAt) ?? 0) - (dateMs(right.occurredAt) ?? 0));
  const shifts: StaffClockShift[] = [];
  let openClockIn: StaffClockEvent | null = null;

  for (const event of sorted) {
    if (event.action === "clock_in") {
      openClockIn = event;
      continue;
    }

    if (!openClockIn) continue;
    shifts.push({
      clockInAt: openClockIn.occurredAt,
      clockOutAt: event.occurredAt,
      minutes: minutesBetween(openClockIn.occurredAt, event.occurredAt),
      status: "closed",
      notes: event.notes || openClockIn.notes || null,
    });
    openClockIn = null;
  }

  if (openClockIn) {
    shifts.push({
      clockInAt: openClockIn.occurredAt,
      clockOutAt: null,
      minutes: minutesBetween(openClockIn.occurredAt, now),
      status: "open",
      notes: openClockIn.notes || null,
    });
  }

  const scopedShifts = shifts
    .map((shift) => {
      const shiftStartMs = dateMs(shift.clockInAt);
      const shiftEndMs = dateMs(shift.clockOutAt) ?? dateMs(now);
      if (shiftStartMs === null || shiftEndMs === null) return null;
      if (startMs !== null && shiftEndMs < startMs) return null;
      if (endMs !== null && shiftStartMs > endMs) return null;
      const scopedStart = startMs === null ? shiftStartMs : Math.max(shiftStartMs, startMs);
      const scopedEnd = endMs === null ? shiftEndMs : Math.min(shiftEndMs, endMs);
      const minutes = Math.max(0, Math.round((scopedEnd - scopedStart) / 60_000));
      return { ...shift, minutes };
    })
    .filter((shift): shift is StaffClockShift => Boolean(shift))
    .filter((shift) => shift.minutes > 0 || shift.status === "open");

  const closedShifts = scopedShifts.filter((shift) => shift.status === "closed");
  const openShifts = scopedShifts.filter((shift) => shift.status === "open");
  const closedShiftMinutes = closedShifts.reduce((sum, shift) => sum + shift.minutes, 0);
  const openShiftMinutes = openShifts.reduce((sum, shift) => sum + shift.minutes, 0);
  const newestFirst = [...scopedShifts].sort((left, right) => {
    const leftTime = dateMs(left.clockOutAt) ?? dateMs(left.clockInAt) ?? 0;
    const rightTime = dateMs(right.clockOutAt) ?? dateMs(right.clockInAt) ?? 0;
    return rightTime - leftTime;
  });

  return {
    totalMinutes: closedShiftMinutes + openShiftMinutes,
    closedShiftMinutes,
    openShiftMinutes,
    closedShiftCount: closedShifts.length,
    shiftCount: scopedShifts.length,
    openShiftStartedAt: openShifts[0]?.clockInAt ?? null,
    lastShiftMinutes: newestFirst[0]?.minutes ?? null,
    shifts: scopedShifts,
    recentShifts: newestFirst.slice(0, 12),
  };
}

export function readStaffClockState(customFields: unknown): StaffClockState {
  const fields = asRecord(customFields);
  const timeClock = asRecord(fields.timeClock);
  const lastAction = normalizeStaffClockAction(timeClock.lastAction);
  const events = Array.isArray(timeClock.events)
    ? timeClock.events.map(clockEvent).filter((event): event is StaffClockEvent => Boolean(event))
    : [];
  const currentClockInAt = stringValue(timeClock.currentClockInAt) || null;
  const currentClockOutAt = stringValue(timeClock.currentClockOutAt) || null;
  const timeZone = stringValue(timeClock.timeZone) || stringValue(timeClock.timezone) || events.find((event) => event.timeZone)?.timeZone || null;
  const status = timeClock.status === "clocked_in" || (lastAction === "clock_in" && currentClockInAt)
    ? "clocked_in"
    : "clocked_out";

  return {
    status,
    lastAction,
    lastActionAt: stringValue(timeClock.lastActionAt) || events[0]?.occurredAt || null,
    currentClockInAt: status === "clocked_in" ? currentClockInAt : null,
    currentClockOutAt,
    timeZone,
    events,
  };
}

export function readStaffClockSummary(
  customFields: unknown,
  options: {
    now?: Date;
    startDate?: Date | null;
    endDate?: Date | null;
  } = {},
) {
  return summarizeClockEvents(readStaffClockState(customFields).events, options);
}

export function formatStaffHours(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = safeMinutes / 60;
  return `${hours.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`;
}

export function formatStaffDecimalHours(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return (safeMinutes / 60).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function readStaffKioskPinHash(customFields: unknown) {
  return stringValue(asRecord(customFields).staffKioskPinHash) || null;
}

export function readStaffContactEmail(customFields: unknown) {
  return stringValue(asRecord(customFields).staffContactEmail).toLowerCase() || null;
}

export type StaffKioskCredentialCandidate = {
  id: string;
  customFields: unknown;
  user: {
    email: string;
    isActive?: boolean;
  };
};

export function staffKioskEmailMatches(candidate: StaffKioskCredentialCandidate, email: string) {
  const normalized = stringValue(email).toLowerCase();
  if (!normalized) return true;
  return candidate.user.email.toLowerCase() === normalized || readStaffContactEmail(candidate.customFields) === normalized;
}

export function resolveStaffKioskCredential<T extends StaffKioskCredentialCandidate>({
  candidates,
  pin,
  email,
}: {
  candidates: T[];
  pin: string;
  email?: string | null;
}) {
  const scopedCandidates = stringValue(email)
    ? candidates.filter((candidate) => staffKioskEmailMatches(candidate, stringValue(email)))
    : candidates;
  if (!scopedCandidates.length) return { ok: false as const, status: "not_found" as const };

  const staffWithCodes = scopedCandidates.filter((candidate) => readStaffKioskPinHash(candidate.customFields));
  if (!staffWithCodes.length) return { ok: false as const, status: "missing_code" as const };

  const matches = staffWithCodes.filter((candidate) =>
    verifyStaffPin(candidate.id, pin, readStaffKioskPinHash(candidate.customFields)),
  );
  if (matches.length === 1) return { ok: true as const, staff: matches[0] };
  if (matches.length > 1) return { ok: false as const, status: "ambiguous" as const };
  return { ok: false as const, status: "invalid_pin" as const };
}

export function validateNextStaffClockAction(action: StaffClockAction, state: StaffClockState) {
  if (action === "clock_in" && state.status === "clocked_in") {
    return { ok: false as const, error: "Staff member is already clocked in." };
  }
  if (action === "clock_out" && state.status !== "clocked_in") {
    return { ok: false as const, error: "Staff member must be clocked in before clock-out." };
  }
  return { ok: true as const };
}

export function staffKioskPinFields({
  customFields,
  pinHash,
  pinSetAt,
  pinSetById,
}: {
  customFields: unknown;
  pinHash: string;
  pinSetAt: Date;
  pinSetById: string;
}) {
  return {
    ...asRecord(customFields),
    staffKioskPinHash: pinHash,
    staffKioskPinSetAt: pinSetAt.toISOString(),
    staffKioskPinSetById: pinSetById,
  } as Prisma.InputJsonObject;
}

export function staffClockFields({
  customFields,
  action,
  occurredAt,
  timeZone,
  notes,
}: {
  customFields: unknown;
  action: StaffClockAction;
  occurredAt: Date;
  timeZone?: string | null;
  notes?: string | null;
}) {
  const fields = asRecord(customFields);
  const previous = readStaffClockState(fields);
  const event: StaffClockEvent = {
    action,
    occurredAt: occurredAt.toISOString(),
    timeZone: timeZone || null,
    notes: notes || null,
  };
  const events = [event, ...previous.events].slice(0, 60);
  const summary = summarizeClockEvents(events, { now: occurredAt });

  return {
    ...fields,
    timeClock: {
      status: action === "clock_in" ? "clocked_in" : "clocked_out",
      lastAction: action,
      lastActionAt: event.occurredAt,
      currentClockInAt: action === "clock_in" ? event.occurredAt : null,
      currentClockOutAt: action === "clock_out" ? event.occurredAt : null,
      timeZone: timeZone || previous.timeZone,
      totalMinutes: summary.totalMinutes,
      closedShiftMinutes: summary.closedShiftMinutes,
      closedShiftCount: summary.closedShiftCount,
      lastShiftMinutes: summary.lastShiftMinutes,
      summaryUpdatedAt: event.occurredAt,
      events,
    },
  } as Prisma.InputJsonObject;
}
