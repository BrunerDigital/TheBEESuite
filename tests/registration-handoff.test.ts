import assert from "node:assert/strict";
import { test } from "node:test";
import {
  registrationHandoffHref,
  registrationLeadLookupWhere,
  resolveRegistrationHandoffCenter,
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

test("public website handoff accepts an exact public location identifier", () => {
  const centers = [
    { id: "school_a", crmLocationId: "Kid City USA - FL | Eustis", locationId: "FL-EUSTIS", name: "Kid City USA - Eustis" },
    { id: "school_b", crmLocationId: "Kid City USA - FL | Oviedo", locationId: "FL-OVIEDO", name: "Kid City USA - Oviedo" },
  ];

  assert.equal(resolveRegistrationHandoffCenter("kid city usa - fl | eustis", centers), "school_a");
  assert.equal(resolveRegistrationHandoffCenter("FL-OVIEDO", centers), "school_b");
  assert.equal(resolveRegistrationHandoffCenter("school_a", centers), "school_a");
  assert.equal(resolveRegistrationHandoffCenter("missing", centers), "");
});

test("public website handoff fails closed when a selector is ambiguous", () => {
  assert.equal(
    resolveRegistrationHandoffCenter("Shared School", [
      { id: "school_a", name: "Shared School" },
      { id: "school_b", name: "Shared School" },
    ]),
    "",
  );
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
