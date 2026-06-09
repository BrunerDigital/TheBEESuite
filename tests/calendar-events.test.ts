import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRecurrenceRule,
  calendarEventToGooglePayload,
  expandCalendarEventOccurrences,
  normalizeCalendarEventInput,
} from "../src/lib/calendar-events";

describe("calendar event workflows", () => {
  it("normalizes closure input and builds a weekly RRULE", () => {
    const input = normalizeCalendarEventInput({
      title: "Staff training closure",
      eventType: "closure",
      recurrenceFrequency: "weekly",
      recurrenceInterval: "2",
      recurrenceWeekdays: ["MO", "WE"],
      recurrenceUntil: "2026-07-01",
    });

    assert.equal(input.eventType, "closure");
    assert.equal(input.allDay, true);
    assert.equal(input.visibility, "parents");
    assert.equal(input.recurrenceRule, "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20260701T235959Z");
  });

  it("expands weekly recurring events inside the requested window", () => {
    const events = [{
      id: "event-1",
      startsAt: new Date("2026-06-01T14:00:00.000Z"),
      endsAt: new Date("2026-06-01T15:00:00.000Z"),
      recurrenceRule: buildRecurrenceRule({
        frequency: "weekly",
        interval: 1,
        weekdays: ["MO", "WE"],
        until: new Date("2026-06-15T23:59:59.000Z"),
      }),
    }];

    const occurrences = expandCalendarEventOccurrences(
      events,
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-10T23:59:59.000Z"),
    );

    assert.deepEqual(occurrences.map((occurrence) => occurrence.startsAt.toISOString()), [
      "2026-06-01T14:00:00.000Z",
      "2026-06-03T14:00:00.000Z",
      "2026-06-08T14:00:00.000Z",
      "2026-06-10T14:00:00.000Z",
    ]);
  });

  it("formats all-day Google Calendar payloads with recurrence", () => {
    const payload = calendarEventToGooglePayload({
      title: "Holiday closure",
      eventType: "holiday",
      startsAt: new Date("2026-07-04T00:00:00.000Z"),
      endsAt: new Date("2026-07-05T00:00:00.000Z"),
      allDay: true,
      recurrenceRule: "RRULE:FREQ=YEARLY;INTERVAL=1",
      visibility: "parents",
      centerName: "Kid City USA - Demo",
    });

    assert.equal(payload.summary, "Holiday closure");
    assert.deepEqual(payload.start, { date: "2026-07-04" });
    assert.deepEqual(payload.end, { date: "2026-07-05" });
    assert.deepEqual(payload.recurrence, ["RRULE:FREQ=YEARLY;INTERVAL=1"]);
  });
});
