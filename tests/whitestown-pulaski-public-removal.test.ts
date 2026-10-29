import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate } from "../src/lib/active-school-locations";
import { filterPublicWebsiteLocations } from "../src/lib/public-inquiry-policy";

const targets = ["Kid City USA - IN | Whitestown", "Kid City USA - TN | Pulaski"];
const keep = ["Kid City USA - FL | Vero Beach", "Kid City USA - TN | Lewisburg", "Kid City USA - TN | Soddy Daisy"];

function populatedFixture(options = {}) {
  return inquiryFixture({ ...options, additionalLocations: [...targets, ...keep] });
}

test("both exact schools disappear from live, empty and failed-live public catalogs", async () => {
  for (const options of [{}, { emptyLive: true }, { liveFails: true }]) {
    const fixture = populatedFixture(options);
    for (const query of ["", "?purpose=inquiry"]) {
      const response = await fixture.get(query);
      assert.equal(response.status, 200);
      const ids = response.body.locations.map((row: { crmLocationId: string }) => row.crmLocationId);
      for (const id of targets) assert.equal(ids.includes(id), false, id);
      for (const id of keep) assert.equal(ids.includes(id), true, id);
    }
    assert.equal(fixture.effects.writes, 0);
    assert.equal(fixture.effects.unexpectedNetwork, 0);
  }
});

test("complete handler rejects canonical, fixed-center and conflicting public selectors before effects", async () => {
  for (const id of targets) {
    for (const fields of [
      { locationId: id }, { location_id: id }, { centerId: "synthetic_" + id },
      { center_id: "synthetic_" + id }, { locationId: keep[0], publicLocationId: id },
      { locationId: keep[0], public_location_id: id }, { locationId: keep[0], locationName: id },
      { locationId: "legacy_" + id, brandName: "Kid City USA" },
    ]) {
      for (const form of [false, true]) {
        const fixture = populatedFixture();
        const response = await fixture.post(fields, { form });
        assert.equal(response.status, 400, JSON.stringify(fields));
        assert.equal(response.body.code, "ineligible_public_location");
        for (const key of ["writes", "notificationLookups", "emails", "sheets", "unexpectedNetwork"] as const)
          assert.equal(fixture.effects[key], 0, key);
      }
    }
  }
});

test("fixed center availability and originless/default-center intake also reject both targets", async () => {
  for (const id of targets) {
    const fixture = populatedFixture({ defaultCenterId: "synthetic_" + id });
    assert.equal((await fixture.get("?purpose=inquiry&centerId=" + encodeURIComponent("synthetic_" + id))).body.inquiryCenterEligible, false);
    assert.equal((await fixture.post({ centerId: "synthetic_" + id }, { origin: "" })).status, 400);
    assert.equal((await fixture.post({ locationId: "unknown", brandName: "Example Brand" })).status, 400);
    assert.equal(fixture.effects.writes, 0);
    assert.equal(fixture.effects.emails, 0);
  }
});

test("public exclusion leaves Center status, finance eligibility and historical records unchanged", () => {
  const fixture = populatedFixture();
  for (const id of targets) {
    const center = fixture.centers.find((row: { crmLocationId: string }) => row.crmLocationId === id);
    assert.ok(center);
    const before = structuredClone(center);
    assert.equal(isEligiblePublicInquiryCenter(center, true), false);
    assert.equal(isActivePublicSchoolCandidate(center), true);
    assert.equal(isActiveSchoolFinanceOperationsCandidate(center), true);
    assert.deepEqual(center, before);
  }
  assert.equal(filterPublicWebsiteLocations([{ crmLocationId: "Kid City USA - IN | Whitestown North", name: "Another school" }]).length, 1);
  assert.equal(filterPublicWebsiteLocations([{ crmLocationId: keep[0], locationId: targets[0] }]).length, 0);
});

test("Vero and Lewisburg can still create synthetic inquiries, and the newer Lee exclusion overrides its historical gate", async () => {
  for (const id of keep.slice(0, 2)) {
    const fixture = populatedFixture();
    assert.equal((await fixture.post({ locationId: id })).status, 201);
    assert.equal(fixture.effects.leads[0].centerId, "synthetic_" + id);
    assert.equal(fixture.effects.unexpectedNetwork, 0);
  }
  const fixture = populatedFixture({ restored: true, restorationEnabled: true });
  const lee = "Kid City USA - MO | Lees Summit";
  assert.equal((await fixture.get("?purpose=inquiry")).body.locations.some((row: { crmLocationId: string }) => row.crmLocationId === lee), false);
  assert.equal((await fixture.post({ locationId: lee })).status, 400);
  assert.equal(fixture.centers.find((row: { crmLocationId: string }) => row.crmLocationId === lee)?.status, "closed");
});

test("static fallbacks omit only the approved targets and retain Vero, Lewisburg and Soddy Daisy", () => {
  const rows = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")).locations;
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  for (const id of targets) {
    assert.equal(rows.some((row: { crmLocationId: string }) => row.crmLocationId === id), false);
    assert.equal(html.includes(`value="${id}"`), false);
  }
  for (const id of keep) {
    assert.equal(rows.some((row: { crmLocationId: string }) => row.crmLocationId === id), true);
    assert.equal(html.includes(`value="${id}"`), true);
  }
});
