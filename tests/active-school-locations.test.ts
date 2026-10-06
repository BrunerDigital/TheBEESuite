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
  for (const crmLocationId of [
    "Kid City USA - FL | Deland - Amelia",
    "Kid City USA - FL | Deland - Orange",
    "Kid City USA - FL | Leesburg",
    "Kid City USA - FL | Palatka",
    "Kid City USA - FL | Sanford",
    "Kid City USA - TX | Tyler",
  ]) {
    assert.equal(isActivePublicSchoolCandidate({
      status: "active",
      crmLocationId,
      locationId: crmLocationId,
      name: crmLocationId,
    }), false, `${crmLocationId} must not return from an active center`);
  }
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

test("static Kid City fallback includes the Loogootee inquiry location", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const location = file.locations.find((item) => item.crmLocationId === "Kid City USA - IN | Loogootee");

  assert.deepEqual(location, {
    crmLocationId: "Kid City USA - IN | Loogootee",
    locationId: "Kid City USA - IN | Loogootee",
    name: "Kid City USA - Loogootee",
    address: "505 N. Oak Street",
    city: "Loogootee",
    state: "IN",
    postalCode: "47553",
    phone: "855-543-2489",
  });
});

test("static Kid City fallback excludes confirmed inactive schools", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const ids = new Set(file.locations.map((item) => item.crmLocationId));

  for (const id of [
    "Kid City USA - CO | Woodland Park - Forest Edge",
    "Kid City USA - FL | Jacksonville - Beach",
    "Kid City USA - FL | Jacksonville - Durbin",
    "Kid City USA - IN | Brownsburg",
    "Kid City USA - IN | Elkhart",
    "Kid City USA - MO | Lees Summit",
  ]) {
    assert.equal(ids.has(id), false, `${id} must not return through the public fallback`);
  }
  assert.equal(ids.has("Kid City USA - IN | Fishers"), false);
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
      crmLocationId: "FL | Lake City",
      locationId: "FL | Lake City",
      name: "Kid City USA - Lake City",
      address: "760 20th Avenue",
      city: "Vero Beach",
      state: "FL",
      postalCode: "32962",
      phone: "772-778-2262",
    },
  ];

  const merged = mergePublicKidCityLocations(liveLocations, staticLocations);

  assert.deepEqual(merged.map((location) => location.crmLocationId), [
    "Kid City USA - FL | Lake City",
    "Kid City USA - FL | Sarasota",
  ]);
  assert.equal(
    merged.find((location) => location.crmLocationId === "Kid City USA - FL | Sarasota")?.name,
    "Live Kid City USA - Sarasota",
  );
});

test("WordPress Avada inquiry snippet matches the corrected Indiana and closed-school routing", () => {
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");

  assert.doesNotMatch(snippet, /<option value="Kid City USA - IN \| Fishers"/);
  assert.match(snippet, /<option value="Kid City USA - IN \| Loogootee"[^>]*data-address="505 N\. Oak Street"/);
  for (const retiredLocation of ["Forest Edge", "Jacksonville - Beach", "Durbin", "Brownsburg", "Elkhart", "Lees Summit"]) {
    assert.doesNotMatch(snippet, new RegExp(`value="[^"]*${retiredLocation}`));
  }
});

test("Paradise and Petersburg stay available in public inquiry options", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  const ids = new Set(file.locations.map((item) => item.crmLocationId));
  for (const id of ["Kid City USA - IN | Newburgh - Paradise", "Kid City USA - IN | Petersburg"]) {
    assert.equal(ids.has(id), true, `${id} must be in the fallback`);
    assert.equal(snippet.includes(`value="${id}"`), true, `${id} must be in Avada`);
  }
});

test("green-X school removals cannot return through fallback or Avada options", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  const ids = new Set(file.locations.map((item) => item.crmLocationId));
  for (const id of [
    "Kid City USA - CO | Grand Junction",
    "Kid City USA - CO | Longmont",
    "Kid City USA - FL | Altamonte - Fruitland",
    "Kid City USA - FL | Anthony",
    "Kid City USA - FL | Bunnell",
    "Kid City USA - FL | Crystal River",
    "Kid City USA - FL | Eustis",
    "Kid City USA - FL | Gainesville",
    "Kid City USA - FL | Glen Saint Mary",
    "Kid City USA - FL | Hampton",
    "Kid City USA - FL | Heathrow",
    "Kid City USA - FL | Jacksonville - Abess",
    "Kid City USA - FL | Jacksonville - Fruit Cove",
    "Kid City USA - FL | Jacksonville - Jacksonville Heights",
    "Kid City USA - FL | Lake Mary",
    "Kid City USA - FL | Lake Wales",
    "Kid City USA - FL | Longwood - SR 434",
    "Kid City USA - FL | Macclenny",
    "Kid City USA - FL | Melbourne",
    "Kid City USA - FL | Mount Dora",
    "Kid City USA - FL | New Smyrna Beach",
    "Kid City USA - FL | Ocala",
    "Kid City USA - FL | Ocala - 1st Terrace",
    "Kid City USA - FL | Ocala - 35th Street",
    "Kid City USA - FL | Ormond Beach 2",
    "Kid City USA - FL | Palm Bay",
    "Kid City USA - FL | Palm Coast",
    "Kid City USA - FL | Panama City",
    "Kid City USA - FL | Port Orange",
    "Kid City USA - FL | Riverview",
    "Kid City USA - FL | South Daytona",
    "Kid City USA - FL | Starke",
    "Kid City USA - IN | Beech Grove",
    "Kid City USA - IN | Beech Grove 4520",
    "Kid City USA - IN | Beech Grove 4521",
    "Kid City USA - IN | Evansville",
    "Kid City USA - IN | Fishers",
    "Kid City USA - IN | Franklin Township",
    "Kid City USA - IN | Lebanon",
    "Kid City USA - IN | McCordsville",
    "Kid City USA - SC | Bluffton",
    "Kid City USA - TX | Friendswood",
    "Kid City USA - TX | Pilot Point",
    "Kid City USA - TX | Terrell",
    // Additional removals requested after Marie's green-X list.
    "Kid City USA - FL | Deland - Amelia",
    "Kid City USA - FL | Deland - Orange",
    "Kid City USA - FL | Leesburg",
    "Kid City USA - FL | Palatka",
    "Kid City USA - FL | Sanford",
    "Kid City USA - TX | Tyler",
  ]) {
    assert.equal(ids.has(id), false, `${id} must not return through the fallback`);
    assert.equal(snippet.includes(`value="${id}"`), false, `${id} must not return through Avada`);
  }
});

test("retained Vero Beach and both Jasper schools remain in fallback and Avada", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  for (const id of ["Kid City USA - FL | Vero Beach", "Kid City USA - IN | Jasper - Truman", "Kid City USA - IN | Jasper - Baden Strasse"]) {
    assert.equal(file.locations.some((item) => item.crmLocationId === id), true, id);
    assert.equal(snippet.includes(`value="${id}"`), true, id);
  }
});

test("Cordera cannot return through public fallback or Avada options", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  const id = "Kid City USA - CO | Colorado Springs - Cordera";
  assert.equal(file.locations.some((item) => item.crmLocationId === id), false);
  assert.equal(snippet.includes(`value="${id}"`), false);
});

test("approved Soddy Daisy reinstatement is available in fallback and Avada", () => {
  const file = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")) as PublicLocationFile;
  const snippet = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  const id = "Kid City USA - TN | Soddy Daisy";
  const location = file.locations.find((item) => item.crmLocationId === id);
  assert.equal(location?.address, "9834 Dayton Pike");
  assert.equal(location?.postalCode, "37379");
  assert.equal(snippet.includes(`value="${id}"`), true);
});
