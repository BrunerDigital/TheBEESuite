import assert from "node:assert/strict";
import test from "node:test";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";

const removed = ["Kid City USA - IN | Whitestown", "IN | Whitestown", "Kid City USA - Whitestown",
  "Kid City USA - TN | Pulaski", "TN | Pulaski", "Kid City USA - Pulaski TN"];
const kept = ["Kid City USA - MO | Lees Summit", "Kid City USA - FL | Vero Beach", "Kid City USA - TN | Lewisburg"];

for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
  test(`${script}: stale/custom catalogs omit both removed schools and retain approved choices`, async () => {
    const fixture = await embedFixture(script, { additionalLocations: [...removed, ...kept] });
    assert.doesNotMatch(fixture.target.innerHTML, /Whitestown|Pulaski/);
    for (const name of kept) assert.ok(fixture.target.innerHTML.includes(name));
    assert.equal(fixture.calls.some((call: { options?: { method?: string } }) => call.options?.method === "POST"), false);
  });

  test(`${script}: known fixed removed-school embeds stop before requests or rendering`, async () => {
    const fields = script === "kidcity-inquiry-form.js" ? ["locationId", "publicLocationId", "locationName"] : ["locationName"];
    for (const field of fields) for (const value of removed) {
      const fixture = await embedFixture(script, { dataset: { [field]: value } });
      assert.doesNotMatch(fixture.target.innerHTML, /<form/);
      assert.match(fixture.target.innerHTML, /not accepting website inquiries/);
      assert.equal(fixture.calls.length, 0);
    }
  });

  test(`${script}: forged removed-school selections cannot submit`, async () => {
    for (const locationId of removed) {
      const fixture = await embedFixture(script, { fields: { locationId } });
      await fixture.submit();
      assert.equal(fixture.calls.some((call: { options?: { method?: string } }) => call.options?.method === "POST"), false);
      assert.match(fixture.status.textContent, /not accepting website inquiries/);
    }
  });

  test(`${script}: retained school selections keep their synthetic submission behavior`, async () => {
    for (const locationId of kept) {
      const fixture = await embedFixture(script, { fields: { locationId }, additionalLocations: kept });
      await fixture.submit();
      const sends = fixture.calls.filter((call: { options?: { method?: string } }) => call.options?.method === "POST");
      assert.equal(sends.length, 1, "memory-only fetch spy; no real network or leads");
      assert.equal(JSON.parse(sends[0].options.body).locationId, locationId);
    }
  });
}
