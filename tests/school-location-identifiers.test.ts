import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalBrandLocationId,
  canonicalSchoolLocationId,
  locationAliasesFromCustomFields,
  parseSchoolLocationIdentifier,
} from "../src/lib/school-location-identifiers";

test("school identifiers parse legacy and branded location IDs", () => {
  assert.deepEqual(parseSchoolLocationIdentifier("FL | Sarasota"), {
    brandName: null,
    state: "FL",
    location: "Sarasota",
    unbrandedId: "FL | Sarasota",
    canonicalId: "FL | Sarasota",
  });
  assert.deepEqual(parseSchoolLocationIdentifier("Kid City USA - FL | Sarasota"), {
    brandName: "Kid City USA",
    state: "FL",
    location: "Sarasota",
    unbrandedId: "FL | Sarasota",
    canonicalId: "Kid City USA - FL | Sarasota",
  });
  assert.equal(canonicalBrandLocationId("Miss Honey's Learning Center", "GA | Lyons - Onion Sprouts"),
    "Miss Honey's Learning Center - GA | Lyons - Onion Sprouts");
});

test("canonical school IDs preserve unique branch identity", () => {
  assert.equal(canonicalSchoolLocationId({
    brandName: "Kid City USA",
    brandSlug: "kid-city-usa",
    crmLocationId: "CO | Woodland Par",
  }), "Kid City USA - CO | Woodland Park - East Midland");
  assert.equal(canonicalSchoolLocationId({
    brandName: "Kid City USA",
    brandSlug: "kid-city-usa",
    crmLocationId: "FL | Wekiva",
  }), "Kid City USA - FL | Longwood - Wekiva");
  assert.equal(canonicalSchoolLocationId({
    brandName: "Kid City USA",
    brandSlug: "kid-city-usa",
    crmLocationId: "IN | Paradise",
  }), "Kid City USA - IN | Newburgh - Paradise");
});

test("legacy location aliases are read without accepting unrelated JSON", () => {
  assert.deepEqual(locationAliasesFromCustomFields({
    locationAliases: ["FL | Sarasota", " FL | Sarasota ", "Kid City USA - Sarasota", 3],
  }), ["FL | Sarasota", "Kid City USA - Sarasota"]);
  assert.deepEqual(locationAliasesFromCustomFields({ locationAliases: "FL | Sarasota" }), []);
});
