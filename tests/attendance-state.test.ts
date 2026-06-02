import assert from "node:assert/strict";
import { test } from "node:test";
import { isLatePickup, readLatePickupCutoff } from "@/lib/attendance-state";

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
