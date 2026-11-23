import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
import { withFixtureBrowser } from "../scripts/qa-fixture-browser";

test("public registration omits general guardian identifiers while valid forms still submit", { timeout: 120_000 }, async t => {
  const fixture = await build({
    entryPoints: ["tests/fixtures/public-registration-privacy.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "fixture-next-link", setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture-next" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-next" }, () => ({ loader: "jsx", resolveDir: process.cwd(), contents: "import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}" }));
    } }],
  });
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(fixture.outputFiles[0].contents); }
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><title>Fictional registration privacy QA</title><style>body{font:16px sans-serif;margin:24px}input,button,textarea{padding:8px;margin:4px}svg{width:16px;height:16px}[data-slot="card"]{margin:16px 0}[data-slot="select-content"]{background:white;z-index:100}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  await withFixtureBrowser(server, () => chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL }), async browser => {
    for (const state of ["FL", "IN"]) await t.test(`${state}: blank form and synthetic submission preserve normal fields and meal last-four`, async () => {
      const page = await browser.newPage(); page.setDefaultTimeout(10_000);
      const submissions: Array<Record<string, unknown>> = [], unexpected: string[] = [], errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === base && request.method() === "GET" && !url.pathname.startsWith("/api/")) return route.continue();
        if (url.origin === base && url.pathname === "/api/registration" && request.method() === "POST") {
          submissions.push(request.postDataJSON());
          await route.fulfill({ status: 201, json: { ok: true, leadId: "fixture-lead", submissionId: "fixture-submission" } });
          return;
        }
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort();
      });
      try {
        await page.goto(`${base}/registration?state=${state}`);
        const submit = page.getByRole("button", { name: "Submit registration packet", exact: true });
        await submit.waitFor();
        const blocked = ["primaryGuardianDriverLicense", "primaryGuardianSocialSecurityNumber", "secondaryGuardianDriverLicense", "secondaryGuardianSocialSecurityNumber"];
        for (const key of blocked) assert.equal(await page.locator(`[name="${key}"]`).count(), 0, `No general identifier input for ${key}`);
        assert.equal(await page.locator("#mealApplicationLastFourSsn").getAttribute("maxlength"), "4");
        for (const [id, value] of Object.entries({
          primaryGuardianName: "Fixture Primary Guardian", primaryGuardianEmail: "primary@example.test", primaryGuardianPhone: "2025550101",
          secondaryGuardianName: "Fixture Secondary Guardian", secondaryGuardianEmail: "secondary@example.test", secondaryGuardianPhone: "2025550102",
          childFullName: "Fixture Child", childDateOfBirth: "2023-01-01", desiredStartDate: "2026-12-01", emergencyContacts: "Fixture Emergency Contact",
          authorizedPickups: "Fixture Pickup Contact", signatureName: "Fixture Primary Guardian", signatureDate: "2026-11-23", mealApplicationLastFourSsn: "0000",
        })) await page.locator(`#${id}`).fill(value);
        for (const [id, label] of [["program", "Preschool"], ["schedule", "Full time"]]) {
          await page.locator(`#${id}`).click(); await page.getByRole("option", { name: label, exact: true }).click();
        }
        const otherRequiredChoices = page.locator('button[role="combobox"][aria-required="true"]');
        for (let index = 0; index < await otherRequiredChoices.count(); index++) {
          if (await otherRequiredChoices.nth(index).getAttribute("data-placeholder") !== null) {
            await otherRequiredChoices.nth(index).click(); await page.getByRole("option").nth(1).click();
          }
        }
        const requiredChecks = page.locator('input[type="checkbox"][required]');
        for (let index = 0; index < await requiredChecks.count(); index++) await requiredChecks.nth(index).check();
        const requiredText = page.locator('input[required]:not([type]), input[type="text"][required]');
        for (let index = 0; index < await requiredText.count(); index++) if (!(await requiredText.nth(index).inputValue())) await requiredText.nth(index).fill("FX");
        await page.locator("#mealBenefitApplicationNeeded").check();
        // Simulate old autofill/DOM fields. The current serializer must ignore them.
        await page.evaluate(keys => {
          const form = document.querySelector("form")!;
          for (const name of keys) { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = "synthetic-general-identifier-not-a-real-number"; form.appendChild(input); }
        }, blocked);
        const invalidFields = await page.locator("form").evaluate(form => Array.from(form.querySelectorAll("input,select,textarea"))
          .filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)
          .filter(element => !element.validity.valid).map(element => element.name));
        assert.deepEqual(invalidFields, [], "The synthetic fixture must satisfy the real form's native validation");
        const response = page.waitForResponse(result => result.url() === `${base}/api/registration`);
        await submit.click(); await response;
        assert.equal(submissions.length, 1);
        const payload = submissions[0];
        for (const key of blocked) assert.equal(Object.hasOwn(payload, key), false, `Do not serialize ${key}`);
        assert.equal(JSON.stringify(payload).includes("synthetic-general-identifier-not-a-real-number"), false);
        assert.equal(payload.centerId, "fixture-school");
        assert.equal(payload.primaryGuardianName, "Fixture Primary Guardian");
        assert.equal(payload.secondaryGuardianName, "Fixture Secondary Guardian");
        assert.equal(payload.mealApplicationLastFourSsn === "0000" && payload.mealBenefitApplicationNeeded === true, true);
        assert.equal(payload.policyAcknowledgment === true && payload.eSignatureConsent === true, true);
        assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  });
});
