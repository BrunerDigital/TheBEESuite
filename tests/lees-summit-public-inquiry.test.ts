import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { isRestoredPublicInquiryCenter, leesSummitInquiryRestoration as binding } from "../src/lib/public-inquiry-restoration";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate } from "../src/lib/active-school-locations";

const identifiers = [binding.publicLocationId, "MO | Lees Summit", binding.name, "MO | Lee's Summit", binding.centerId];
const kept = ["Kid City USA - FL | Vero Beach", "Kid City USA - FL | Altamonte - Douglas", "Kid City USA - TN | Lewisburg"];
function fixture(options = {}) {
  return inquiryFixture({ restored: true, restorationEnabled: true, additionalLocations: kept.filter((id) => id !== kept[1]), ...options });
}

test("October removal overrides either historical restoration flag without mutating the school", () => {
  const f = fixture();
  const center = f.centers.find((row: { id: string }) => row.id === binding.centerId)!;
  const before = structuredClone(center);
  for (const enabled of [false, true]) assert.equal(isRestoredPublicInquiryCenter(center, enabled), false);
  assert.equal(isEligiblePublicInquiryCenter(center, true), false);
  assert.deepEqual(center, before);
  const active = { ...center, status: "active" };
  assert.equal(isEligiblePublicInquiryCenter(active, true), false);
  assert.equal(isActivePublicSchoolCandidate(active), true);
  assert.equal(isActiveSchoolFinanceOperationsCandidate(active), true);
});

test("Lee disappears from default/inquiry live and static fallback catalogs even with the stale enabled flag", async () => {
  for (const path of [{}, { liveFails: true }, { emptyLive: true }, { lookupFails: true }]) {
    for (const enabled of [false, true]) for (const query of ["", "?purpose=inquiry", "?purpose=inquiry&centerId=" + binding.centerId]) {
      const f = fixture({ ...path, restorationEnabled: enabled });
      const result = await f.get(query);
      assert.equal(result.status, 200);
      assert.equal(result.body.locations.some((row: { name: string }) => row.name === binding.name), false);
      if (query.includes("centerId=")) assert.equal(result.body.inquiryCenterEligible, false);
      for (const id of kept) assert.equal(result.body.locations.some((row: { crmLocationId: string }) => row.crmLocationId === id), true, id);
      assert.equal(f.effects.writes, 0);
      assert.equal(f.effects.emails, 0);
    }
  }
});

test("canonical, fixed-center, conflicting and legacy Lee selectors reject JSON and form intake before all effects", async () => {
  for (const identifier of identifiers) for (const fields of [
    { locationId: identifier }, { location_id: identifier }, { publicLocationId: identifier },
    { centerId: binding.centerId }, { center_id: binding.centerId },
    { locationId: kept[0], locationName: identifier }, { locationId: kept[0], public_location_id: identifier },
    { centerId: binding.centerId, locationId: binding.centerId },
    { locationId: "legacy_" + binding.name, brandName: "Kid City USA" },
  ]) for (const form of [false, true]) {
    const f = fixture();
    assert.equal((await f.post(fields, { form })).status, 400, JSON.stringify(fields));
    for (const key of ["writes", "notificationLookups", "emails", "sheets", "unexpectedNetwork"] as const) assert.equal(f.effects[key], 0, key);
  }
});

test("configured Lee default and originless intake cannot bypass the exclusion", async () => {
  const f = fixture({ defaultCenterId: binding.centerId });
  assert.equal((await f.post({ centerId: binding.centerId }, { origin: "" })).status, 400);
  assert.equal((await f.post({ locationId: "unknown", brandName: "Example Brand" })).status, 400);
  assert.equal(f.effects.writes, 0);
});

test("approved schools still route memory-only inquiries to their exact centers", async () => {
  for (const id of kept) {
    const f = fixture();
    assert.equal((await f.post({ locationId: id })).status, 201, id);
    assert.equal(f.effects.leads[0].centerId, id === kept[1] ? "center_douglas_fixture" : "synthetic_" + id);
    assert.equal(f.effects.unexpectedNetwork, 0);
  }
});

test("static directory and standalone choices omit Lee while operational guards stay independent", () => {
  const rows = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")).locations;
  assert.equal(rows.some((row: { crmLocationId: string }) => row.crmLocationId === binding.publicLocationId), false);
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  assert.equal(html.includes('value="' + binding.publicLocationId + '"'), false);
  for (const path of ["src/app/api/registration/route.ts", "src/app/api/kiosk/check/route.ts", "src/app/api/cron/tuition-billing/route.ts", "src/lib/workspace-selection.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /public-inquiry-policy|public-inquiry-restoration|INQUIRY_LEES_SUMMIT_ENABLED/);
  }
});
