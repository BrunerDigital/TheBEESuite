import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, type Plugin } from "esbuild";
import { chromium, webkit } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

async function main() {
  const output = resolve("output/playwright/auth-hydration");
  await mkdir(output, { recursive: true });
  const nextMock: Plugin = { name: "next-fixture", setup(builder) {
    // Crypto-backed server helpers are never exercised by these UI-only fixtures.
    builder.onResolve({ filter: /^node:crypto$/ }, args => ({ path: args.path, namespace: "fixture-server-only" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-server-only" }, () => ({ contents: "export const createHmac=()=>{throw Error('Server crypto used in UI fixture')};export const timingSafeEqual=createHmac;" }));
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "next-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "next-fixture" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
      ? "const router={refresh(){},push(){},replace(){}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams('force=1');"
      : args.path === "next/link"
        ? "import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}"
        : "import React from 'react';export default function Image({priority,fill,unoptimized,...props}){return React.createElement('img',props)}" }));
  } };
  const shared = { bundle: true, write: false, jsx: "automatic" as const, define: { "process.env.NODE_ENV": '"test"' }, plugins: [nextMock] };
  const ssr = await build({ ...shared, platform: "node", format: "cjs", packages: "external", stdin: { resolveDir: process.cwd(), loader: "tsx", contents: "import {renderToString} from 'react-dom/server';import {AuthFixture} from './tests/fixtures/auth-hydration';export const render=(kind:string)=>renderToString(<AuthFixture kind={kind}/>);" } });
  const ssrFile = resolve(output, "server.cjs");
  await writeFile(ssrFile, ssr.outputFiles[0].contents);
  const { render } = createRequire(resolve("package.json"))(ssrFile) as { render(kind: string): string };
  const client = await build({ ...shared, platform: "browser", format: "iife", stdin: { resolveDir: process.cwd(), loader: "tsx", contents: "import {hydrateRoot} from 'react-dom/client';import {AuthFixture} from './tests/fixtures/auth-hydration';const root=document.getElementById('root')!;hydrateRoot(root,<AuthFixture kind={root.dataset.kind!}/>);" } });
  const server = createServer((request, response) => {
    if (request.url === "/hydrate.js") { response.setHeader("Content-Type", "application/javascript"); response.end(client.outputFiles[0].contents); return; }
    const kind = new URL(request.url!, "http://fixture").searchParams.get("kind") ?? "login";
    assert.ok(["login", "forgot", "reset", "pin", "registration"].includes(kind));
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html><body><div id="root" data-kind="${kind}">${render(kind)}</div><script src="/hydrate.js"></script></body></html>`);
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const results: object[] = [];
  await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
    for (const kind of ["login", "forgot", "reset"]) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      let hydrate: (() => void) | undefined;
      let respond: (() => void) | undefined;
      let writes = 0;
      const errors: string[] = [];
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        assert.equal(url.origin, base);
        assert.equal(url.searchParams.has("password") || url.searchParams.has("newPassword") || url.searchParams.has("email"), false);
        if (url.pathname === "/hydrate.js") { await new Promise<void>(done => { hydrate = done; }); return route.continue(); }
        if (url.pathname.startsWith("/api/")) {
          assert.equal(route.request().method(), "POST");
          writes++;
          await new Promise<void>(done => { respond = done; });
          return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Synthetic rejection" }) });
        }
        if (url.pathname !== "/") return route.fulfill({ status: 204 });
        return route.continue();
      });
      try {
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base}/?kind=${kind}`, { waitUntil: "commit" });
        await page.locator("input").first().waitFor({ state: "visible" });
        assert.equal(await page.locator("form").getAttribute("method"), "post");
        assert.equal(await page.locator("button[type=submit]").isDisabled(), true);
        for (const field of await page.locator("input").all()) assert.equal(await field.isDisabled(), true);
        assert.equal(writes, 0);
        assert.ok(hydrate); hydrate();
        await page.waitForFunction(() => !document.querySelector("input")?.matches(":disabled"));
        for (const field of await page.locator("input").all()) await field.fill(await field.getAttribute("type") === "password" ? "Synthetic-only-example-123!" : "nobody@example.test");
        await page.locator("button[type=submit]").click();
        await page.waitForFunction(() => document.querySelector("input")?.matches(":disabled"));
        assert.ok(respond); respond();
        await page.getByText("Synthetic rejection", { exact: true }).waitFor();
        await page.waitForFunction(() => !document.querySelector("input")?.matches(":disabled"));
        assert.equal(writes, 1);
        assert.equal(await page.locator("input").first().inputValue(), kind === "reset" ? "Synthetic-only-example-123!" : "nobody@example.test");
        assert.deepEqual(errors, []);
        results.push({ kind, preHydrationDisabled: true, postHydrationPost: true, rejectedDraftRetained: true });
      } finally { hydrate?.(); respond?.(); await context.close(); }
    }
    for (const kind of ["login", "forgot", "reset", "pin", "registration"]) {
      const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
      const submissions: Array<{ method: string; containsCredentialQuery: boolean }> = [];
      await context.route("**/*", async route => {
        const request = route.request(); const url = new URL(request.url());
        assert.equal(url.origin, base);
        if (url.pathname.startsWith("/api/")) {
          submissions.push({ method: request.method(), containsCredentialQuery: url.search.includes("Synthetic-only") });
          return route.fulfill({ status: 400, contentType: "text/plain", body: "Synthetic native fallback rejected" });
        }
        if (url.pathname !== "/" && url.pathname !== "/hydrate.js") return route.fulfill({ status: 204 });
        return route.continue();
      });
      try {
        const page = await context.newPage();
        await page.goto(`${base}/?kind=${kind}`);
        for (const field of await page.locator("input:not([type=hidden])").all()) assert.equal(await field.isDisabled(), true);
        // Deliberately bypass disabled controls to exercise the native POST fallback too.
        await page.evaluate(() => {
          const form = document.querySelector("form")!;
          for (const fieldset of form.querySelectorAll("fieldset")) fieldset.disabled = false;
          for (const field of form.querySelectorAll<HTMLInputElement>("input[type=password]")) field.value = "Synthetic-only-example-123!";
          HTMLFormElement.prototype.submit.call(form);
        });
        await page.waitForURL(url => url.pathname.startsWith("/api/"));
        assert.deepEqual(submissions, [{ method: "POST", containsCredentialQuery: false }]);
        results.push({ kind, javaScriptDisabled: true, inputsDisabled: true, nativeFallbackPost: true });
      } finally { await context.close(); }
    }
  });
  await writeFile(resolve(output, `${engine}.json`), JSON.stringify({ engine, results, passed: true }, null, 2));
  console.log(JSON.stringify({ engine, cases: results.length, passed: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
