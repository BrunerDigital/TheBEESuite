type DateValue = Date | string | null | undefined;

type TimedDailyReport = {
  id: string;
  date: DateValue;
  sentAt?: DateValue;
  naps?: Array<{
    id?: string;
    startsAt: Date | string;
    endsAt: DateValue;
  }>;
  diapers?: Array<{
    id?: string;
    type: string;
    occurredAt: Date | string;
    notes: string | null;
  }>;
};

export type DailyReportTimedCareEvent =
  | {
      id: string;
      kind: "nap";
      occurredAt: Date | string;
      startsAt: Date | string;
      endsAt: DateValue;
    }
  | {
      id: string;
      kind: "diaper";
      occurredAt: Date | string;
      type: string;
      notes: string | null;
    };

function timestamp(value: DateValue) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dailyReportTimedCareEvents(report: Pick<TimedDailyReport, "naps" | "diapers">) {
  const events: DailyReportTimedCareEvent[] = [
    ...(report.naps ?? []).map((nap, index) => ({
      id: nap.id ?? `nap-${index}`,
      kind: "nap" as const,
      occurredAt: nap.startsAt,
      startsAt: nap.startsAt,
      endsAt: nap.endsAt,
    })),
    ...(report.diapers ?? []).map((entry, index) => ({
      id: entry.id ?? `diaper-${index}`,
      kind: "diaper" as const,
      occurredAt: entry.occurredAt,
      type: entry.type,
      notes: entry.notes,
    })),
  ];

  return events.toSorted((left, right) => {
    const timeDifference = timestamp(left.occurredAt) - timestamp(right.occurredAt);
    return timeDifference || left.id.localeCompare(right.id);
  });
}

export function dailyReportChronologyTimestamp(report: TimedDailyReport) {
  const firstTimedEvent = dailyReportTimedCareEvents(report)[0];
  return timestamp(firstTimedEvent?.occurredAt ?? report.sentAt ?? report.date);
}

export function sortDailyReportsChronologically<T extends TimedDailyReport>(reports: readonly T[]) {
  return reports.toSorted((left, right) => {
    const timeDifference = dailyReportChronologyTimestamp(left) - dailyReportChronologyTimestamp(right);
    if (timeDifference) return timeDifference;

    const sentDifference = timestamp(left.sentAt) - timestamp(right.sentAt);
    return sentDifference || left.id.localeCompare(right.id);
  });
}
