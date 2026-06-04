import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultCenterNameFromCrmLocationId,
  isActivePublicSchoolCandidate,
  normalizeCrmLocationId,
  parseCrmLocationId,
  toPublicKidCityLocation,
} from "../src/lib/active-school-locations";

test("active school location IDs normalize to ST pipe City format", () => {
  assert.deepEqual(parseCrmLocationId("fl| Sarasota"), {
    state: "FL",
    city: "Sarasota",
    crmLocationId: "FL | Sarasota",
  });
  assert.equal(normalizeCrmLocationId(" IN   |   McCordsville "), "IN | McCordsville");
  assert.equal(normalizeCrmLocationId("Kid City USA - Sarasota"), "");
});

test("active public school candidates require active status and a valid CRM location ID", () => {
  assert.equal(isActivePublicSchoolCandidate({
    status: "active",
    crmLocationId: "FL | Sarasota",
    locationId: "Kid City USA - Sarasota",
    name: "Kid City USA - Sarasota",
  }), true);
  assert.equal(isActivePublicSchoolCandidate({
    status: "lead_queue",
    crmLocationId: "FL | Sarasota",
    locationId: "Kid City USA - Sarasota",
    name: "Kid City USA - Sarasota",
  }), false);
  assert.equal(isActivePublicSchoolCandidate({
    status: "active",
    crmLocationId: "Kid City USA - Sarasota",
    locationId: "Kid City USA - Sarasota",
    name: "Kid City USA - Sarasota",
  }), false);
});

test("public Kid City location serialization feeds the inquiry dropdown", () => {
  const location = toPublicKidCityLocation({
    status: "active",
    crmLocationId: "fl| Sarasota",
    locationId: "",
    name: "",
    address: "374 Scott Ave",
    city: "",
    state: "",
    postalCode: "34243",
    phone: "941-210-4482",
  });

  assert.deepEqual(location, {
    crmLocationId: "FL | Sarasota",
    locationId: "FL | Sarasota",
    name: "Kid City USA - Sarasota",
    address: "374 Scott Ave",
    city: "Sarasota",
    state: "FL",
    postalCode: "34243",
    phone: "941-210-4482",
  });
  assert.equal(defaultCenterNameFromCrmLocationId("FL | Sarasota"), "Kid City USA - Sarasota");
});
