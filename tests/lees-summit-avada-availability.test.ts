import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
const source = html.match(/<script>([\s\S]*?)<\/script>/i)![1];
const identifier = "Kid City USA - MO | Lees Summit";

async function runTemplate({ eligible = true, includeLocation = true, responseOk = true, loadFails = false, loading = false } = {}) {
  const option = { value: identifier, disabled: true, hidden: true };
  const calls: { url: string; options: { cache: string } }[] = [];
  const listeners = new Map<string, () => void>();
  const form = {
    getAttribute: () => "https://fixture.invalid/api/inquiries",
    querySelector: (selector: string) => {
      return selector === 'option[value="' + identifier + '"]' ? option : null;
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

test("standalone Avada omits the removed Lee option and retains approved schools", () => {
  assert.doesNotMatch(html, /<option[^>]*value="Kid City USA - MO \| Lees Summit"[^>]*>/);
  for (const retained of ["FL | Vero Beach", "TN | Lewisburg"]) {
    const option = html.match(new RegExp('<option[^>]*value="Kid City USA - ' + retained.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*>'))![0];
    assert.doesNotMatch(option, /disabled|hidden/);
  }
});

test("a stale Avada Lee option cannot be re-enabled by old availability results", async () => {
  for (const loading of [false, true]) {
    const result = await runTemplate({ loading });
    assert.equal(result.option.disabled, true);
    assert.equal(result.option.hidden, true);
    assert.equal(result.calls.length, 0, "Removed binding cannot advertise or submit intake");
  }
});

test("disabled, missing, unsuccessful and failed availability leaves Avada Lee unselectable", async () => {
  for (const scenario of [{ eligible: false }, { includeLocation: false }, { responseOk: false }, { loadFails: true }]) {
    const result = await runTemplate(scenario);
    assert.equal(result.option.disabled, true);
    assert.equal(result.option.hidden, true);
  }
});
