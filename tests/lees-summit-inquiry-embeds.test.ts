import assert from "node:assert/strict";
import test from "node:test";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";
import { leesSummitInquiryRestoration as binding } from "../src/lib/public-inquiry-restoration";

const identifiers = [binding.publicLocationId, "MO | Lees Summit", binding.name];

test("location-only Lee embeds require exact-center availability and do not synthesize unavailable intake", async () => {
  for (const field of ["locationId", "publicLocationId", "locationName"]) for (const value of identifiers) {
    for (const unavailable of [{ eligibility: false }, { omitEligibility: true }, { loadFails: true }, { responseOk: false }]) {
      const fixture = await embedFixture("kidcity-inquiry-form.js", {
        dataset: { [field]: value }, additionalLocations: [binding.publicLocationId], ...unavailable,
      });
      assert.doesNotMatch(fixture.target.innerHTML, /<form/);
      assert.equal(new URL(fixture.calls[0].url).searchParams.get("centerId"), binding.centerId);
      assert.equal(fixture.calls.some((call: { options?: { method?: string } }) => call.options?.method === "POST"), false);
    }
  }
});

test("verified location-only Lee embeds retain the exact selected public location", async () => {
  for (const field of ["locationId", "publicLocationId", "locationName"]) for (const value of identifiers) {
    const fixture = await embedFixture("kidcity-inquiry-form.js", { dataset: { [field]: value }, additionalLocations: [binding.publicLocationId] });
    assert.match(fixture.target.innerHTML, /<form/);
    assert.ok(fixture.target.innerHTML.includes('name="locationId" type="hidden" value="' + binding.publicLocationId + '"'));
    assert.equal(new URL(fixture.calls[0].url).searchParams.get("centerId"), binding.centerId);
  }
});

test("Lee fixed selectors reject a conflicting center or public identifier before fetching", async () => {
  for (const dataset of [
    { locationId: binding.publicLocationId, centerId: "other_center" },
    { locationId: binding.publicLocationId, publicLocationId: "Kid City USA - FL | Vero Beach" },
    { locationName: binding.name, locationId: "Kid City USA - FL | Vero Beach" },
  ]) {
    const fixture = await embedFixture("kidcity-inquiry-form.js", { dataset });
    assert.doesNotMatch(fixture.target.innerHTML, /<form/);
    assert.equal(fixture.calls.length, 0);
  }
});

test("verified Lee identifiers take priority over a conflicting friendly display label", async () => {
  const fixture = await embedFixture("kidcity-inquiry-form.js", {
    dataset: { locationId: binding.publicLocationId, locationName: "Kid City USA - FL | Vero Beach" },
    additionalLocations: ["Kid City USA - FL | Vero Beach", binding.publicLocationId],
  });
  assert.ok(fixture.target.innerHTML.includes('name="locationId" type="hidden" value="' + binding.publicLocationId + '"'));
  assert.doesNotMatch(fixture.target.innerHTML, /value="Kid City USA - FL \| Vero Beach"/);
});

test("unrelated legacy fixed-location fallback remains available during catalog failure", async () => {
  const fixture = await embedFixture("kidcity-inquiry-form.js", {
    dataset: { locationId: "Kid City USA - FL | Altamonte - Douglas" }, loadFails: true,
  });
  assert.match(fixture.target.innerHTML, /<form/);
  assert.match(fixture.target.innerHTML, /Altamonte - Douglas/);
  assert.equal(new URL(fixture.calls[0].url).searchParams.has("centerId"), false);
});
