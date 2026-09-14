import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

// Local real components with fake data. Every API call is intercepted.
async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const bundle = await build({ entryPoints: ["tests/fixtures/school-setup-save.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "fake-next" }));
    builder.onLoad({ filter: /.*/, namespace: "fake-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
      ? "const router={refresh(){},push(){},replace(){}}; export const useRouter=()=>router; export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search);"
      : "import React from 'react'; export default function Link({children,...props}){return React.createElement('a',props,children)}" }));
  } }] });
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const results: object[] = [];
  await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
    for (const panel of ["data", "business"] as const) for (const outcome of ["success", "failure"] as const) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      let release: (() => void) | undefined;
      let writes = 0;
      const errors: string[] = [];
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) { errors.push("Unexpected off-origin request"); return route.abort(); }
        if (!url.pathname.startsWith("/api/")) return route.continue();
        assert.equal(url.pathname, "/api/school-setup"); assert.equal(route.request().method(), "POST");
        writes++;
        const input = route.request().postDataJSON();
        await new Promise<void>(resolve => { release = resolve; });
        const body = outcome === "failure" ? { ok: false, error: "Synthetic save rejected" } : panel === "data"
          ? { ok: true, dataSetup: { ...input.dataSetup, selectedAt: null, selectedByUserId: null, selectedByEmail: null, reviewConfirmation: null, version: 1 } }
          : { ok: true, sections: input.sections, schoolEin: input.schoolEin, businessProfile: input.businessProfile };
        await route.fulfill({ status: outcome === "failure" ? 409 : 200, contentType: "application/json", body: JSON.stringify(body) });
      });
      try {
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base}/?panel=${panel}`);
        if (panel === "business") await page.getByRole("button", { name: "Edit School name", exact: true }).click();
        const field = page.locator(panel === "data" ? "#school-data-setup-notes" : "#school-profile-name");
        await field.fill("Reviewed draft");
        const save = panel === "data" ? page.getByRole("button", { name: /Save Starting Point/i }) : page.getByRole("button", { name: "Save draft", exact: true });
        await save.click();
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.disabled && button.textContent?.includes("Save")));
        assert.ok(release, "Save reached local interceptor");
        assert.equal(await field.isDisabled(), true, `${panel}: draft remains editable during pending save and could be overwritten`);
        assert.equal(await save.isDisabled(), true);
        release();
        await page.getByText(outcome === "failure" ? "Synthetic save rejected" : panel === "data" ? "School data starting point saved." : "School profile and setup details saved.", { exact: true }).waitFor();
        await page.waitForFunction(selector => !document.querySelector(selector)?.matches(":disabled"), panel === "data" ? "#school-data-setup-notes" : "#school-profile-name");
        assert.equal(await field.inputValue(), "Reviewed draft");
        assert.equal(await field.isDisabled(), false);
        assert.equal(writes, 1, "No automatic retries");
        assert.deepEqual(errors, []);
        results.push({ panel, outcome, passed: true });
      } finally { release?.(); await context.close(); }
    }
  });
  await mkdir("output/playwright/school-setup-save", { recursive: true });
  await writeFile(`output/playwright/school-setup-save/${engine}.json`, JSON.stringify({ engine, results, passed: true }, null, 2));
  console.log(JSON.stringify({ engine, cases: results.length, passed: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
