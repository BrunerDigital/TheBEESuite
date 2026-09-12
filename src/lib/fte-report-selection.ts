export type FteReportSelection = {
  centerId: string | null;
  weekStart: string | null;
  error: string | null;
};

/** URL targets are selectors, never permission grants or fallback school choices. */
export function resolveFteReportSelection(
  allowedCenterIds: readonly string[],
  requestedCenter?: string,
  requestedWeek?: string,
): FteReportSelection {
  const centerId = requestedCenter && requestedCenter !== "all" ? requestedCenter : null;
  const weekStart = requestedWeek && requestedWeek !== "all" ? requestedWeek : null;
  if (centerId && !allowedCenterIds.includes(centerId)) {
    return { centerId: null, weekStart: null, error: "This school is not available in your current workspace. Choose an authorized school before opening a report." };
  }
  if (weekStart && (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)
    || Number.isNaN(Date.parse(`${weekStart}T00:00:00.000Z`))
    || new Date(`${weekStart}T00:00:00.000Z`).toISOString().slice(0, 10) !== weekStart)) {
    return { centerId, weekStart: null, error: "The requested reporting date is invalid. Choose a reporting week before opening a report." };
  }
  return { centerId, weekStart, error: null };
}
