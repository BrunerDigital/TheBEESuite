import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { embedFixture } from "./helpers/inquiry-embed-fixture.mjs";
import { directoryInquiryRestorations as bindings } from "../src/lib/directory-inquiry-restoration";

for (const binding of bindings) {
  test(`${binding.name}: both hosted scripts hold missing/failed exact eligibility and catalog records`, async () => {
    for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
      for (const dataset of [{ centerId: binding.centerId }, { locationId: binding.publicLocationId }, { publicLocationId: binding.publicLocationId }, { locationName: binding.name }]) {
        for (const scenario of [{ eligibility: false }, { omitEligibility: true }, { loadFails: true }, { responseOk: false }, { additionalLocations: [] }]) {
          const fixture = await embedFixture(script, { dataset, additionalLocations: [binding.publicLocationId], ...scenario });
          assert.doesNotMatch(fixture.target.innerHTML, /<form/);
          assert.equal(new URL(fixture.calls[0].url).searchParams.get("centerId"), binding.centerId);
          assert.equal(fixture.calls.some((call: { options?: { method?: string } }) => call.options?.method === "POST"), false);
        }
        const fixture = await embedFixture(script, { dataset, additionalLocations: [binding.publicLocationId] });
        assert.match(fixture.target.innerHTML, /<form/);
        assert.equal(new URL(fixture.calls[0].url).searchParams.get("centerId"), binding.centerId);
      }
    }
  });
  test(`${binding.name}: hosted conflicting selectors fail before fetch and custom catalog rows require canonical verification`, async () => {
    for (const script of ["kidcity-inquiry-form.js", "bee-suite-inquiry-form.js"]) {
      for (const dataset of [
        { centerId: "wrong_center", locationId: binding.publicLocationId },
        { centerId: binding.centerId, publicLocationId: "Kid City USA - FL | Lake City" },
        { locationName: binding.name, locationId: "Kid City USA - FL | Deland - Amelia" },
      ]) {
        const fixture = await embedFixture(script, { dataset });
        assert.doesNotMatch(fixture.target.innerHTML, /<form/);
        assert.equal(fixture.calls.length, 0);
      }
      const fixture = await embedFixture(script, { dataset: { locationsUrl: "https://fixture.invalid/custom-catalog" }, additionalLocations: [binding.publicLocationId], eligibility: false });
      assert.doesNotMatch(fixture.target.innerHTML, new RegExp(binding.publicLocationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.ok(fixture.calls.some((call: { url: string }) => new URL(call.url).searchParams.get("centerId") === binding.centerId));
      const forged = await embedFixture(script, { fields: { locationId: binding.publicLocationId, publicLocationId: binding.publicLocationId } });
      await forged.submit();
      assert.equal(forged.calls.some((call: { options?: { method?: string } }) => call.options?.method === "POST"), false);
    }
  });
}

test("three standalone options are hidden by default and independently gated without changing protected options", async () => {
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  const source = html.match(/<script>([\s\S]*?)<\/script>/i)![1];
  for (const binding of bindings) {
    const tag = html.match(new RegExp('<option[^>]*value="' + binding.publicLocationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*>'))![0];
    assert.match(tag, /disabled/); assert.match(tag, /hidden/);
    for (const eligible of [false, true]) {
      const option = { value: binding.publicLocationId, disabled: true, hidden: true };
      const calls: string[] = [];
      const form = { getAttribute: () => "https://fixture.invalid/api/inquiries", querySelector: (selector: string) => selector === 'option[value="' + binding.publicLocationId + '"]' ? option : null };
      vm.runInNewContext(source, { URL, document: { readyState: "complete", querySelectorAll: () => [form], addEventListener() {} },
        fetch: async (url: string) => { calls.push(url); return { ok: true, json: async () => ({ inquiryCenterEligible: eligible, locations: [{ crmLocationId: binding.publicLocationId }] }) }; } });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(option.disabled, !eligible); assert.equal(option.hidden, !eligible);
      assert.equal(calls.length, 1);
      assert.equal(new URL(calls[0]).searchParams.get("centerId"), binding.centerId);
    }
  }
  assert.doesNotMatch(html, /<option[^>]*value="Kid City USA - (?:IN \| Whitestown|TN \| Pulaski|FL \| Deland - Amelia)"/);
});


test("standalone restoration choices are in their exact state optgroups", () => {
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  for (const binding of bindings) {
    const groups = [...html.matchAll(/<optgroup label="([A-Z]{2})">([\s\S]*?)<\/optgroup>/g)]
      .filter((match) => match[2].includes('value="' + binding.publicLocationId + '"'));
    assert.equal(groups.length, 1);
    assert.equal(groups[0][1], binding.state);
  }
});
