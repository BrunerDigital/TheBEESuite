import assert from "node:assert/strict";
import test from "node:test";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";

const daytona = "Kid City USA - FL | Daytona Beach East";
const douglas = "Kid City USA - FL | Altamonte - Douglas";

test("complete intake handler rejects Daytona before CRM, recipients, queues or providers", async () => {
  const requests = [
    { locationId: daytona },
    { locationId: "Daytona.Beach.East" },
    { location_id: "FL | Daytona Beach East" },
    { locationId: douglas, publicLocationId: daytona },
    { location_id: douglas, public_location_id: "FL | Daytona Beach East" },
    { centerId: "center_daytona_fixture" },
    { center_id: "center_daytona_fixture" },
    { centerId: "center_douglas_fixture", locationName: "Kid City USA - Daytona Beach East" },
    { locationId: "old-daytona-form", brandName: "Kid City USA" },
  ];
  for (const fields of requests) {
    for (const form of [false, true]) {
      const fixture = inquiryFixture();
      const response = await fixture.post(fields, { form });
      assert.equal(response.status, 400, JSON.stringify(fields));
      assert.equal(response.body.code, "ineligible_public_location");
      assert.equal(fixture.effects.writes, 0);
      assert.equal(fixture.effects.notificationLookups, 0);
      assert.equal(fixture.effects.emails, 0);
      assert.equal(fixture.effects.sheets, 0);
      assert.equal(fixture.effects.unexpectedNetwork, 0);
    }
  }
});

test("originless direct API and generic default-center fallback cannot bypass the hold", async () => {
  const direct = inquiryFixture();
  assert.equal((await direct.post({ centerId: "center_daytona_fixture" }, { origin: "" })).body.code, "ineligible_public_location");
  assert.equal(direct.effects.writes, 0);
  const fallback = inquiryFixture({ defaultCenterId: "center_daytona_fixture" });
  assert.equal((await fallback.post({ locationId: "unknown-generic-school", brandName: "Example Brand" })).body.code, "ineligible_public_location");
  assert.equal(fallback.effects.writes, 0);
  assert.equal(fallback.effects.notificationLookups, 0);
});

test("same synthetic family can still inquire at Douglas through the complete handler", async () => {
  const fixture = inquiryFixture();
  const response = await fixture.post({ locationId: douglas });
  assert.equal(response.status, 201);
  assert.equal(fixture.effects.leads.length, 1);
  assert.equal(fixture.effects.leads[0].centerId, "center_douglas_fixture");
  assert.equal(fixture.effects.deliveries.length, 2);
  assert.equal(fixture.effects.emails, 1, "in-memory send spy only");
  assert.equal(fixture.effects.sheets, 1, "in-memory send spy only");
  assert.equal(fixture.effects.unexpectedNetwork, 0);
});

test("opt-in catalog filters Daytona from live, empty-live and failed-live fallback only", async () => {
  for (const options of [{}, { emptyLive: true }, { liveFails: true }]) {
    const fixture = inquiryFixture(options);
    const directory = await fixture.get();
    const inquiries = await fixture.get("?purpose=inquiry");
    assert.equal(directory.status, 200);
    assert.equal(inquiries.status, 200);
    assert.equal(directory.body.locations.some((location: { crmLocationId: string }) => location.crmLocationId === daytona), true);
    assert.equal(inquiries.body.locations.some((location: { crmLocationId: string }) => location.crmLocationId === daytona), false);
    assert.equal(inquiries.body.locations.some((location: { crmLocationId: string }) => location.crmLocationId === douglas), true);
    assert.equal(fixture.effects.writes, 0);
  }
});

test("fixed opaque center eligibility is read-only, scoped and fail-closed", async () => {
  const fixture = inquiryFixture();
  for (const [id, expected] of [["center_daytona_fixture", false], ["center_douglas_fixture", true], ["unknown_fixture", false]] as const) {
    const response = await fixture.get("?purpose=inquiry&centerId=" + id);
    assert.equal(response.body.inquiryCenterEligible, expected);
    assert.equal("email" in response.body, false);
  }
  const ordinary = await fixture.get("?centerId=center_daytona_fixture");
  assert.equal("inquiryCenterEligible" in ordinary.body, false);
  const unavailable = inquiryFixture({ lookupFails: true });
  assert.equal((await unavailable.get("?purpose=inquiry&centerId=center_daytona_fixture")).status, 503);
  assert.equal(fixture.effects.writes, 0);
  assert.equal(unavailable.effects.writes, 0);
});


test("generic non-KidCity trial embeds retain metadata and inquiry eligibility", async () => {
  const fixture = inquiryFixture({ genericTrial: true });
  const availability = await fixture.get("?purpose=inquiry&centerId=center_trial_fixture");
  assert.equal(availability.body.inquiryCenterEligible, true);
  const response = await fixture.post({ centerId: "center_trial_fixture", brandName: "Example Learning Center" });
  assert.equal(response.status, 201);
  assert.equal(fixture.effects.leads[0].centerId, "center_trial_fixture");
  assert.equal(fixture.effects.unexpectedNetwork, 0);
});
