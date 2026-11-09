import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";
import { filterPublicWebsiteLocations, isBlockedPublicInquiryIdentifier } from "../src/lib/public-inquiry-policy";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate } from "../src/lib/active-school-locations";

const removed = [
  "Kid City USA - FL | Saint Cloud", "FL | Saint Cloud", "Kid City USA - Saint Cloud",
  "Kid City USA - FL | St. Cloud", "FL | St. Cloud", "Kid City USA - St. Cloud",
  "Kid City USA - IN | Bargersville", "IN | Bargersville", "Kid City USA - Bargersville",
  "Kid City USA - TN | Lewisburg", "TN | Lewisburg", "Kid City USA - Lewisburg",
  "Kid City USA - TN | Lewisburg 1", "TN | Lewisburg 1", "Kid City USA - Lewisburg 1",
  "Kid City USA - NV | Las Vegas 3", "NV | Las Vegas 3", "Kid City USA - Las Vegas 3",
  "Kid City USA - NV | Las Vegas 1 - Page", "NV | Las Vegas 1 - Page", "Kid City USA - Las Vegas 1 - Page",
];
const canonicalTargets = [removed[0], removed[6], removed[9], removed[15], removed[18]];
const retained = [
  "Kid City USA - FL | College Park", "Kid City USA - FL | Vero Beach",
  "Kid City USA - NV | Las Vegas 2 - Bonanza", "Kid City USA - TX | North Richland Hills",
  "Kid City USA - IN | Jasper - Truman", "Kid City USA - IN | Jasper - Baden Strasse",
  "Kid City USA - TN | Columbia", "Kid City USA - TN | Soddy Daisy",
];

function fixture(options = {}) {
  return inquiryFixture({ ...options, additionalLocations: [...canonicalTargets, ...retained] });
}

test("November removals are exact public exclusions; corrected College Park and Bonanza stay available", () => {
  for (const value of removed) {
    assert.equal(isBlockedPublicInquiryIdentifier(value), true, value);
    assert.equal(filterPublicWebsiteLocations([{ locationId: value }]).length, 0, value);
  }
  for (const value of [...retained, "Kid City USA - IN | Bargersville North", "Kid City USA - FL | Saint Cloud North"]) {
    assert.equal(isBlockedPublicInquiryIdentifier(value), false, value);
    assert.equal(filterPublicWebsiteLocations([{ locationId: value }]).length, 1, value);
  }
  assert.equal(filterPublicWebsiteLocations([{ crmLocationId: retained[0], locationId: removed[0] }]).length, 0);
});

test("live, empty and unavailable database catalogs exclude removals in directory and inquiry responses", async () => {
  for (const options of [{}, { emptyLive: true }, { liveFails: true }]) {
    const f = fixture(options);
    for (const query of ["", "?purpose=inquiry"]) {
      const response = await f.get(query);
      assert.equal(response.status, 200);
      const ids = response.body.locations.map((row: { crmLocationId: string }) => row.crmLocationId);
      for (const id of canonicalTargets) assert.equal(ids.includes(id), false, id);
      for (const id of retained) assert.equal(ids.includes(id), true, id);
    }
    assert.equal(f.effects.writes, 0);
    assert.equal(f.effects.unexpectedNetwork, 0);
  }
});

test("stale canonical, fixed-center, alias and conflicting selectors fail before lead or notification effects", async () => {
  for (const id of canonicalTargets) {
    for (const fields of [
      { locationId: id }, { location_id: id }, { centerId: "synthetic_" + id },
      { center_id: "synthetic_" + id }, { locationId: retained[0], publicLocationId: id },
      { locationId: retained[0], public_location_id: id }, { locationId: retained[0], locationName: id },
      { locationId: "legacy_" + id, brandName: "Kid City USA" },
    ]) for (const form of [false, true]) {
      const f = fixture();
      const response = await f.post(fields, { form });
      assert.equal(response.status, 400, JSON.stringify(fields));
      assert.equal(response.body.code, "ineligible_public_location");
      for (const key of ["writes", "notificationLookups", "emails", "sheets", "unexpectedNetwork"] as const)
        assert.equal(f.effects[key], 0, key);
    }
    const f = fixture({ defaultCenterId: "synthetic_" + id });
    assert.equal((await f.get("?purpose=inquiry&centerId=" + encodeURIComponent("synthetic_" + id))).body.inquiryCenterEligible, false);
    assert.equal((await f.post({ centerId: "synthetic_" + id }, { origin: "" })).status, 400);
    assert.equal((await f.post({ locationId: "unknown", brandName: "Example Brand" })).status, 400);
    assert.equal(f.effects.writes, 0);
  }
});

test("website removal preserves operational status, finance candidates and historical school data", () => {
  const f = fixture();
  for (const id of canonicalTargets) {
    const center = f.centers.find((row: { crmLocationId: string }) => row.crmLocationId === id);
    assert.ok(center);
    const before = structuredClone(center);
    assert.equal(isEligiblePublicInquiryCenter(center, true), false);
    assert.equal(isActivePublicSchoolCandidate(center), true);
    assert.equal(isActiveSchoolFinanceOperationsCandidate(center), true);
    assert.deepEqual(center, before);
  }
});

test("College Park, Bonanza and North Richland Hills still accept memory-only synthetic inquiries", async () => {
  for (const id of [retained[0], retained[2], retained[3]]) {
    const f = fixture();
    assert.equal((await f.post({ locationId: id })).status, 201);
    assert.equal(f.effects.leads[0].centerId, "synthetic_" + id);
    assert.equal(f.effects.unexpectedNetwork, 0);
  }
});

test("static fallback and WordPress source options omit retired schools and preserve College Park", () => {
  const rows = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")).locations;
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  for (const id of canonicalTargets) {
    assert.equal(rows.some((row: { crmLocationId: string }) => row.crmLocationId === id), false, id);
    assert.equal(html.includes(`value="${id}"`), false, id);
  }
  for (const id of retained.filter(id=>!id.includes("Bonanza"))) {
    assert.equal(rows.some((row: { crmLocationId: string }) => row.crmLocationId === id), true, id);
    assert.equal(html.includes(`value="${id}"`), true, id);
  }
});

for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
  test(`${script}: stale catalogs, fixed locations and forged selectors cannot advertise or submit removals`, async () => {
    const catalog = await embedFixture(script, { additionalLocations: [...removed, ...retained] });
    for (const id of removed) assert.equal(catalog.target.innerHTML.includes(id), false, id);
    for (const id of retained) assert.equal(catalog.target.innerHTML.includes(id), true, id);
    for (const id of removed) {
      const fixed = await embedFixture(script, { dataset: { locationName: id } });
      assert.doesNotMatch(fixed.target.innerHTML, /<form/);
      assert.match(fixed.target.innerHTML, /not accepting website inquiries/);
      assert.equal(fixed.calls.length, 0);
      const forged = await embedFixture(script, { fields: { locationId: id } });
      await forged.submit();
      assert.equal(forged.calls.some((call: { options?: { method?: string } }) => call.options?.method === "POST"), false);
      assert.match(forged.status.textContent, /not accepting website inquiries/);
    }
  });
  test(`${script}: College Park synthetic submission retains its selected school`, async () => {
    const f = await embedFixture(script, { fields: { locationId: retained[0] }, additionalLocations: retained });
    await f.submit();
    const sends = f.calls.filter((call: { options?: { method?: string } }) => call.options?.method === "POST");
    assert.equal(sends.length, 1);
    assert.equal(JSON.parse(sends[0].options.body).locationId, retained[0]);
  });
}
