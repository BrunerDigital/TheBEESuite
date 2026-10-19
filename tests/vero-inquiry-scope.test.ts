import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterPublicInquiryLocations, isBlockedPublicInquiryIdentifier, isAmbiguousPublicInquiryIdentifier } from "../src/lib/public-inquiry-policy";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { filterPublicKidCityLocations, isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate, toPublicKidCityLocation } from "../src/lib/active-school-locations";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";

const vero = "Kid City USA - FL | Vero Beach";
const douglas = "Kid City USA - FL | Altamonte - Douglas";
const pending = ["Kid City USA - TN | Lewisburg", "Kid City USA - TN | Pulaski"];
const aliases = [vero, "FL | Vero Beach", " fl| VERO BEACH ", "Kid City USA – FL | Vero Beach", "Kid City USA - Vero Beach", "Vero Beach", "Vero.Beach"];
const additionalCenters = [vero, ...pending].map((location, index) => ({
  id: index === 0 ? "center_vero_fixture" : `center_pending_${index}`,
  name: location, crmLocationId: location, locationId: location, status: "active",
  email: "fixture@example.invalid", tenantId: "tenant_fixture",
  organization: { tenantId: "tenant_fixture" },
  customFields: { locationAliases: index === 0 ? ["old-vero-form"] : [] },
}));

test("Vero inquiry restriction recognizes exact aliases without substring matching", () => {
  for (const id of aliases) {
    assert.equal(isBlockedPublicInquiryIdentifier(id) || isAmbiguousPublicInquiryIdentifier(id), true, id);
    for (const strict of [false, true]) {
      assert.equal(isEligiblePublicInquiryCenter({ ...additionalCenters[0], crmLocationId: id, locationId: id, name: id }, strict), false, id);
    }
  }
  for (const id of [...pending, douglas, "FL | Longwood - Wekiva", "FL | Vero Beach West", "Other Brand - FL | Vero Beach", "Vero"]) {
    assert.equal(isBlockedPublicInquiryIdentifier(id), false, id);
  }
});

test("Vero directory, registration catalog, school status and financial selectors remain unchanged", () => {
  const school = additionalCenters[0];
  const location = toPublicKidCityLocation(school);
  assert.equal(isActivePublicSchoolCandidate(school), true);
  assert.equal(isActiveSchoolFinanceOperationsCandidate(school), true);
  assert.deepEqual(filterPublicKidCityLocations([location]), [location]);
  assert.deepEqual(filterPublicInquiryLocations([location]), []);
  assert.equal(school.status, "active");
  const catalog = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8"));
  assert.equal(catalog.locations.some((item: { crmLocationId: string }) => item.crmLocationId === vero), true);
});

test("inquiry template excludes Vero while pending Lewisburg and Pulaski remain unchanged", () => {
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  assert.equal(html.includes(`value="${vero}"`), false);
  for (const id of [...pending, douglas]) assert.equal(html.includes(`value="${id}"`), true, id);
});

test("complete Vero intake handler rejects JSON, form, alias and opaque identifiers before effects", async () => {
  const requests = [
    ...aliases.map((locationId) => ({ locationId })),
    { location_id: "FL | Vero Beach" },
    { locationId: douglas, publicLocationId: vero },
    { location_id: douglas, public_location_id: vero },
    { centerId: "center_vero_fixture" },
    { center_id: "center_vero_fixture" },
    { centerId: "center_douglas_fixture", locationName: "Kid City USA - Vero Beach" },
    { locationId: "old-vero-form", brandName: "Kid City USA" },
  ];
  for (const fields of requests) for (const form of [false, true]) {
    const fixture = inquiryFixture({ additionalCenters });
    const response = await fixture.post(fields, { form });
    assert.equal(response.status, 400, JSON.stringify(fields));
    assert.equal(response.body.code, "ineligible_public_location");
    assert.deepEqual(fixture.effects, { leads: [], deliveries: [], emails: 0, sheets: 0, writes: 0, notificationLookups: 0, unexpectedNetwork: 0 });
  }
});

test("Vero cannot bypass via originless requests, conflicting identity or default center", async () => {
  const direct = inquiryFixture({ additionalCenters });
  assert.equal((await direct.post({ centerId: "center_vero_fixture" }, { origin: "" })).body.code, "ineligible_public_location");
  const fallback = inquiryFixture({ additionalCenters, defaultCenterId: "center_vero_fixture" });
  assert.equal((await fallback.post({ locationId: "unknown-generic-school", brandName: "Example Brand" })).body.code, "ineligible_public_location");
  assert.equal(direct.effects.writes + fallback.effects.writes, 0);
  for (const field of ["crmLocationId", "locationId", "name"]) {
    assert.equal(isEligiblePublicInquiryCenter({ ...additionalCenters[1], [field]: vero }, false), false, field);
  }
});

test("inquiry catalog blocks Vero in live and fallback paths but preserves default and registration feeds", async () => {
  for (const options of [{}, { emptyLive: true }, { liveFails: true }]) {
    const fixture = inquiryFixture({ ...options, additionalCenters });
    for (const query of ["", "?purpose=registration", "?purpose=directory"]) {
      const directory = await fixture.get(query);
      assert.equal(directory.status, 200);
      assert.equal(directory.body.locations.some((item: { crmLocationId: string }) => item.crmLocationId === vero), true);
    }
    const inquiries = await fixture.get("?purpose=inquiry");
    assert.equal(inquiries.body.locations.some((item: { crmLocationId: string }) => item.crmLocationId === vero), false);
    for (const id of pending) assert.equal(inquiries.body.locations.some((item: { crmLocationId: string }) => item.crmLocationId === id), true);
    assert.equal(fixture.effects.writes, 0);
  }
});

test("fixed Vero center availability is read-only, minimal and fail-closed", async () => {
  const fixture = inquiryFixture({ additionalCenters });
  const response = await fixture.get("?purpose=inquiry&centerId=center_vero_fixture");
  assert.equal(response.body.inquiryCenterEligible, false);
  assert.deepEqual(Object.keys(response.body).sort(), ["inquiryCenterEligible", "locations"]);
  const unavailable = inquiryFixture({ additionalCenters, lookupFails: true });
  assert.equal((await unavailable.get("?purpose=inquiry&centerId=center_vero_fixture")).status, 503);
  assert.equal(fixture.effects.writes + unavailable.effects.writes, 0);
});

test("Lewisburg, Pulaski and Douglas retain existing in-memory inquiry routing pending separate review", async () => {
  for (const id of [...pending, douglas]) {
    const fixture = inquiryFixture({ additionalCenters });
    assert.equal((await fixture.post({ locationId: id })).status, 201, id);
    assert.equal(fixture.effects.leads.length, 1);
    assert.equal(fixture.effects.unexpectedNetwork, 0);
  }
});

for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
  test(`${script}: stale inquiry catalogs exclude Vero and retain pending schools`, async () => {
    const fixture = await embedFixture(script, { additionalLocations: [vero, ...pending] });
    assert.doesNotMatch(fixture.target.innerHTML, /Vero Beach/);
    for (const name of ["Lewisburg", "Pulaski", "Altamonte - Douglas"]) assert.ok(fixture.target.innerHTML.includes(name));
    assert.equal(fixture.calls.some((call) => call.options?.method === "POST"), false);
  });

  test(`${script}: Vero fixed forms reject qualified identities locally and ambiguous labels via lookup`, async () => {
    for (const locationName of aliases) {
      const fixture = await embedFixture(script, { dataset: { centerId: "center_vero_fixture", locationName }, eligibility: false });
      assert.doesNotMatch(fixture.target.innerHTML, /<form/);
      assert.match(fixture.target.innerHTML, /not accepting website inquiries/);
      assert.equal(fixture.calls.length, isAmbiguousPublicInquiryIdentifier(locationName) ? 1 : 0);
    }
  });

  test(`${script}: stale or forged Vero selection cannot submit`, async () => {
    for (const fields of [{ locationId: vero }, { locationId: douglas, publicLocationId: vero }, { locationId: douglas, locationName: "Kid City USA - Vero Beach" }]) {
      const fixture = await embedFixture(script, { fields });
      await fixture.submit();
      assert.equal(fixture.calls.some((call) => call.options?.method === "POST"), false);
      assert.match(fixture.status.textContent, /not accepting website inquiries/);
    }
  });

  test(`${script}: opaque Vero uses the server eligibility decision and never posts`, async () => {
    const fixture = await embedFixture(script, { dataset: { centerId: "center_vero_fixture" }, eligibility: false });
    assert.doesNotMatch(fixture.target.innerHTML, /<form/);
    assert.match(fixture.calls[0].url, /centerId=center_vero_fixture/);
    assert.equal(fixture.calls.some((call) => call.options?.method === "POST"), false);
  });
}

test("custom catalogs cannot restore Vero and their source URL remains unchanged", async () => {
  const fixture = await embedFixture("bee-suite-inquiry-form.js", { dataset: { locationsUrl: "https://example.invalid/custom?keep=value" }, additionalLocations: [vero] });
  assert.equal(fixture.calls[0].url, "https://example.invalid/custom?keep=value");
  assert.doesNotMatch(fixture.target.innerHTML, /Vero Beach/);
  assert.match(fixture.target.innerHTML, /Altamonte - Douglas/);
});
