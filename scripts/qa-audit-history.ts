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

async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const layoutWidths = process.env.QA_AUDIT_WIDTH ? [Number(process.env.QA_AUDIT_WIDTH)] : [320, 390, 768, 1280];
  const layoutZooms = process.env.QA_AUDIT_ZOOM ? [Number(process.env.QA_AUDIT_ZOOM)] : [100, 200];
  const files = ["src/components/audit-log-viewer.tsx", "src/components/audit-history-page.tsx", "src/lib/audit-history.ts", "tests/fixtures/audit-history.tsx"];
  const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  const before = await hashes();
  const css = (await Promise.all(["globals", "product-ui"].map(async name => { const from = path.resolve(`src/app/${name}.css`); return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css; }))).join("\n");
  const font = await readFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2");
  const bundle = await build({ entryPoints: ["tests/fixtures/audit-history.tsx"], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
      ? "export const useRouter=()=>({push(href){const go=()=>{history.pushState({},'',href);window.dispatchEvent(new Event('fake-audit-navigation'))};if(window.__deferAuditNav)window.__completeAuditNav=go;else go()},replace(href){location.replace(href)},refresh(){location.reload()}});"
      : "import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}" }));
  } }] });
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles.find(file => file.path.endsWith(".js"))!.contents); return; }
    if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css + "\n@font-face{font-family:FixtureGeist;src:url('/font.woff2');font-weight:100 900}:root{--font-geist-sans:FixtureGeist,Arial,sans-serif}"); return; }
    if (req.url === "/font.woff2") { res.end(font); return; }
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const addr = server.address(); assert.ok(addr && typeof addr !== "string"); const base = `http://127.0.0.1:${addr.port}`;
  const output = path.resolve(`output/playwright/audit-history-${engine}-${new Date().toISOString().replace(/[:.]/g, "-")}`); await mkdir(output, { recursive: true });
  const results: object[] = [], errors: string[] = [], unexpected: string[] = [], requests: string[] = [];
  let mode = "success", release: (() => Promise<void>) | null = null;
  await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce", acceptDownloads: true });
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== base) { unexpected.push("off-origin"); return route.abort(); }
      if (url.pathname === "/api/audit-logs/export" && req.method() === "GET") {
        requests.push(url.search); assert.ok(url.searchParams.get("asOf")); assert.equal(url.searchParams.has("page"), false);
        const body = '"When (UTC)","Fake record"\r\n"2026-09-13T16:00:00Z","Fake event"\r\n';
        const respond = () => route.fulfill({ status: mode === "large" ? 413 : mode === "failed" ? 503 : mode === "limited" ? 429 : 200,
          headers: { "content-type": mode === "malformed" ? "text/html" : "text/csv", "x-audit-row-count": "1", "cache-control": "private, no-store" }, body });
        if (mode === "deferred") { release = respond; return; } return respond();
      }
      if (url.pathname.startsWith("/api/") || req.method() !== "GET") { unexpected.push(req.method() + " " + url.pathname); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const ready = async () => { await page.locator('html[data-fixture-ready="true"]').waitFor(); await page.evaluate(() => document.fonts.ready); await settle(); };
    const open = async (width = 390, zoom = 100, query = "") => { await page.setViewportSize({ width, height: 844 }); await page.goto(base + "/audit-logs" + query); await ready(); await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, zoom); await settle(); };
    for (const width of layoutWidths) for (const zoom of layoutZooms) {
      await open(width, zoom); assert.equal(await page.getByRole("heading", { name: "Audit history", exact: true }).count(), 1);
      assert.equal(await page.locator("form details").getAttribute("open"), null);
      assert.match(await page.getByRole("navigation", { name: "Events pages" }).first().innerText(), /1–50 of 121/);
      if (width <= 390) await page.screenshot({ path: path.join(output, `${width}-${zoom}-collapsed.png`) });
      await page.getByText("More filters", { exact: true }).click();
      for (const label of ["Search all history", "Action", "Resource", "School", "From date", "Through date"]) assert.equal(await page.getByLabel(label, { exact: true }).count(), 1, label);
      await page.getByRole("combobox", { name: "School", exact: true }).click();
      await page.getByRole("option", { name: "Fake School · school-b", exact: true }).click();
      await page.locator('[data-slot="select-content"]').waitFor({ state: "hidden" }); await settle();
      const geometry = await page.locator("[data-audit-history-page]").evaluate(root => ({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        offenders: [...root.querySelectorAll<HTMLElement>("*")].filter(el => { const r = el.getBoundingClientRect(); return r.height > 0 && (r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1); }).slice(0, 12).map(el => ({ tag: el.tagName, classes: el.className, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: el.textContent?.slice(0, 60) })),
        controls: [...root.querySelectorAll<HTMLElement>("button,input:not([type=hidden]),select,summary,a")].filter(el => el.getBoundingClientRect().height > 0 && el.getAttribute("aria-hidden") !== "true").map(el => ({ name: el.textContent?.slice(0, 35), height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width })) }));
      for (const hidden of await page.locator('input[aria-hidden="true"]').all()) assert.equal(await hidden.getAttribute("tabindex"), "-1", "Select plumbing is not a touch or keyboard target");
      assert.equal(geometry.overflow, 0, JSON.stringify({ width, zoom, geometry })); assert.ok(geometry.controls.every(control => control.height >= 44 && control.width >= 44), JSON.stringify({ width, zoom, geometry }));
      if (width <= 390) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(output, `${width}-${zoom}-filters.png`) }); }
      if (width <= 390) { const details = page.locator("ol details").first(); await details.locator("summary").click(); assert.match(await details.innerText(), /synthetic-reviewer@example.test/); }
      results.push({ width, zoom, geometry });
    }
    await open(390, 100, "?page=3"); assert.match(await page.getByRole("navigation", { name: "Events pages" }).first().innerText(), /101–121 of 121/);
    await page.getByText("More filters", { exact: true }).click(); await page.getByRole("combobox", { name: "School", exact: true }).click(); await page.getByRole("option", { name: "Fake School · school-b", exact: true }).click(); await page.locator('[data-slot="select-content"]').waitFor({ state: "hidden" });
    assert.equal(await page.locator('input[name="centerId"]').inputValue(), "fake-school-b");
    await page.getByLabel("Search all history").fill("historic.record"); await page.getByRole("button", { name: "Search", exact: true }).focus(); await page.getByRole("button", { name: "Search", exact: true }).press("Enter"); await ready();
    await page.getByRole("status").filter({ hasText: "Showing 1–1 of 1 matching events." }).waitFor();
    assert.equal(await page.locator("#audit-results").evaluate(el => document.activeElement === el), true, "Keyboard search lands on the announced results");
    assert.equal(new URL(page.url()).searchParams.get("q"), "historic.record"); assert.equal(new URL(page.url()).searchParams.get("centerId"), "fake-school-b"); assert.equal(new URL(page.url()).searchParams.has("page"), false);
    assert.match(await page.getByRole("navigation", { name: "Events pages" }).first().innerText(), /1–1 of 1/);
    const allSchoolsFixture = page.locator('[data-fixture-audit-search="all"]'); assert.equal(await allSchoolsFixture.count(), 1); await allSchoolsFixture.dispatchEvent("click", undefined, { timeout: 5_000 }); await page.waitForTimeout(100); assert.equal(new URL(page.url()).searchParams.get("page"), "3"); assert.equal(await page.locator('input[name="centerId"]').inputValue(), ""); await page.getByText("More filters", { exact: true }).click(); assert.match(await page.getByRole("combobox", { name: "School", exact: true }).innerText(), /All schools/);
    const allSchoolsRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/audit-logs/export"); await page.getByRole("button", { name: "Export all matches" }).click(); await allSchoolsRequest; assert.equal(new URL("https://thebeesuite.io" + requests.at(-1)!).searchParams.has("centerId"), false);
    await page.locator('[data-fixture-audit-search="filtered"]').dispatchEvent("click"); await page.waitForTimeout(100); await settle(); assert.equal(await page.getByLabel("Search all history").inputValue(), "historic.record"); assert.equal(await page.locator('input[name="centerId"]').inputValue(), "fake-school-b");
    const schoolRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/audit-logs/export"); await page.getByRole("button", { name: "Export all matches" }).click(); await schoolRequest; assert.equal(new URL("https://thebeesuite.io" + requests.at(-1)!).searchParams.get("centerId"), "fake-school-b"); results.push({ urlHistoryAndOlderSearch: true, visibleFiltersMatchExport: true });
    for (const failure of ["large", "failed", "malformed", "limited"]) {
      mode = failure; await page.getByRole("button", { name: "Export all matches" }).click(); await page.getByRole("status").filter({ hasText: failure === "large" ? "too large" : failure === "failed" ? "could not be completed" : failure === "limited" ? "wait one minute" : "incomplete" }).waitFor();
      mode = "success"; const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export all matches" }).click(); await download;
      await page.getByRole("status").filter({ hasText: "Downloaded 1 matching events" }).waitFor(); assert.equal(requests.at(-1), requests.at(-2)); results.push({ failure, sameFiltersRetry: true });
    }
    mode = "deferred"; const beforeRequests = requests.length;
    await page.getByRole("button", { name: "Export all matches" }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await page.getByRole("button", { name: "Exporting…" }).waitFor(); assert.equal(requests.length, beforeRequests + 1);
    await page.getByRole("link", { name: "Reset", exact: true }).click(); await ready(); assert.ok(release); await (release as () => Promise<void>)().catch(() => {}); release = null;
    assert.equal(await page.getByRole("status").innerText(), ""); results.push({ duplicateAndStaleExport: "guarded" });
    await page.evaluate(() => { (window as unknown as { __deferAuditNav: boolean }).__deferAuditNav = true; });
    await page.getByLabel("Search all history").fill("historic.record"); await page.getByRole("button", { name: "Search", exact: true }).focus(); await page.getByRole("button", { name: "Search", exact: true }).press("Enter");
    const other = page.getByRole("link", { name: "Refresh results" }); await other.focus();
    await page.evaluate(() => { const fixture = window as unknown as { __completeAuditNav: () => void; __deferAuditNav: boolean }; fixture.__deferAuditNav = false; fixture.__completeAuditNav(); });
    await page.getByRole("status").filter({ hasText: "Showing 1–1 of 1 matching events." }).waitFor(); assert.equal(await other.evaluate(el => document.activeElement === el), true, "New results do not steal moved focus");
    await page.getByLabel("Search all history").fill("no-fake-match"); await page.getByRole("button", { name: "Search", exact: true }).focus(); await page.getByRole("button", { name: "Search", exact: true }).press("Enter");
    await page.getByRole("status").filter({ hasText: "Showing 0–0 of 0 matching events." }).waitFor(); assert.equal(await page.locator("#audit-results").evaluate(el => document.activeElement === el), true);
    results.push({ filterFocus: "retained or respectfully restored", emptyResultsAnnounced: true });
    await open(320, 200, "?q=no-fake-match"); assert.match(await page.locator("#audit-results").innerText(), /No events match/); assert.equal(await page.getByRole("button", { name: "Export all matches" }).isDisabled(), true);
    await open(320, 200, "?start=2026-02-30"); assert.match(await page.getByRole("alert").innerText(), /valid dates/); assert.equal(await page.getByRole("link", { name: "Reset audit filters" }).count(), 1);
    results.push({ emptyAndInvalidRecovery: true });
    await open(390, 100, "?page=3"); await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole("button", { name: "Print this page" }).click(); await page.locator("body.bee-report-printing").waitFor();
    const report = page.locator(".bee-print-report-active"); assert.equal(await report.locator("tbody tr").count(), 21);
    assert.match(await report.textContent() ?? "", /101–121 of 121 matching events/); assert.match(await report.textContent() ?? "", /Fake School · school-a/); assert.match(await report.textContent() ?? "", /Fake School · school-b/);
    await page.emulateMedia({ media: "print" });
    const printWidth = await report.evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth, offenders: [...el.querySelectorAll<HTMLElement>("*")].filter(node => node.scrollWidth > node.clientWidth + 1).slice(0, 10).map(node => ({ tag: node.tagName, text: node.textContent?.slice(0, 50), width: node.clientWidth, scroll: node.scrollWidth, wrap: getComputedStyle(node).overflowWrap, layout: getComputedStyle(node).tableLayout })) }));
    await page.screenshot({ path: path.join(output, "audit-print-layout.png"), fullPage: true });
    assert.ok(printWidth.scroll <= printWidth.width + 1, JSON.stringify(printWidth));
    if (engine === "chromium") await page.pdf({ path: path.join(output, "audit-history-page-3.pdf"), format: "Letter", printBackground: true });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint"))); await page.emulateMedia({ media: "screen" }); results.push({ printCurrentPage: 21, completeSchoolLabels: true, printWidth });
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(await hashes(), before);
    await writeFile(path.join(output, "results.json"), JSON.stringify({ engine, passed: true, results, cases: results.length, requests: requests.length, backendRequests: 0, errors, unexpected, sourceHashes: before }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, cases: results.length, requests: requests.length, backendRequests: 0, output }));
  });
}
main().catch(error => { console.error(error); process.exit(1); });
