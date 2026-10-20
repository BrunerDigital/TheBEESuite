import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
const source = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const identifier = "Kid City USA - MO | Lees Summit";

async function runTemplate({ eligible = true, includeLocation = true, responseOk = true, loadFails = false, loading = false } = {}) {
  const option = { value: identifier, disabled: true, hidden: true };
  const calls: { url: string; options: { cache: string } }[] = [];
  const listeners = new Map<string, () => void>();
  const form = {
    getAttribute: () => "https://fixture.invalid/api/inquiries",
    querySelector: (selector: string) => {
      assert.equal(selector, 'option[value="' + identifier + '"]', "Availability must touch only the restored option");
      return option;
    },
  };
  vm.runInNewContext(source, {
    URL, document: { readyState: loading ? "loading" : "complete", querySelectorAll: () => [form],
      addEventListener: (event: string, handler: () => void) => listeners.set(event, handler) },
    fetch: async (url: string, options: { cache: string }) => {
      calls.push({ url, options });
      if (loadFails) throw new Error("Synthetic availability outage");
      return { ok: responseOk, json: async () => ({ inquiryCenterEligible: eligible,
        locations: includeLocation ? [{ crmLocationId: identifier }] : [] }) };
    },
  });
  if (loading) {
    assert.equal(calls.length, 0);
    listeners.get("DOMContentLoaded")!();
  }
  await new Promise((resolve) => setImmediate(resolve));
  return { option, calls };
}

test("standalone Avada Lee option is hidden and disabled before availability verification", () => {
  const option = html.match(/<option[^>]*value="Kid City USA - MO \| Lees Summit"[^>]*>/)![0];
  assert.match(option, /disabled/);
  assert.match(option, /hidden/);
  for (const retained of ["FL | Vero Beach", "TN | Lewisburg"]) {
    const option = html.match(new RegExp('<option[^>]*value="Kid City USA - ' + retained.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*>'))![0];
    assert.doesNotMatch(option, /disabled|hidden/);
  }
});

test("verified Avada restoration enables only Lee after a read-only exact-center catalog check", async () => {
  for (const loading of [false, true]) {
    const result = await runTemplate({ loading });
    assert.equal(result.option.disabled, false);
    assert.equal(result.option.hidden, false);
    assert.equal(result.calls.length, 1);
    const url = new URL(result.calls[0].url);
    assert.equal(url.origin, "https://fixture.invalid");
    assert.equal(url.pathname, "/api/public/kidcity-locations");
    assert.equal(url.searchParams.get("purpose"), "inquiry");
    assert.equal(url.searchParams.get("centerId"), "cmp4ewfzn004g6alwqbqrzcql");
    assert.equal(result.calls[0].options.cache, "no-store");
    assert.equal("method" in result.calls[0].options, false, "No lead submission or real network");
  }
});

test("disabled, missing, unsuccessful and failed availability leaves Avada Lee unselectable", async () => {
  for (const scenario of [{ eligible: false }, { includeLocation: false }, { responseOk: false }, { loadFails: true }]) {
    const result = await runTemplate(scenario);
    assert.equal(result.option.disabled, true);
    assert.equal(result.option.hidden, true);
  }
});
