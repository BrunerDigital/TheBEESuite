import assert from "node:assert/strict";
import test from "node:test";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";
import { leesSummitInquiryRestoration as binding } from "../src/lib/public-inquiry-restoration";
const removed = [binding.publicLocationId, "MO | Lees Summit", binding.name, "MO | Lee's Summit", binding.centerId];
for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
  test(script + ": stale catalogs cannot advertise Lee", async () => {
    const f = await embedFixture(script, { additionalLocations: removed });
    assert.doesNotMatch(f.target.innerHTML, /Lees Summit|Lee's Summit|cmp4ewfzn/);
    assert.match(f.target.innerHTML, /Altamonte - Douglas/);
  });
  test(script + ": Lee fixed selectors stop before network or form rendering even with stale availability", async () => {
    const fields = ["centerId", "locationId", "publicLocationId", "locationName"];
    for (const field of fields) for (const value of removed) for (const loadFails of [false, true]) {
      const f = await embedFixture(script, { dataset: { [field]: value }, additionalLocations: removed, loadFails });
      assert.doesNotMatch(f.target.innerHTML, /<form/);
      assert.match(f.target.innerHTML, /not accepting website inquiries/);
      assert.equal(f.calls.length, 0);
    }
  });
  test(script + ": forged Lee selections cannot send", async () => {
    for (const locationId of removed) {
      const f = await embedFixture(script, { fields: { locationId } });
      await f.submit();
      assert.equal(f.calls.some((call: { options?: { method?: string } }) => call.options?.method === "POST"), false);
    }
  });
}
test("unrelated Douglas fixed-location fallback remains available during catalog failure", async () => {
  const f = await embedFixture("kidcity-inquiry-form.js", { dataset: { locationId: "Kid City USA - FL | Altamonte - Douglas" }, loadFails: true });
  assert.match(f.target.innerHTML, /<form/);
  assert.match(f.target.innerHTML, /Altamonte - Douglas/);
});
