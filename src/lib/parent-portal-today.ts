export type ParentPortalTodayState = {
  status: "checked_in" | "checked_out" | "present" | "absent" | "not_marked";
  label: string;
  latestEventAt: string | null;
  currentLocationName: string | null;
  dailyReportShared: boolean;
};

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeLocation(value: unknown) {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, 120) : null;
}

export function buildParentPortalTodayState(input: {
  attendanceStatus?: string | null;
  attendanceMarkedAt?: Date | string | null;
  latestCheckType?: string | null;
  latestCheckAt?: Date | string | null;
  currentLocationName?: string | null;
  currentLocationIsFresh?: boolean;
  dailyReportShared?: boolean;
}): ParentPortalTodayState {
  const checkType = input.latestCheckType?.trim().toLowerCase();
  const attendance = input.attendanceStatus?.trim().toLowerCase();
  const status = checkType === "check_in"
    ? "checked_in"
    : checkType === "check_out"
      ? "checked_out"
      : attendance === "present"
        ? "present"
        : attendance === "absent"
          ? "absent"
          : "not_marked";
  const labels: Record<ParentPortalTodayState["status"], string> = {
    checked_in: "Checked in",
    checked_out: "Checked out",
    present: "Present",
    absent: "Absent",
    not_marked: "Not marked today",
  };
  return {
    status,
    label: labels[status],
    latestEventAt: iso(input.latestCheckAt) ?? iso(input.attendanceMarkedAt),
    currentLocationName: input.currentLocationIsFresh === true && (status === "checked_in" || status === "present")
      ? safeLocation(input.currentLocationName)
      : null,
    dailyReportShared: input.dailyReportShared === true,
  };
}
