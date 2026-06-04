import type { Prisma } from "@prisma/client";

export const STAFF_CLOCK_ACTIONS = ["clock_in", "clock_out"] as const;
export type StaffClockAction = typeof STAFF_CLOCK_ACTIONS[number];
export type StaffClockStatus = "clocked_in" | "clocked_out";

type StaffClockEvent = {
  action: StaffClockAction;
  occurredAt: string;
  notes?: string | null;
};

export type StaffClockState = {
  status: StaffClockStatus;
  lastAction: StaffClockAction | null;
  lastActionAt: string | null;
  currentClockInAt: string | null;
  currentClockOutAt: string | null;
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
    notes: stringValue(record.notes) || null,
  };
}

export function normalizeStaffClockAction(value: unknown): StaffClockAction | null {
  return STAFF_CLOCK_ACTIONS.includes(value as StaffClockAction) ? value as StaffClockAction : null;
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
  const status = timeClock.status === "clocked_in" || (lastAction === "clock_in" && currentClockInAt)
    ? "clocked_in"
    : "clocked_out";

  return {
    status,
    lastAction,
    lastActionAt: stringValue(timeClock.lastActionAt) || events[0]?.occurredAt || null,
    currentClockInAt: status === "clocked_in" ? currentClockInAt : null,
    currentClockOutAt,
    events,
  };
}

export function readStaffKioskPinHash(customFields: unknown) {
  return stringValue(asRecord(customFields).staffKioskPinHash) || null;
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
  notes,
}: {
  customFields: unknown;
  action: StaffClockAction;
  occurredAt: Date;
  notes?: string | null;
}) {
  const fields = asRecord(customFields);
  const previous = readStaffClockState(fields);
  const event: StaffClockEvent = {
    action,
    occurredAt: occurredAt.toISOString(),
    notes: notes || null,
  };

  return {
    ...fields,
    timeClock: {
      status: action === "clock_in" ? "clocked_in" : "clocked_out",
      lastAction: action,
      lastActionAt: event.occurredAt,
      currentClockInAt: action === "clock_in" ? event.occurredAt : null,
      currentClockOutAt: action === "clock_out" ? event.occurredAt : null,
      events: [event, ...previous.events].slice(0, 60),
    },
  } as Prisma.InputJsonObject;
}
