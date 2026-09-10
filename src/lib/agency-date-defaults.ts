import { zonedDateKey } from "@/lib/zoned-date-time";

export function agencyDateDefault(timeZone: string, dayOffset = 0, now = new Date()) {
  const localDate = zonedDateKey(now, timeZone || "America/New_York");
  const calendarDate = new Date(`${localDate}T12:00:00.000Z`);
  calendarDate.setUTCDate(calendarDate.getUTCDate() + dayOffset);
  return calendarDate.toISOString().slice(0, 10);
}
