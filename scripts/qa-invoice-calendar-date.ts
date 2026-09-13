import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, webkit } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

// Real components, fake local data, no API or provider traffic and no saving.
async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const sourceFiles = ["src/lib/invoice-due-date.ts", "src/lib/zoned-date-time.ts", "src/app/globals.css", "src/app/product-ui.css", "tests/fixtures/ui-flow-recovery.tsx", ...["billing-workbench", "parent-portal-workspace", "billing-print-actions", "payment-method-request-form", "accounts-receivable-panel", "kiosk-check-in", "live-ops-pages"].map(name => `src/components/${name}.tsx`), "src/app/api/global-search/route.ts"];
  const fingerprint = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  const sourceHashes = await fingerprint();
  const output = path.resolve(`output/playwright/invoice-calendar-date-${engine}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(output, { recursive: true });
  const styles = await Promise.all(["globals", "product-ui"].map(async name => {
    const from = path.resolve(`src/app/${name}.css`);
    return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  }));
  const assets = new Map<string, Buffer>(await Promise.all(["favicon-dark.png", "app-icon-dark.png", "mr-bee-profile.png"].map(async name => [`/brand/the-bee-suite/${name}`, await readFile(`public/brand/the-bee-suite/${name}`)] as const)));
  const font = await readFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2");
  const bundle = await build({ entryPoints: ["tests/fixtures/ui-flow-recovery.tsx"], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next-boundary", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "mock-next" }));
    builder.onLoad({ filter: /.*/, namespace: "mock-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
      ? "const router={refresh(){},push(){},replace(){},back(){}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;"
      : "import React from 'react';export default function Element({children,fill,priority,unoptimized,prefetch,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
  } }] });
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://fixture.invalid");
    if (url.pathname === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles.find(file => file.path.endsWith(".js"))!.contents); return; }
    if (url.pathname === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles.join("\n") + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "") + "\n@font-face{font-family:FixtureGeist;src:url('/font.woff2');font-weight:100 900}:root{--font-geist-sans:FixtureGeist,Arial,sans-serif}"); return; }
    if (url.pathname === "/font.woff2") { response.setHeader("Content-Type", "font/woff2"); response.end(font); return; }
    const asset = assets.get(url.pathname); if (asset) { response.setHeader("Content-Type", "image/png"); response.end(asset); return; }
    response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const results: object[] = [], blocked: string[] = [], errors: string[] = [];
  const views = ["billing", "home", "payments", "invoice-payment-link", "invoice-receivables"];
  const cases = ["America/New_York", "America/Los_Angeles", "UTC", "Pacific/Kiritimati"].flatMap(timezoneId => ["2026-09-14", "2026-09-14T00:00:00Z", "2026-09-14T12:00:00Z"].flatMap(dueDate => views.map(view => ({ timezoneId, dueDate, view, width: 390, zoom: 100 }))));
  cases.push(...views.map(view => ({ timezoneId: "America/New_York", dueDate: "2026-09-14T00:00:00Z", view, width: 320, zoom: 200 })));
  let activeCase: unknown;
  try {
    await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
      for (const [index, candidate] of cases.entries()) {
        activeCase = candidate;
        const context = await browser.newContext({ viewport: { width: candidate.width, height: candidate.width === 320 ? 568 : 844 }, timezoneId: candidate.timezoneId, serviceWorkers: "block", reducedMotion: "reduce" });
        await context.route("**/*", route => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== base || url.pathname.startsWith("/api/")) { blocked.push(request.method() + " " + url.pathname); return route.abort(); }
          return route.continue();
        });
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.addInitScript(() => { window.print = () => {}; });
        const query = new URLSearchParams({ view: candidate.view, "invoice-date": candidate.dueDate, tz: candidate.timezoneId, family: "a" });
        if (candidate.view === "billing") query.set("office-shell", "");
        await page.goto(`${base}/billing-invoices?${query}`);
        await page.locator("html[data-fixture-ready=true]").waitFor(); await page.evaluate(() => document.fonts.ready);
        await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, candidate.zoom);
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        let printed = false, edited = false;
        if (candidate.view === "billing") {
          await page.getByRole("button", { name: "More billing tasks", exact: true }).click();
          await page.getByRole("tab", { name: "Edit invoice", exact: true }).click();
          assert.match(await page.locator("#billing-invoice-editor").innerText(), /due Sep 14, 2026/);
          assert.equal(await page.locator("#billing-invoice-due-date").inputValue(), "2026-09-14");
          await page.locator("#billing-invoice-editor").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `${index}-${candidate.view}-original.png`) });
          await page.locator("#billing-invoice-due-date").fill("2026-09-15");
          assert.ok((await page.locator('#billing-workbench [role="tabpanel"]').innerText()).includes("Sep 15, 2026"));
          assert.match(await page.locator("#billing-invoice-editor").innerText(), /due Sep 14, 2026/, "Unsaved draft does not alter original invoice");
          edited = true;
        } else {
          if (candidate.view === "invoice-payment-link") assert.equal(await page.locator("main").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(9, 11, 16)", "Use the secure payment page's actual dark background");
          if (candidate.view === "payments") await page.locator("summary").filter({ hasText: "Invoice history" }).click();
          const due = page.getByText(/(?:due |Due )Sep 14, 2026/).first();
          await due.waitFor({ state: "visible" }); await due.scrollIntoViewIfNeeded();
          assert.doesNotMatch(await due.innerText(), /Sep (13|15), 2026/);
          await page.screenshot({ path: path.join(output, `${index}-${candidate.view}.png`) });
          if (candidate.view === "payments" || candidate.view === "invoice-receivables") {
            await page.getByRole("button", { name: candidate.view === "payments" ? "View / print invoice" : "Print balances", exact: true }).click();
            const report = page.locator(".bee-print-report-active"); await report.waitFor({ state: "attached" });
            await page.waitForFunction(() => document.body.classList.contains("bee-report-printing"));
            // Printing uses paper width, not the narrow phone screenshot viewport.
            await page.setViewportSize({ width: 816, height: 1056 });
            await page.emulateMedia({ media: "print" });
            const row = candidate.view === "payments" ? report.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Due date", exact: true }) }) : report.getByRole("row").filter({ hasText: "Fake Family A" });
            assert.ok((await row.innerText()).includes("Sep 14, 2026"), "Screen and print due dates match");
            await page.screenshot({ path: path.join(output, `${index}-${candidate.view}-print.png`), fullPage: true });
            if (engine === "chromium" && [2, 4, 62, 64].includes(index)) await page.pdf({ path: path.join(output, `${index}-${candidate.view}-letter.pdf`), format: "Letter", printBackground: true });
            printed = true;
          }
        }
        results.push({ ...candidate, passed: true, printed, edited }); await context.close();
      }
      assert.deepEqual(blocked, []); assert.deepEqual(errors, []); assert.equal(results.length, 65);
    });
    assert.deepEqual(await fingerprint(), sourceHashes, "Sources changed while checking");
    await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: true, engine, sourceHashes, results, blocked, errors, completedAt: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ passed: true, cases: results.length, output }));
  } catch (error) {
    await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: false, activeCase, results, blocked, errors, failure: String(error) }, null, 2)); throw error;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
