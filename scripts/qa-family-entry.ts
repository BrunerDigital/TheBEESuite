import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

async function main() {
  const bundle = await build({ entryPoints: ["tests/fixtures/family-entry.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "fake-next" }));
    builder.onLoad({ filter: /.*/, namespace: "fake-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
      ? "const router={refresh(){}}; export const useRouter=()=>router;"
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
  await withFixtureBrowser(server, () => chromium.launch(), async browser => {
    for (const width of [390, 1280]) for (const outcome of ["success", "network", "invalid-json", "validation"] as const) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      let release: (() => void) | undefined;
      let writes = 0;
      const errors: string[] = [];
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) { errors.push("Unexpected off-origin request"); return route.abort(); }
        if (!url.pathname.startsWith("/api/")) return route.continue();
        assert.equal(url.pathname, "/api/families/intake");
        writes++;
        assert.equal(route.request().postDataJSON().centerId, "synthetic-school");
        await new Promise<void>(resolve => { release = resolve; });
        if (outcome === "network") return route.abort();
        if (outcome === "invalid-json") return route.fulfill({ status: 200, body: "unconfirmed" });
        return route.fulfill({ status: outcome === "validation" ? 400 : 201, contentType: "application/json", body: JSON.stringify(outcome === "validation"
          ? { error: "Please fix the highlighted fields.", errors: { guardianName: "Synthetic validation error" } }
          : { family: { id: "synthetic-family", name: "Test Family" }, guardian: { id: "synthetic-guardian", fullName: "Test Parent" }, child: { id: "synthetic-child", fullName: "Test Child" } }) });
      });
      try {
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(base);
        await page.getByLabel("Parent/guardian name", { exact: true }).fill("Test Parent");
        await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
        await page.getByLabel("Address", { exact: true }).fill("Synthetic address");
        await page.getByLabel("Restricted custody note", { exact: true }).fill("Synthetic note");
        await page.getByLabel("Child full name", { exact: true }).fill("Test Child");
        await page.getByLabel("Date of birth", { exact: true }).fill("2022-01-01");
        await page.getByLabel("Classroom", { exact: true }).click();
        await page.getByRole("option", { name: "Preschool · Preschool", exact: true }).click();
        const save = page.getByRole("button", { name: "Save Family, Parent + Child", exact: true });
        await save.click();
        await page.waitForFunction(() => document.querySelector("fieldset")?.disabled === true);
        assert.equal(await page.getByLabel("Child full name", { exact: true }).isDisabled(), true);
        assert.ok(release); release();
        if (outcome === "success") {
          await page.getByText("Saved", { exact: true }).waitFor();
          assert.equal(await page.getByText("Complete this family's details", { exact: true }).getAttribute("href"), "/family-detail?familyId=synthetic-family#family-editor");
          assert.equal(await page.getByLabel("Parent/guardian name", { exact: true }).inputValue(), "Test Parent");
          assert.equal(await page.getByLabel("Child full name", { exact: true }).inputValue(), "");
          await page.getByRole("button", { name: "Start next family", exact: true }).click();
          for (const label of ["Parent/guardian name", "Email", "Address", "Restricted custody note", "Child full name"]) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), "");
          assert.equal(await page.getByLabel("Parent/guardian name", { exact: true }).evaluate(el => el === document.activeElement), true);
          assert.match(await page.getByLabel("School / center", { exact: true }).textContent() ?? "", /^Synthetic School/);
        } else {
          await page.getByText(outcome === "validation" ? "Synthetic validation error" : /We could not confirm whether the save finished/).waitFor();
          assert.equal(await page.getByLabel("Child full name", { exact: true }).inputValue(), "Test Child");
          assert.equal(await page.getByLabel("Parent/guardian name", { exact: true }).inputValue(), "Test Parent");
          assert.equal(await page.getByRole("link", { name: "Check family directory", exact: true }).getAttribute("href"), "/family-detail#family-directory");
        }
        assert.equal(writes, 1, "No automatic retry or duplicate request");
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ width, outcome, passed: true }));
      } finally { release?.(); await context.close(); }
    }
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
