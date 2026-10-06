export const IMPORT_COUNTER_KEYS = ["createdFamilies", "updatedFamilies", "createdChildren", "createdClassrooms", "createdStaff", "updatedStaff", "createdStaffLogins", "emergencyContacts", "authorizedPickups", "medicalRows", "attendanceRows", "checkLogRows", "invoiceRows", "ledgerRows"] as const;
export type ImportCounters = Record<(typeof IMPORT_COUNTER_KEYS)[number], number>;
export const IMPORT_COUNTER_CHECKPOINT = "_beeImportCounterCheckpoint";

export function importCounterDelta(before: ImportCounters, after: ImportCounters) {
  return Object.fromEntries(IMPORT_COUNTER_KEYS.map(key => [key, Math.max(0, after[key] - before[key])])) as ImportCounters;
}

export function recoveredImportCounters(summary: Record<string, unknown>, records: Array<{ rawData: unknown }>) {
  const checkpointCounters = Object.fromEntries(IMPORT_COUNTER_KEYS.map(key => [key, 0])) as ImportCounters;
  for (const row of records) {
    const raw = row.rawData as Record<string, unknown> | null;
    if (typeof raw?.[IMPORT_COUNTER_CHECKPOINT] !== "string") continue;
    let checkpoint;
    try { checkpoint = JSON.parse(raw[IMPORT_COUNTER_CHECKPOINT] as string); } catch { continue; }
    if (checkpoint?.version !== 1 || !checkpoint.counters || !IMPORT_COUNTER_KEYS.every(key => Number.isSafeInteger(checkpoint.counters[key]) && checkpoint.counters[key] >= 0)) continue;
    for (const key of IMPORT_COUNTER_KEYS) checkpointCounters[key] += checkpoint.counters[key];
  }
  const previous = summary.checkpointCounters as Partial<ImportCounters> | undefined;
  const counters = Object.fromEntries(IMPORT_COUNTER_KEYS.map(key => [key,
    Math.max(0, Number(summary[key] || 0) - Number(previous?.[key] || 0)) + checkpointCounters[key],
  ])) as ImportCounters;
  return { counters, checkpointCounters };
}
