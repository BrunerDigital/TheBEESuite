import assert from "node:assert/strict";
import test from "node:test";
import {
  dailyReportTimedCareEvents,
  sortDailyReportsChronologically,
} from "../src/lib/daily-report-ordering";

test("daily report care events combine naps and diapers in chronological order", () => {
  const events = dailyReportTimedCareEvents({
    naps: [{
      id: "nap",
      startsAt: "2026-07-27T14:20:00.000Z",
      endsAt: "2026-07-27T14:55:00.000Z",
    }],
    diapers: [
      { id: "late", type: "Wet", occurredAt: "2026-07-27T15:35:00.000Z", notes: null },
      { id: "early", type: "Wet and BM", occurredAt: "2026-07-27T12:43:00.000Z", notes: null },
    ],
  });

  assert.deepEqual(events.map((event) => event.id), ["early", "nap", "late"]);
});

test("same-day daily report records use care time and sent time instead of database order", () => {
  const reports = sortDailyReportsChronologically([
    {
      id: "late-diaper",
      date: "2026-07-27T12:00:00.000Z",
      sentAt: "2026-07-27T17:19:34.878Z",
      diapers: [{ id: "d2", type: "Wet and BM", occurredAt: "2026-07-27T15:51:00.000Z", notes: null }],
    },
    {
      id: "lunch",
      date: "2026-07-27T12:00:00.000Z",
      sentAt: "2026-07-27T15:50:50.726Z",
    },
    {
      id: "nap",
      date: "2026-07-27T12:00:00.000Z",
      sentAt: "2026-07-27T15:51:56.909Z",
      naps: [{ id: "n1", startsAt: "2026-07-27T14:20:00.000Z", endsAt: "2026-07-27T14:55:00.000Z" }],
    },
    {
      id: "early-diaper",
      date: "2026-07-27T12:00:00.000Z",
      sentAt: "2026-07-27T12:43:47.631Z",
      diapers: [{ id: "d1", type: "Wet", occurredAt: "2026-07-27T12:43:00.000Z", notes: null }],
    },
  ]);

  assert.deepEqual(reports.map((report) => report.id), [
    "early-diaper",
    "nap",
    "lunch",
    "late-diaper",
  ]);
});
