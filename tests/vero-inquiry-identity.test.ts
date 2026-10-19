import assert from "node:assert/strict";
import test from "node:test";
import { filterPublicInquiryLocations, hasExplicitOtherBrandInquiryIdentity } from "../src/lib/public-inquiry-policy";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";

const branded = "Other Brand - FL | Vero Beach";
const other = {
  id: "other_vero_fixture", name: "Vero Beach", crmLocationId: branded,
  locationId: "FL | Vero Beach", status: "active", email: "fixture@example.invalid",
  organization: { tenantId: "other_brand_fixture" }, customFields: {},
};
const vero = { ...other, id: "kidcity_vero_fixture", crmLocationId: "Kid City USA - FL | Vero Beach", locationId: "kidcity_vero_legacy" };

test("other-brand canonical identity preserves bare name and unbranded legacy Vero IDs", () => {
  for (const name of ["Vero Beach", "FL | Vero Beach", branded]) {
    const center = { ...other, name };
    for (const strict of [true, false]) assert.equal(isEligiblePublicInquiryCenter(center, strict), true);
    assert.deepEqual(filterPublicInquiryLocations([center]), [center]);
  }
});

test("missing or unbranded canonical identity cannot exempt ambiguous Vero names", () => {
  for (const crmLocationId of [null, "", "Vero Beach", "FL | Vero Beach", "Kid City USA - FL | Vero Beach"]) {
    const center = { ...other, crmLocationId };
    assert.equal(hasExplicitOtherBrandInquiryIdentity(center), false);
    assert.equal(isEligiblePublicInquiryCenter(center, false), false);
  }
  assert.equal(isEligiblePublicInquiryCenter({ ...other, name: "Kid City USA - Vero Beach" }, false), false);
  assert.equal(isEligiblePublicInquiryCenter({ ...other, name: "Daytona Beach East" }, false), false, "Daytona policy is unchanged");
});

test("resolved other-brand opaque, name and legacy requests remain eligible", async () => {
  for (const fields of [
    { centerId: other.id, locationName: "Vero Beach" },
    { locationId: "Vero Beach" },
    { locationId: "FL | Vero Beach" },
    { locationId: branded, publicLocationId: "FL | Vero Beach", locationName: "Vero Beach" },
  ]) for (const form of [false, true]) {
    const fixture = inquiryFixture({ additionalCenters: [other] });
    const result = await fixture.post(fields, { form });
    assert.equal(result.status, 201, JSON.stringify(fields));
    assert.equal(fixture.effects.leads[0].centerId, other.id);
    assert.equal(fixture.effects.unexpectedNetwork, 0);
  }
});

test("an unverified submitted brandName cannot exempt Kid City Vero or ambiguous fallback", async () => {
  for (const fields of [
    { centerId: vero.id, locationName: "Vero Beach" },
    { locationId: "Vero Beach" },
    { locationId: "FL | Vero Beach" },
    { locationId: "unmapped-fixture", locationName: "Vero Beach" },
    { centerId: "center_douglas_fixture", locationName: "Vero Beach" },
    { centerId: "unknown-fixture", locationName: "Vero Beach" },
  ]) {
    const fixture = inquiryFixture({ additionalCenters: [vero], defaultCenterId: "center_douglas_fixture" });
    const result = await fixture.post({ ...fields, brandName: "Other Brand" });
    assert.equal(result.status, 400, JSON.stringify(fields));
    assert.equal(result.body.code, "ineligible_public_location");
    assert.equal(fixture.effects.writes + fixture.effects.notificationLookups + fixture.effects.emails + fixture.effects.sheets, 0);
  }
});

test("unresolved ambiguous names never create or use a generic fallback, including other-brand default", async () => {
  for (const defaultCenterId of ["", other.id, "center_douglas_fixture"]) {
    for (const fields of [{ locationId: "Vero Beach" }, { locationId: "unmapped-fixture", locationName: "FL | Vero Beach" }]) {
      const fixture = inquiryFixture({ additionalCenters: [{ ...other, name: "Other Fixture", locationId: "other-legacy" }], defaultCenterId });
      assert.equal((await fixture.post({ ...fields, brandName: "Other Brand" })).body.code, "ineligible_public_location");
      assert.equal(fixture.effects.writes + fixture.effects.notificationLookups + fixture.effects.emails + fixture.effects.sheets, 0);
    }
  }
});

test("same-name brand ambiguity fails closed instead of selecting an arbitrary school", async () => {
  const fixture = inquiryFixture({ additionalCenters: [other, vero], defaultCenterId: other.id });
  const result = await fixture.post({ locationId: "Vero Beach", brandName: "Other Brand" });
  assert.equal(result.body.code, "ineligible_public_location");
  assert.equal(fixture.effects.writes, 0);
});

test("opaque availability distinguishes verified other brand, Kid City Vero and unknown identity", async () => {
  const fixture = inquiryFixture({ additionalCenters: [other, vero] });
  assert.equal((await fixture.get("?purpose=inquiry&centerId=" + other.id)).body.inquiryCenterEligible, true);
  assert.equal((await fixture.get("?purpose=inquiry&centerId=" + vero.id)).body.inquiryCenterEligible, false);
  assert.equal(fixture.effects.writes, 0);
});

test("an arbitrary other-brand school cannot accept conflicting ambiguous Vero metadata", async () => {
  const orlando = { ...other, id: "other_orlando_fixture", crmLocationId: "Other Brand - FL | Orlando", locationId: "other-orlando", name: "Other Orlando" };
  assert.equal(isEligiblePublicInquiryCenter({ ...orlando, name: "Vero Beach" }, false), false);
  for (const fields of [
    { centerId: orlando.id, locationName: "Vero Beach" },
    { locationId: orlando.crmLocationId, publicLocationId: "FL | Vero Beach" },
  ]) {
    const fixture = inquiryFixture({ additionalCenters: [orlando] });
    assert.equal((await fixture.post(fields)).body.code, "ineligible_public_location");
    assert.equal(fixture.effects.writes + fixture.effects.notificationLookups, 0);
  }
});

test("explicit other-state Vero identity permits the bare name but rejects conflicting Florida identity", async () => {
  const otherState = { ...other, crmLocationId: "Other Brand - CA | Vero Beach", locationId: "other-state-vero" };
  assert.equal(isEligiblePublicInquiryCenter(otherState, false), true);
  assert.equal(isEligiblePublicInquiryCenter({ ...otherState, locationId: "FL | Vero Beach" }, false), false);
  const valid = inquiryFixture({ additionalCenters: [otherState] });
  assert.equal((await valid.post({ centerId: other.id, locationName: "Vero Beach" })).status, 201);
  const conflict = inquiryFixture({ additionalCenters: [otherState] });
  assert.equal((await conflict.post({ centerId: other.id, publicLocationId: "FL | Vero Beach" })).body.code, "ineligible_public_location");
  assert.equal(conflict.effects.writes, 0);
});

for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
  test(`${script}: other-brand canonical location cannot override a conflicting Vero selection`, async () => {
    for (const fields of [
      { locationId: "Other Brand - FL | Orlando", locationName: "Vero Beach" },
      { locationId: "Other Brand - CA | Vero Beach", publicLocationId: "FL | Vero Beach" },
    ]) {
      const fixture = await embedFixture(script, { fields });
      await fixture.submit();
      assert.equal(fixture.calls.some((call) => call.options?.method === "POST"), false);
    }
  });

  test(`${script}: other-brand bare display names remain in custom catalogs and can submit`, async () => {
    const fixture = await embedFixture(script, {
      additionalLocationRecords: [other],
      fields: { locationId: branded, publicLocationId: "FL | Vero Beach", locationName: "Vero Beach" },
    });
    assert.ok(fixture.target.innerHTML.includes(branded));
    await fixture.submit();
    assert.equal(fixture.calls.filter((call) => call.options?.method === "POST").length, 1, "memory-only fetch");
  });

  test(`${script}: an ambiguous fixed label uses eligibility and allows only its matching opaque target`, async () => {
    for (const eligibility of [true, false]) {
      const fixture = await embedFixture(script, {
        dataset: { centerId: other.id, locationName: "Vero Beach", brandName: "Other Brand" },
        fields: { centerId: other.id, locationId: other.id, locationName: "Vero Beach" },
        eligibility,
      });
      assert.equal(fixture.target.innerHTML.includes("<form"), eligibility);
      assert.equal(fixture.calls.length, 1);
      if (eligibility) {
        await fixture.submit();
        assert.equal(fixture.calls.filter((call) => call.options?.method === "POST").length, 1);
      }
    }
    const tampered = await embedFixture(script, {
      dataset: { centerId: other.id, locationName: "Vero Beach", brandName: "Other Brand" },
      fields: { centerId: "different-fixture", locationId: "different-fixture", locationName: "Vero Beach" },
      eligibility: true,
    });
    await tampered.submit();
    assert.equal(tampered.calls.some((call) => call.options?.method === "POST"), false);
  });
}
