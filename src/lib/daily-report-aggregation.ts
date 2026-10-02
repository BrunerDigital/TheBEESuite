type DailyReportEntries = {
  id: string; date: Date; mood: string | null; teacherNote: string | null; suppliesNeeded: string | null;
  meals: unknown[]; naps: unknown[]; diapers: unknown[]; activities: unknown[];
};

// Callers own the exact child, school and service-day scope. Never overwrite
// source reports: the combined view retains every independently logged entry.
export function aggregateDailyReportEntries<T extends DailyReportEntries>(reports: T[]): T | null {
  if (!reports.length) return null;
  const ordered = [...reports].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const latest = ordered.at(-1)!;
  const join = (key: "teacherNote" | "suppliesNeeded") => [...new Set(ordered.map(row => row[key]?.trim()).filter(Boolean))].join("\n") || null;
  return { ...latest, teacherNote: join("teacherNote"), suppliesNeeded: join("suppliesNeeded"),
    meals: ordered.flatMap(row => row.meals), naps: ordered.flatMap(row => row.naps),
    diapers: ordered.flatMap(row => row.diapers), activities: ordered.flatMap(row => row.activities) } as T;
}
