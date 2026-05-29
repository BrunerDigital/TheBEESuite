const executiveFteRoles = new Set(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"]);

export function isExecutiveFteManager(role?: string | null) {
  return Boolean(role && executiveFteRoles.has(role));
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

export function fteDueAtForWeek(weekStart: Date) {
  const dueAt = new Date(weekStart);
  dueAt.setUTCDate(dueAt.getUTCDate() + 4);
  dueAt.setUTCHours(22, 0, 0, 0);
  return dueAt;
}

export function getFteDueState(now = new Date()) {
  const weekStart = startOfFteWeek(now);
  const dueAt = fteDueAtForWeek(weekStart);
  const msUntilDue = dueAt.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(msUntilDue / 86_400_000);

  if (msUntilDue < 0) {
    return {
      weekStart,
      dueAt,
      daysUntilDue,
      phase: "overdue" as const,
      priority: "high" as const,
      label: "Overdue",
      reminder: "Current-week FTE reports are past the Friday due window.",
    };
  }

  if (daysUntilDue <= 1) {
    return {
      weekStart,
      dueAt,
      daysUntilDue,
      phase: "due_soon" as const,
      priority: "high" as const,
      label: daysUntilDue <= 0 ? "Due today" : "Due tomorrow",
      reminder: "Current-week FTE reports are due by Friday afternoon.",
    };
  }

  return {
    weekStart,
    dueAt,
    daysUntilDue,
    phase: "open" as const,
    priority: "normal" as const,
    label: `Due in ${daysUntilDue} days`,
    reminder: "Current-week FTE reports are due by Friday afternoon.",
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
