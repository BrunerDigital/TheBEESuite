import assert from "node:assert/strict";
import test from "node:test";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";

for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
  test(`${script}: stale catalog excludes Daytona while Douglas remains selectable`, async () => {
    const fixture = await embedFixture(script);
    assert.doesNotMatch(fixture.target.innerHTML, /Daytona Beach East/);
    assert.match(fixture.target.innerHTML, /Altamonte - Douglas/);
    assert.match(fixture.calls[0].url, /purpose=inquiry/);
    assert.equal(fixture.calls.some((call) => call.options?.method === "POST"), false);
  });

  test(`${script}: known fixed Daytona form is replaced without a request`, async () => {
    for (const locationName of ["Daytona Beach East", "Kid City USA - Daytona Beach East", "FL | Daytona Beach East", "Daytona.Beach.East"]) {
      const fixture = await embedFixture(script, { dataset: { centerId: "center_daytona_fixture", locationName } });
      assert.doesNotMatch(fixture.target.innerHTML, /<form/);
      assert.match(fixture.target.innerHTML, /not accepting website inquiries/);
      assert.equal(fixture.calls.length, 0);
    }
  });

  test(`${script}: opaque fixed center rejects unavailable, unknown or failed eligibility`, async () => {
    for (const options of [{ eligibility: false }, { loadFails: true }, { responseOk: false }, { omitEligibility: true }]) {
      const fixture = await embedFixture(script, { dataset: { centerId: "center_daytona_fixture" }, ...options });
      assert.doesNotMatch(fixture.target.innerHTML, /<form/);
      assert.match(fixture.calls[0].url, /centerId=center_daytona_fixture/);
      assert.equal(fixture.calls.some((call) => call.options?.method === "POST"), false);
    }
  });

  test(`${script}: forged/stale Daytona selected values cannot submit`, async () => {
    const fixture = await embedFixture(script, { fields: { locationId: "FL | Daytona Beach East" } });
    await fixture.submit();
    assert.equal(fixture.calls.some((call) => call.options?.method === "POST"), false);
    assert.match(fixture.status.textContent, /not accepting website inquiries/);
  });

  test(`${script}: Douglas continues normal in-memory inquiry flow`, async () => {
    const fixture = await embedFixture(script);
    await fixture.submit();
    const sends = fixture.calls.filter((call) => call.options?.method === "POST");
    assert.equal(sends.length, 1, "mocked fetch only");
    assert.equal(JSON.parse(sends[0].options.body).locationId, "Kid City USA - FL | Altamonte - Douglas");
    assert.equal(fixture.button.disabled, false);
  });
}

test("generic custom catalogs cannot restore Daytona or have their URL silently rewritten", async () => {
  const fixture = await embedFixture("bee-suite-inquiry-form.js", { dataset: { locationsUrl: "https://example.invalid/custom?keep=value" } });
  assert.equal(fixture.calls[0].url, "https://example.invalid/custom?keep=value");
  assert.doesNotMatch(fixture.target.innerHTML, /Daytona Beach East/);
  assert.match(fixture.target.innerHTML, /Altamonte - Douglas/);
});
