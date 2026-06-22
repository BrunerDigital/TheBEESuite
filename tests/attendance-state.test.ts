import assert from "node:assert/strict";
import { test } from "node:test";
import { centerServiceDayWindow, isLatePickup, readCenterTimeZone, readLatePickupCutoff } from "@/lib/attendance-state";

test("late pickup cutoff defaults and reads center customization", () => {
  assert.equal(readLatePickupCutoff(null), "18:00");
  assert.equal(readLatePickupCutoff({ latePickupCutoff: "17:45" }), "17:45");
  assert.equal(readLatePickupCutoff({ latePickupCutoff: "bad" }), "18:00");
});

test("late pickup is evaluated in the center time zone", () => {
  const afterCutoff = new Date("2026-06-02T22:05:00.000Z");
  const beforeCutoff = new Date("2026-06-02T21:30:00.000Z");

  assert.equal(isLatePickup(afterCutoff, "America/New_York", "18:00"), true);
  assert.equal(isLatePickup(beforeCutoff, "America/New_York", "18:00"), false);
});

test("center timezone prefers stored values and falls back from school location", () => {
  assert.equal(
    readCenterTimeZone({
      timezone: "America/Denver",
      customFields: { timeZone: "America/New_York" },
      city: "Kokomo",
      state: "IN",
    }),
    "America/Denver",
  );
  assert.equal(readCenterTimeZone({ timezone: "bad", city: "Kokomo", state: "IN" }), "America/Indiana/Indianapolis");
  assert.equal(readCenterTimeZone({ timezone: "America/New_York", city: "Kokomo", state: "IN" }), "America/Indiana/Indianapolis");
  assert.equal(readCenterTimeZone({ timezone: "America/New_York", city: "Newburgh", state: "IN" }), "America/Chicago");
  assert.equal(readCenterTimeZone({ timezone: "America/New_York", city: "Jasper", state: "IN" }), "America/Indiana/Indianapolis");
  assert.equal(readCenterTimeZone({ timezone: "America/New_York", customFields: { timeZone: "America/Chicago" } }), "America/Chicago");
  assert.equal(readCenterTimeZone({ city: "Panama City", state: "FL" }), "America/Chicago");
  assert.equal(readCenterTimeZone({ city: "Tallahassee", state: "FL" }), "America/New_York");
  assert.equal(readCenterTimeZone({ city: "Phoenix", state: "AZ" }), "America/Phoenix");
});

test("center service day uses location fallback for kiosk day boundaries", () => {
  const day = centerServiceDayWindow(new Date("2026-06-22T15:00:00.000Z"), {
    city: "Kokomo",
    state: "IN",
  });

  assert.equal(day.timeZone, "America/Indiana/Indianapolis");
  assert.equal(day.start.toISOString(), "2026-06-22T04:00:00.000Z");
  assert.equal(day.end.toISOString(), "2026-06-23T04:00:00.000Z");
});
