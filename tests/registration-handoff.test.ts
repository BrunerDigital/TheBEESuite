import assert from "node:assert/strict";
import { test } from "node:test";
import { registrationHandoffHref } from "@/lib/registration-handoff";

test("registration handoff pins the public application to the lead school", () => {
  assert.equal(
    registrationHandoffHref("center/kokomo west"),
    "/registration?centerId=center%2Fkokomo%20west",
  );
});

test("registration handoff omits an empty school selection", () => {
  assert.equal(registrationHandoffHref("  "), "/registration");
});
