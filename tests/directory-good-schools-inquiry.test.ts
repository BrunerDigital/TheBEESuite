import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { directoryInquiryRestorations as bindings, directoryInquiryBinding, isVerifiedDirectoryInquiryCenter } from "../src/lib/directory-inquiry-restoration";
import { isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate } from "../src/lib/active-school-locations";

const enabledFlags = Object.fromEntries(bindings.map((binding) => [binding.flag, "true"]));
const rowPresent = (result: { body: { locations: { crmLocationId: string }[] } }, id: string) => result.body.locations.some((row) => row.crmLocationId === id);

for (const binding of bindings) {
  test(`${binding.name}: flag, catalog, exact availability and JSON/form intake agree`, async () => {
    for (const enabled of [false, true]) for (const path of [{}, { liveFails: true }, { emptyLive: true }]) {
      const fixture = inquiryFixture({ directorySchools: true, directoryFlags: { [binding.flag]: enabled ? "true" : "false" }, ...path });
      for (const query of ["", "?purpose=inquiry", "?purpose=inquiry&centerId=" + binding.centerId]) {
        const result = await fixture.get(query);
        assert.equal(result.status, 200);
        assert.equal(rowPresent(result, binding.publicLocationId), enabled);
        for (const other of bindings.filter((other) => other !== binding)) assert.equal(rowPresent(result, other.publicLocationId), false, "Each school has an independent default-off flag");
        if (query.includes("centerId")) assert.equal(result.body.inquiryCenterEligible, enabled);
      }
      assert.equal(fixture.effects.writes, 0);
      assert.equal(fixture.effects.emails, 0);
      assert.equal(fixture.effects.unexpectedNetwork, 0);
    }
    const selectors = [binding.publicLocationId, binding.publicLocationId.replace("Kid City USA - ", ""), binding.name];
    for (const form of [false, true]) for (const locationId of selectors) {
      const fixture = inquiryFixture({ directorySchools: true, directoryFlags: enabledFlags });
      const before = JSON.stringify(fixture.centers);
      const result = await fixture.post({ locationId, leadSource: "Kid City USA Website Inquiry" }, { form });
      assert.equal(result.status, 201);
      assert.equal(fixture.effects.leads[0].centerId, binding.centerId);
      assert.deepEqual(fixture.effects.deliveries[1].payload.locationRecipients, [binding.notificationEmail]);
      assert.equal(fixture.effects.notificationLookups, 1, "Only exact Center.email, never staff/grant fallback");
      assert.equal(JSON.stringify(fixture.centers), before, "No Center/status/settings mutation");
      assert.equal(fixture.effects.unexpectedNetwork, 0);
    }
    const opaqueOnly = inquiryFixture({ directorySchools: true, directoryFlags: enabledFlags });
    const selectorAsCenter = await opaqueOnly.get("?purpose=inquiry&centerId=" + encodeURIComponent(binding.publicLocationId));
    assert.equal(selectorAsCenter.body.inquiryCenterEligible, false, "A centerId query requires the opaque ID, not a public selector");
    for (const form of [false, true]) {
      const fixture = inquiryFixture({ directorySchools: true, directoryFlags: enabledFlags });
      assert.equal((await fixture.post({ centerId: binding.centerId, locationId: binding.centerId, locationName: binding.name }, { form })).status, 201);
      assert.equal(fixture.effects.leads[0].centerId, binding.centerId);
    }
  });

  test(`${binding.name}: every wrong persisted binding holds catalogs, availability, intake and audit`, async () => {
    for (const mutation of [
      { id: "wrong_center" }, { organizationId: "wrong_org" }, { name: "Wrong school" },
      { status: "active" }, { email: "unverified@example.invalid" },
      { organization: { tenantId: "wrong_tenant", tenant: { slug: "kid-city-usa" } } },
      { organization: { tenantId: "cmp4evl4v00006arspz79fggn", tenant: { slug: "wrong-brand" } } },
      { crmLocationId: "Kid City USA - FL | Lake City" }, { locationId: "Kid City USA - FL | Deland - Amelia" },
      { crmLocationId: "", locationId: null },
    ]) {
      const fixture = inquiryFixture({ directorySchools: true, directoryFlags: enabledFlags });
      const center = fixture.centers.find((row: { id: string }) => row.id === binding.centerId)!;
      Object.assign(center, mutation);
      const before = JSON.stringify(fixture.centers);
      assert.equal(isVerifiedDirectoryInquiryCenter(center, binding, true), false);
      for (const query of ["", "?purpose=inquiry&centerId=" + binding.centerId]) {
        const result = await fixture.get(query);
        assert.equal(rowPresent(result, binding.publicLocationId), false);
        if (query.includes("centerId")) assert.equal(result.body.inquiryCenterEligible, false);
      }
      assert.equal((await fixture.post({ centerId: binding.centerId, locationId: binding.publicLocationId })).status, 400);
      const audit = await fixture.audit();
      assert.equal(audit.body.missingCenter.some((row: { publicLocationId: string }) => row.publicLocationId === binding.publicLocationId), true);
      assert.equal(fixture.effects.writes, 0);
      assert.equal(fixture.effects.emails, 0);
      assert.equal(fixture.effects.notificationLookups, 0);
      assert.equal(JSON.stringify(fixture.centers), before);
    }
  });

  test(`${binding.name}: disabled/lookup failure and conflicting selectors never fall back`, async () => {
    for (const options of [{ directoryFlags: {} }, { directoryFlags: { [binding.flag]: "TRUE" } }, { directoryFlags: enabledFlags, lookupFails: true }]) {
      const fixture = inquiryFixture({ directorySchools: true, ...options });
      const result = await fixture.get("?purpose=inquiry&centerId=" + binding.centerId);
      assert.equal(result.body.inquiryCenterEligible, false);
      assert.equal(rowPresent(result, binding.publicLocationId), false);
      assert.notEqual((await fixture.post({ locationId: binding.publicLocationId })).status, 201);
      assert.equal(fixture.effects.writes, 0);
      assert.equal(fixture.effects.emails, 0);
    }
    for (const fields of [
      { centerId: "center_douglas_fixture", locationId: binding.publicLocationId },
      { centerId: binding.centerId, locationId: "Kid City USA - FL | Lake City" },
      { centerId: binding.centerId, locationId: binding.publicLocationId, publicLocationId: "Kid City USA - FL | Deland - Amelia" },
      { centerId: binding.centerId, locationId: binding.publicLocationId, locationName: "Kid City USA - KY | Wrong School" },
      { centerId: binding.centerId, locationId: "unknown_opaque_center" },
      { locationId: "unknown", publicLocationId: binding.publicLocationId },
      { locationId: binding.publicLocationId, publicLocationId: bindings.find((other) => other !== binding)!.publicLocationId },
    ]) {
      const fixture = inquiryFixture({ directorySchools: true, directoryFlags: enabledFlags });
      assert.equal((await fixture.post(fields)).status, 400);
      assert.equal(fixture.effects.writes, 0);
      assert.equal(fixture.effects.emails, 0);
      assert.equal(fixture.effects.notificationLookups, 0);
    }
  });

  test(`${binding.name}: stored selectors require one recognized ID and no conflicts`, () => {
    const center = inquiryFixture({ directorySchools: true }).centers.find((row: { id: string }) => row.id === binding.centerId)!;
    for (const [crmLocationId, locationId, expected] of [[binding.publicLocationId, null, true], ["", binding.publicLocationId.replace("Kid City USA - ", ""), true], [null, null, false], ["unknown", binding.publicLocationId, false], [binding.publicLocationId, "unknown", false]] as const) {
      assert.equal(isVerifiedDirectoryInquiryCenter({ ...center, crmLocationId, locationId }, binding, true), expected);
    }
    assert.equal(isActivePublicSchoolCandidate(center), false);
    assert.equal(isActiveSchoolFinanceOperationsCandidate(center), false);
  });
}

test("legacy DeLand and similar schools cannot acquire an exact restoration binding", () => {
  for (const value of ["FL | Deland", "Kid City USA - FL | Deland", "Kid City USA - FL | Deland - Amelia", "Kid City USA - FL | Lake City", "Kid City USA - IN | Whitestown", "Kid City USA - TN | Pulaski", "Kid City USA - FL | Vero Beach", "Kid City USA - TN | Lewisburg"]) assert.equal(directoryInquiryBinding(value), undefined);
});

test("protected public schools and approved Lee remain unchanged by the new independent flags", async () => {
  const fixture = inquiryFixture({ directorySchools: true, directoryFlags: enabledFlags, restored: true, restorationEnabled: true,
    additionalLocations: ["Kid City USA - IN | Whitestown", "Kid City USA - TN | Pulaski", "Kid City USA - FL | Vero Beach", "Kid City USA - TN | Lewisburg", "Kid City USA - FL | Lake City", "Kid City USA - FL | Deland - Amelia"] });
  const result = await fixture.get("?purpose=inquiry");
  for (const id of ["Kid City USA - IN | Whitestown", "Kid City USA - TN | Pulaski", "Kid City USA - FL | Deland - Amelia"]) assert.equal(rowPresent(result, id), false);
  for (const id of ["Kid City USA - FL | Vero Beach", "Kid City USA - TN | Lewisburg", "Kid City USA - FL | Lake City", "Kid City USA - MO | Lees Summit"]) assert.equal(rowPresent(result, id), true);
  for (const path of ["src/app/api/registration/route.ts", "src/app/api/cron/tuition-billing/route.ts", "src/app/api/cron/fte-reminders/route.ts", "src/app/api/cron/tuition-payment-reminders/route.ts", "src/lib/workspace-selection.ts", "src/lib/active-school-locations.ts"]) assert.doesNotMatch(readFileSync(path, "utf8"), /directory-inquiry-restoration|INQUIRY_DELAND_ORANGE_ENABLED|INQUIRY_LAKE_CITY_2_ENABLED|INQUIRY_BARDSTOWN_ENABLED/);
});
