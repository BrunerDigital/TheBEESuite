import { zonedDateKey } from "@/lib/zoned-date-time";

export function agencyDateDefault(timeZone: string, dayOffset = 0, now = new Date()) {
  const localDate = zonedDateKey(now, timeZone || "America/New_York");
  const calendarDate = new Date(`${localDate}T12:00:00.000Z`);
  calendarDate.setUTCDate(calendarDate.getUTCDate() + dayOffset);
  return calendarDate.toISOString().slice(0, 10);
}

/** Allow the longer of a 60-day lookback from today or from coverage start. */
export function agencyClaimServiceStartMin(coverageStart: string | Date, timeZone: string, now = new Date()) {
  const coverageDate = coverageStart instanceof Date ? coverageStart.toISOString().slice(0, 10) : coverageStart.slice(0, 10);
  const today = agencyDateDefault(timeZone, 0, now);
  const earliest = new Date(`${coverageDate < today ? coverageDate : today}T12:00:00.000Z`);
  earliest.setUTCDate(earliest.getUTCDate() - 60);
  return earliest.toISOString().slice(0, 10);
}
