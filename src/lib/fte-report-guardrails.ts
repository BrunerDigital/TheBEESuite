const executiveFteRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"]);
const fteReportingDeadlineDayOffset = 4;
const fteReportingDeadlineHour = 12;
const fteReportingDeadlineMinute = 0;
const ftePreDeadlineEscalationHour = 8;
const ftePostDeadlineEscalationHour = 17;
const fteEscalationMinute = 0;

export const FTE_REPORTING_DEADLINE_TIME_ZONE = "America/New_York";
export const FTE_REPORTING_DEADLINE_LABEL = "Friday by 12:00 PM ET";
export const FTE_PRE_DEADLINE_ESCALATION_LABEL = "Friday 8:00 AM ET";
export const FTE_POST_DEADLINE_ESCALATION_LABEL = "Friday 5:00 PM ET";

export type FteExternalEscalationWindow = "friday_8am" | "friday_5pm";

export function isExecutiveFteManager(role?: string | null) {
  return Boolean(role && executiveFteRoles.has(role));
}

export function isFteCenterInVisibleScope(visibleCenterIds: readonly string[], centerId?: string | null) {
  const requestedCenterId = centerId?.trim();
  return Boolean(requestedCenterId && visibleCenterIds.includes(requestedCenterId));
}

export function calculateFteCount(fullTimeCount: number, partTimeCount: number) {
  return Math.max(0, Math.round((fullTimeCount + partTimeCount * 0.5) * 100) / 100);
}

export function ageGroupTotal(input: {
  infants?: number;
  toddlers?: number;
  twos?: number;
  preschool?: number;
  preK?: number;
  schoolAge?: number;
}) {
  return [
    input.infants,
    input.toddlers,
    input.twos,
    input.preschool,
    input.preK,
    input.schoolAge,
  ].reduce<number>((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

export function dateInputString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfFteWeek(date = new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value;
}

export function defaultFteWeekEnd(weekStart: Date) {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
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
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour === "24" ? "0" : values.hour);
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    hour,
    Number(values.minute),
    Number(values.second),
  );
  return zonedAsUtc - date.getTime();
}

function utcDateForZonedTime(date: Date, input: { timeZone: string; hour: number; minute: number }) {
  const utcGuess = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    input.hour,
    input.minute,
    0,
    0,
  ));
  return new Date(utcGuess.getTime() - timeZoneOffsetMs(utcGuess, input.timeZone));
}

function isFridayInFteTimeZone(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FTE_REPORTING_DEADLINE_TIME_ZONE,
    weekday: "short",
  }).format(date) === "Fri";
}

export function fteDueAtForWeek(weekStart: Date) {
  const dueDate = new Date(weekStart);
  dueDate.setUTCDate(dueDate.getUTCDate() + fteReportingDeadlineDayOffset);
  return utcDateForZonedTime(dueDate, {
    timeZone: FTE_REPORTING_DEADLINE_TIME_ZONE,
    hour: fteReportingDeadlineHour,
    minute: fteReportingDeadlineMinute,
  });
}

function fteFridayEscalationAtForWeek(weekStart: Date, hour: number) {
  const escalationDate = new Date(weekStart);
  escalationDate.setUTCDate(escalationDate.getUTCDate() + fteReportingDeadlineDayOffset);
  return utcDateForZonedTime(escalationDate, {
    timeZone: FTE_REPORTING_DEADLINE_TIME_ZONE,
    hour,
    minute: fteEscalationMinute,
  });
}

export function fteExternalEscalationWindow(now = new Date()) {
  const weekStart = startOfFteWeek(now);
  const dueAt = fteDueAtForWeek(weekStart);
  const preDeadlineAt = fteFridayEscalationAtForWeek(weekStart, ftePreDeadlineEscalationHour);
  const postDeadlineAt = fteFridayEscalationAtForWeek(weekStart, ftePostDeadlineEscalationHour);

  if (!isFridayInFteTimeZone(now)) return null;

  if (now.getTime() >= preDeadlineAt.getTime() && now.getTime() < dueAt.getTime()) {
    return {
      key: "friday_8am" as const,
      label: FTE_PRE_DEADLINE_ESCALATION_LABEL,
      startsAt: preDeadlineAt,
      weekStart,
      deadlineAt: dueAt,
    };
  }

  if (now.getTime() >= postDeadlineAt.getTime()) {
    return {
      key: "friday_5pm" as const,
      label: FTE_POST_DEADLINE_ESCALATION_LABEL,
      startsAt: postDeadlineAt,
      weekStart,
      deadlineAt: dueAt,
    };
  }

  return null;
}

export function getFteDueState(now = new Date()) {
  const weekStart = startOfFteWeek(now);
  const dueAt = fteDueAtForWeek(weekStart);
  const msUntilDue = dueAt.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(msUntilDue / 86_400_000);
  const dueDateKey = dateInputString(dueAt);
  const todayKey = dateInputString(now);
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const tomorrowKey = dateInputString(tomorrow);
  const dueSoonLabel = dueDateKey === todayKey ? "Due today" : dueDateKey === tomorrowKey ? "Due tomorrow" : `Due in ${daysUntilDue} days`;
  const reminder = `Current-week FTE reports are due ${FTE_REPORTING_DEADLINE_LABEL}.`;

  if (msUntilDue < 0) {
    return {
      weekStart,
      dueAt,
      deadlineLabel: FTE_REPORTING_DEADLINE_LABEL,
      daysUntilDue,
      phase: "overdue" as const,
      priority: "high" as const,
      label: "Overdue",
      reminder: "Current-week FTE reports are past the Friday noon deadline.",
    };
  }

  if (daysUntilDue <= 1) {
    return {
      weekStart,
      dueAt,
      deadlineLabel: FTE_REPORTING_DEADLINE_LABEL,
      daysUntilDue,
      phase: "due_soon" as const,
      priority: "high" as const,
      label: dueSoonLabel,
      reminder,
    };
  }

  return {
    weekStart,
    dueAt,
    deadlineLabel: FTE_REPORTING_DEADLINE_LABEL,
    daysUntilDue,
    phase: "open" as const,
    priority: "normal" as const,
    label: `Due in ${daysUntilDue} days`,
    reminder,
  };
}

export function normalizeFteStatus(input: {
  requestedStatus?: string | null;
  role?: string | null;
  isCorrection: boolean;
}) {
  const status = String(input.requestedStatus || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  if (isExecutiveFteManager(input.role)) {
    return ["draft", "submitted", "corrected", "approved"].includes(status) ? status : "submitted";
  }

  if (status === "draft") return "draft";
  return input.isCorrection ? "corrected" : "submitted";
}

export function resolveFteCenterId(input: {
  role?: string | null;
  requestedCenterId?: string | null;
  primaryCenterId?: string | null;
  existingReportCenterId?: string | null;
}) {
  const requestedCenterId = input.requestedCenterId?.trim() || "";
  const primaryCenterId = input.primaryCenterId?.trim() || "";
  const existingReportCenterId = input.existingReportCenterId?.trim() || "";

  if (isExecutiveFteManager(input.role)) {
    const centerId = requestedCenterId || existingReportCenterId || primaryCenterId;
    return centerId
      ? { ok: true as const, centerId }
      : { ok: false as const, status: 400, error: "Choose a school before saving the FTE report." };
  }

  if (!primaryCenterId) {
    return {
      ok: false as const,
      status: 403,
      error: "This account is not assigned to a school for FTE reporting.",
    };
  }

  if (requestedCenterId && requestedCenterId !== primaryCenterId) {
    return {
      ok: false as const,
      status: 403,
      error: "Directors can submit FTE reports only for their assigned school.",
    };
  }

  if (existingReportCenterId && existingReportCenterId !== primaryCenterId) {
    return {
      ok: false as const,
      status: 403,
      error: "This FTE report is outside your assigned school.",
    };
  }

  return { ok: true as const, centerId: primaryCenterId };
}

export function validateFtePeriod(weekStart: Date | null, weekEnd: Date | null) {
  if (!weekStart) return { ok: false as const, status: 400, error: "Week start is required." };
  if (!weekEnd) return { ok: true as const };

  const diffDays = Math.round((weekEnd.getTime() - weekStart.getTime()) / 86_400_000);
  if (diffDays < 0) {
    return { ok: false as const, status: 400, error: "Week end cannot be before week start." };
  }
  if (diffDays > 13) {
    return { ok: false as const, status: 400, error: "FTE report periods must be two weeks or shorter." };
  }
  return { ok: true as const };
}
