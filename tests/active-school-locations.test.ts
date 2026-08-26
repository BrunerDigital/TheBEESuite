import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  defaultCenterNameFromCrmLocationId,
  isActivePublicSchoolCandidate,
  mergePublicKidCityLocations,
  normalizeCrmLocationId,
  parseCrmLocationId,
  toPublicKidCityLocation,
} from "../src/lib/active-school-locations";

type PublicLocationFile = {
  locations: Array<{
    crmLocationId: string;
    locationId: string;
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
  }>;
};

test("active school location IDs normalize legacy and branded formats", () => {
  assert.deepEqual(parseCrmLocationId("fl| Sarasota"), {
    brandName: null,
    state: "FL",
    city: "Sarasota",
    crmLocationId: "FL | Sarasota",
  });
  assert.equal(normalizeCrmLocationId(" IN   |   McCordsville "), "IN | McCordsville");
  assert.equal(normalizeCrmLocationId("Kid City USA - FL | Sarasota"), "Kid City USA - FL | Sarasota");
});

test("active public school candidates require active status and a valid CRM location ID", () => {
  assert.equal(isActivePublicSchoolCandidate({
    status: "active",
    crmLocationId: "Kid City USA - FL | Sarasota",
    locationId: "Kid City USA - FL | Sarasota",
    name: "Kid City USA - Sarasota",
  }), true);
  assert.equal(isActivePublicSchoolCandidate({
    status: "lead_queue",
    crmLocationId: "Kid City USA - FL | Sarasota",
    locationId: "Kid City USA - FL | Sarasota",
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
    crmLocationId: "Kid City USA - FL | Sarasota",
    locationId: "Kid City USA - FL | Sarasota",
    name: "Kid City USA - Sarasota",
    address: "374 Scott Ave",
    city: "Sarasota",
    state: "FL",
    postalCode: "34243",
    phone: "941-210-4482",
  });
  assert.equal(defaultCenterNameFromCrmLocationId("FL | Sarasota"), "Kid City USA - Sarasota");
});

test("static Kid City fallback locations use the canonical branded Vero Beach ID", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const location = file.locations.find((item) => item.crmLocationId === "Kid City USA - FL | Vero Beach");

  assert.deepEqual(location, {
    crmLocationId: "Kid City USA - FL | Vero Beach",
    locationId: "Kid City USA - FL | Vero Beach",
    name: "Kid City USA - Vero Beach",
    address: "760 20th Avenue",
    city: "Vero Beach",
    state: "FL",
    postalCode: "32962",
    phone: "772-778-2262",
  });
});

test("static Kid City fallback excludes confirmed inactive schools", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const ids = new Set(file.locations.map((item) => item.crmLocationId));

  for (const id of [
    "Kid City USA - CO | Woodland Park - Forest Edge",
    "Kid City USA - FL | Jacksonville - Durbin",
    "Kid City USA - IN | Brownsburg",
    "Kid City USA - IN | Elkhart",
    "Kid City USA - MO | Lees Summit",
  ]) {
    assert.equal(ids.has(id), false, `${id} must not return through the public fallback`);
  }
  assert.equal(ids.has("Kid City USA - IN | Fishers"), true);
});

test("live Kid City location API results keep static locations missing from the database", () => {
  const liveLocations: PublicLocationFile["locations"] = [
    {
      crmLocationId: "FL | Sarasota",
      locationId: "Kid City USA - Sarasota",
      name: "Live Kid City USA - Sarasota",
      address: "374 Scott Ave",
      city: "Sarasota",
      state: "FL",
      postalCode: "34243",
      phone: "941-210-4482",
    },
  ];
  const staticLocations: PublicLocationFile["locations"] = [
    {
      crmLocationId: "FL | Sarasota",
      locationId: "FL | Sarasota",
      name: "Kid City USA - Sarasota",
      address: "374 Scott Ave",
      city: "Sarasota",
      state: "FL",
      postalCode: "34243",
      phone: "941-210-4482",
    },
    {
      crmLocationId: "FL | Vero Beach",
      locationId: "FL | Vero Beach",
      name: "Kid City USA - Vero Beach",
      address: "760 20th Avenue",
      city: "Vero Beach",
      state: "FL",
      postalCode: "32962",
      phone: "772-778-2262",
    },
  ];

  const merged = mergePublicKidCityLocations(liveLocations, staticLocations);

  assert.deepEqual(merged.map((location) => location.crmLocationId), [
    "Kid City USA - FL | Sarasota",
    "Kid City USA - FL | Vero Beach",
  ]);
  assert.equal(
    merged.find((location) => location.crmLocationId === "Kid City USA - FL | Sarasota")?.name,
    "Live Kid City USA - Sarasota",
  );
});

test("WordPress Avada inquiry snippet uses the branded Vero Beach location ID", () => {
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");

  assert.match(snippet, /<option value="Kid City USA - FL \| Vero Beach"[^>]*>Kid City USA - FL \| Vero Beach<\/option>/);
  assert.match(snippet, /data-location-name="Kid City USA - Vero Beach"/);
});

test("WordPress Avada inquiry snippet matches the corrected Indiana and closed-school routing", () => {
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");

  assert.match(snippet, /<option value="Kid City USA - IN \| Fishers"/);
  for (const retiredLocation of ["Forest Edge", "Durbin", "Brownsburg", "Elkhart", "Lees Summit"]) {
    assert.doesNotMatch(snippet, new RegExp(`value="[^"]*${retiredLocation}`));
  }
});
