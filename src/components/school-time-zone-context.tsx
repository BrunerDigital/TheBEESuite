"use client";

import { createContext, useContext } from "react";
import { formatZonedDateTime } from "@/lib/zoned-date-time";

export const DEFAULT_SCHOOL_TIME_ZONE = "America/New_York";

type SchoolTimeZoneContextValue = { defaultTimeZone: string; byCenterId: Record<string, string> };

const SchoolTimeZoneContext = createContext<SchoolTimeZoneContextValue>({ defaultTimeZone: DEFAULT_SCHOOL_TIME_ZONE, byCenterId: {} });

export function SchoolTimeZoneProvider({ children, timeZone, timeZonesByCenterId = {} }: { children: React.ReactNode; timeZone?: string | null; timeZonesByCenterId?: Record<string, string> }) {
  return <SchoolTimeZoneContext value={{ defaultTimeZone: timeZone || DEFAULT_SCHOOL_TIME_ZONE, byCenterId: timeZonesByCenterId }}>{children}</SchoolTimeZoneContext>;
}

export function useSchoolTimeZone() {
  return useContext(SchoolTimeZoneContext).defaultTimeZone;
}

export function SchoolDateTime({
  value,
  options,
  fallback,
  timeZone,
  centerId,
}: {
  value: Date | string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
  timeZone?: string | null;
  centerId?: string | null;
}) {
  const context = useContext(SchoolTimeZoneContext);
  return formatZonedDateTime(value, timeZone || (centerId ? context.byCenterId[centerId] : null) || context.defaultTimeZone, options, fallback);
}
