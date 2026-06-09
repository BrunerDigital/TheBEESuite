export const complianceTaskStatuses = ["open", "in_progress", "waiting", "completed", "canceled"] as const;
export const complianceTaskPriorities = ["normal", "high", "urgent"] as const;
export const emergencyDrillOutcomes = ["completed", "partial", "failed", "rescheduled"] as const;

export type ComplianceTaskStatus = (typeof complianceTaskStatuses)[number];
export type ComplianceTaskPriority = (typeof complianceTaskPriorities)[number];
export type EmergencyDrillOutcome = (typeof emergencyDrillOutcomes)[number];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]) {
  const next = clean(value).toLowerCase().replaceAll(" ", "_");
  return values.includes(next) ? next as T[number] : fallback;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

export function normalizeEmergencyDrillInput(input: Record<string, unknown>) {
  return {
    centerId: clean(input.centerId),
    drillType: clean(input.drillType) || "Fire drill",
    durationMinutes: numberOrNull(input.durationMinutes),
    participants: clean(input.participants) || null,
    outcome: oneOf(input.outcome, emergencyDrillOutcomes, "completed"),
    notes: clean(input.notes) || null,
  };
}

export function normalizeComplianceTaskInput(input: Record<string, unknown>) {
  return {
    centerId: clean(input.centerId),
    title: clean(input.title),
    category: clean(input.category) || "general",
    priority: oneOf(input.priority, complianceTaskPriorities, "normal"),
    status: oneOf(input.status, complianceTaskStatuses, "open"),
    assignedToId: clean(input.assignedToId) || null,
    relatedResourceType: clean(input.relatedResourceType) || null,
    relatedResourceId: clean(input.relatedResourceId) || null,
    notes: clean(input.notes) || null,
  };
}

export function complianceTaskIsOpen(status: string | null | undefined) {
  return status !== "completed" && status !== "canceled";
}

export function complianceTaskNeedsReminder(input: {
  status: string | null | undefined;
  dueAt?: Date | string | null;
  reminderAt?: Date | string | null;
  now?: Date;
}) {
  if (!complianceTaskIsOpen(input.status)) return false;
  const now = input.now ?? new Date();
  const reminderAt = input.reminderAt ? new Date(input.reminderAt) : null;
  if (reminderAt && !Number.isNaN(reminderAt.getTime()) && reminderAt <= now) return true;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) return false;
  const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 3_600_000;
  return hoursUntilDue <= 24;
}
