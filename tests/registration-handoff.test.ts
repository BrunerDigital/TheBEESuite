import assert from "node:assert/strict";
import { test } from "node:test";
import {
  registrationHandoffHref,
  registrationLeadLookupWhere,
  resolveRegistrationHandoffCenterId,
} from "@/lib/registration-handoff";

test("registration handoff pins the public application to the lead school", () => {
  assert.equal(
    registrationHandoffHref("center/kokomo west"),
    "/registration?centerId=center%2Fkokomo%20west",
  );
});

test("registration handoff omits an empty school selection", () => {
  assert.equal(registrationHandoffHref("  "), "/registration");
});

test("school-prefilled registration accepts only an available school", () => {
  assert.equal(resolveRegistrationHandoffCenterId("school_a", ["school_a", "school_b"]), "school_a");
  assert.equal(resolveRegistrationHandoffCenterId("school_missing", ["school_a", "school_b"]), "");
});

test("registration duplicate matching stays inside one school", () => {
  assert.deepEqual(registrationLeadLookupWhere("school_a", " Family@Example.com "), {
    centerId: "school_a",
    email: "family@example.com",
    status: { not: "lost" },
  });
  assert.notDeepEqual(
    registrationLeadLookupWhere("school_a", "family@example.com"),
    registrationLeadLookupWhere("school_b", "family@example.com"),
  );
});
