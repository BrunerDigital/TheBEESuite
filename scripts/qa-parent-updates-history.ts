import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { withFixtureBrowser } from "./qa-fixture-browser";
import { fakeUpdateFamily, fakeUpdatesPage, fakeUpdateReports } from "../tests/fixtures/parent-updates-data";
import { parseParentUpdatesRequest } from "../src/lib/parent-updates-history";

async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const output = path.resolve(`output/playwright/parent-updates-history-${engine}`); await mkdir(output, { recursive: true });
  const styles = await Promise.all(["globals", "product-ui", "parent-mobile-home"].map(async name => {
    const from = path.resolve(`src/app/${name}.css`); return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  }));
  const font = await readFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2");
  const bundle = await build({ entryPoints: ["tests/fixtures/parent-updates-history.tsx"], outfile: "fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "mock-next-browser-boundary", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "mock-next" }));
      builder.onLoad({ filter: /.*/, namespace: "mock-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
        ? "const router={refresh(){},push(){},replace(){},back(){}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;"
        : "import React from 'react';export default function Element({children,fill,priority,unoptimized,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
    } }],
  });
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles.find(file => file.path.endsWith(".js"))!.contents); return; }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles.join("\n") + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "") + "\n@font-face{font-family:FixtureGeist;src:url('/fixture-font.woff2');font-weight:100 900} :root{--font-geist-sans:FixtureGeist,Arial,sans-serif;--font-geist-mono:monospace}"); return; }
    if (request.url === "/fixture-font.woff2") { response.setHeader("Content-Type", "font/woff2"); response.end(font); return; }
    response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div class="bee-app-frame" data-role="PARENT_GUARDIAN"><main class="dashboard-workspace p-[12px]"><div id="root"></div></main></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
    const results: object[] = [], blocked: string[] = [], errors: string[] = [], requests: string[] = [];
    const waitHeld = async (state: { release: null | (() => void) }) => {
      const deadline = Date.now() + 5000;
      while (!state.release && Date.now() < deadline) await new Promise(done => setTimeout(done, 10));
      assert.ok(state.release, "Expected fake GET did not reach the held boundary within five seconds");
    };
    async function open(extra = "updateDay=2026-09-11", width = 390, zoom = 100) {
      const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 844 }, timezoneId: "Asia/Tokyo", serviceWorkers: "block", reducedMotion: "reduce" });
      const state = { mode: "ok", release: null as null | (() => void) };
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base || request.method() !== "GET") { blocked.push(request.method() + " " + url.pathname); return route.abort(); }
        if (url.pathname === "/fake-photo.png" && url.search === "?demo=1") return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9YQAAAAASUVORK5CYII=", "base64") });
        if (url.pathname.startsWith("/api/")) {
          assert.equal(url.pathname, "/api/parent/history/updates"); const input = parseParentUpdatesRequest(url.searchParams); assert.ok(input); assert.equal(input.familyId, fakeUpdateFamily);
          requests.push(url.search); const result = fakeUpdatesPage(input), mode = state.mode;
          if (mode === "hold") await new Promise<void>(done => { state.release = done; });
          if (mode === "abort") return route.abort();
          const status = /^(401|403|503)$/.test(mode) ? Number(mode) : 200;
          if (mode === "family") result.familyId = "other-family";
          if (mode === "day") result.day = "2026-09-12";
          if (mode === "zone") result.timeZone = "Asia/Tokyo";
          if (mode === "kind") result.requestKind = "photos";
          if (mode === "cursor") result.requestCursor = "wrong-cursor";
          if (mode === "duplicate") result.reports[1] = result.reports[0];
          if (mode === "newer") { result.reports = fakeUpdateReports.slice(0, 50); result.nextReportCursor = result.reports.at(-1)!.id; }
          if (mode === "empty") { result.reports = []; result.nextReportCursor = null; }
          return route.fulfill({ status, contentType: "application/json", body: mode === "malformed" ? "{" : JSON.stringify(result) });
        }
        return route.continue();
      });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.name + ": " + error.message));
      await page.goto(`${base}/parent-portal?${extra}`, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
      await page.evaluate(zoom => document.documentElement.style.fontSize = zoom + "%", zoom);
      await page.locator("#daily-updates").waitFor();
      return { context, page, state };
    }
    const reportButton = (page: import("playwright").Page) => page.getByRole("button", { name: "Load more reports for this date", exact: true });
    const photoButton = (page: import("playwright").Page) => page.getByRole("button", { name: "Load more photos for this date", exact: true });
    const count = (page: import("playwright").Page, kind: string) => page.locator(`[data-update-id^="fake-${kind}-"]`).count();
    for (const width of [320, 390]) for (const zoom of [100, 200]) {
      const { context, page } = await open(undefined, width, zoom);
      assert.equal(await count(page, "report"), 50); assert.equal(await count(page, "photo"), 50);
      assert.equal(await page.getByLabel("Choose update day", { exact: true }).inputValue(), "2026-09-11");
      const summary = page.locator("[data-update-id]").first().locator("summary");
      assert.equal(await summary.locator("..").getAttribute("open"), null); await summary.press("Enter");
      await page.getByText("Fake pasta and fruit", { exact: false }).first().waitFor(); await summary.press("Space");
      assert.equal(await summary.locator("..").getAttribute("open"), null);
      const geometry = await page.locator("#daily-updates").evaluate(root => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), font: parseFloat(getComputedStyle(document.documentElement).fontSize),
        controls: [...root.querySelectorAll<HTMLElement>("input,button,a,summary")].filter(el => el.getClientRects().length).map(el => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width })),
      }));
      assert.equal(geometry.overflow, 0); assert.equal(geometry.font, 16 * zoom / 100); assert.ok(geometry.controls.every(item => item.height >= 44 && item.width >= 44));
      await page.locator("#daily-updates").scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `updates-${width}-${zoom}.png`) });
      results.push({ case: "layout", width, zoom, ...geometry, passed: true }); await context.close();
    }
    {
      const { context, page, state } = await open(); const before = requests.length;
      state.mode = "hold"; await reportButton(page).click(); await page.waitForFunction(() => document.querySelector('[role="status"]') !== null);
      await waitHeld(state);
      assert.equal(await page.getByRole("button", { name: "Loading reports…", exact: true }).getAttribute("aria-disabled"), "true");
      assert.equal(await photoButton(page).getAttribute("aria-disabled"), "true");
      await page.getByRole("button", { name: "Loading reports…", exact: true }).press("Enter"); await photoButton(page).press("Enter");
      assert.equal(requests.length, before + 1); state.mode = "ok"; state.release!();
      await page.getByText("50 more reports loaded for this date.", { exact: true }).waitFor(); assert.equal(await count(page, "report"), 100); assert.equal(await count(page, "photo"), 50);
      await reportButton(page).press("Enter"); await page.getByText("1 more report loaded for this date.", { exact: true }).waitFor();
      await page.waitForFunction(() => (document.activeElement as HTMLElement)?.dataset.updateId === "fake-report-000"); assert.equal(await count(page, "report"), 101);
      assert.equal(await reportButton(page).count(), 0);
      await photoButton(page).press("Enter"); await page.getByText("50 more photos loaded for this date.", { exact: true }).waitFor(); assert.equal(await count(page, "photo"), 100);
      await photoButton(page).press("Enter"); await page.getByText("1 more photo loaded for this date.", { exact: true }).waitFor(); assert.equal(await count(page, "photo"), 101);
      await page.waitForFunction(() => (document.activeElement as HTMLElement)?.dataset.updateId === "fake-photo-000"); assert.equal(await photoButton(page).count(), 0);
      assert.deepEqual(await page.locator('[data-update-id^="fake-report-"]').evaluateAll(rows => rows.map(row => row.getAttribute("data-update-id"))), fakeUpdateReports.map(row => row.id));
      results.push({ case: "101-both-streams-50-50-1-focus-and-duplicate-guard", passed: true }); await context.close();
    }
    for (const mode of ["401", "403", "503", "abort", "malformed", "family", "day", "zone", "kind", "cursor", "duplicate", "newer"]) {
      const { context, page, state } = await open(); state.mode = mode; const before = requests.length;
      await reportButton(page).click(); await page.getByText(/^More reports could not be loaded/).waitFor();
      assert.equal(await count(page, "report"), 50); assert.equal(await count(page, "photo"), 50);
      state.mode = "ok"; await reportButton(page).click(); await page.getByText("50 more reports loaded for this date.", { exact: true }).waitFor();
      assert.equal(requests[before], requests[before + 1]); results.push({ case: `retain-and-retry-${mode}`, passed: true }); await context.close();
    }
    for (const change of ["family", "day", "disabled"]) {
      const { context, page, state } = await open(); state.mode = "hold"; await reportButton(page).click();
      await waitHeld(state);
      const snapshot = fakeUpdatesPage({ familyId: fakeUpdateFamily, day: "2026-09-09", kind: "day", cursor: null });
      await page.evaluate(({ change, snapshot }) => window.dispatchEvent(new CustomEvent("fake-update-snapshot", { detail: change === "family" ? { familyId: "fake-new-family" } : change === "day" ? { page: snapshot } : { enabled: false } })), { change, snapshot });
      state.release!(); await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      assert.equal(await page.getByText("50 more reports loaded for this date.", { exact: true }).count(), 0);
      if (change === "family") assert.equal(await page.locator("[data-update-id]").count(), 0);
      if (change === "day") { assert.equal(await page.getByLabel("Choose update day", { exact: true }).inputValue(), "2026-09-09"); assert.equal(await page.locator("[data-update-id]").count(), 1); }
      results.push({ case: `stale-response-${change}`, passed: true }); await context.close();
    }
    {
      const { context, page } = await open("updateDay=2026-09-10");
      await page.getByText("No updates for this date", { exact: true }).waitFor(); assert.equal(await page.getByLabel("Choose update day", { exact: true }).inputValue(), "2026-09-10");
      assert.match((await page.getByRole("link", { name: "Earlier", exact: true }).getAttribute("href"))!, /updateDay=2026-09-09/);
      assert.match((await page.getByRole("link", { name: "Later", exact: true }).getAttribute("href"))!, /updateDay=2026-09-11/);
      await page.getByLabel("Choose update day", { exact: true }).fill(""); assert.equal(await page.getByRole("button", { name: "View date", exact: true }).isDisabled(), true);
      results.push({ case: "empty-explicit-date-and-clear", passed: true }); await context.close();
    }
    {
      const before = requests.length, { context, page } = await open("updateDay=2026-09-11&preview=1");
      assert.equal(await reportButton(page).count(), 0); assert.equal(await photoButton(page).count(), 0); assert.equal(requests.length, before);
      results.push({ case: "preview-zero-requests", passed: true }); await context.close();
    }
    {
      const { context, page, state } = await open(); state.mode = "empty";
      await reportButton(page).press("Enter"); await page.getByText("All shared reports for this date are loaded.", { exact: true }).waitFor();
      await page.waitForFunction(() => (document.activeElement as HTMLElement)?.dataset.updateId === "fake-report-051");
      assert.equal(await count(page, "report"), 50); assert.equal(await reportButton(page).count(), 0);
      results.push({ case: "empty-continuation-retains-content-and-focus", passed: true }); await context.close();
    }
    {
      const { context, page } = await open("updateDay=2026-09-11&photo=1");
      const photo = page.locator('[data-update-id="fake-photo-100"]'), img = photo.getByRole("img", { name: "Fake classroom photo 100", exact: true });
      await img.waitFor(); assert.equal(await img.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), true);
      const link = photo.getByRole("link", { name: /^Open full-size photo of/ });
      assert.equal(await link.getAttribute("href"), base + "/fake-photo.png?demo=1"); assert.equal(await link.getAttribute("rel"), "noreferrer");
      const popup = page.waitForEvent("popup"); await link.click(); const opened = await popup; await opened.waitForLoadState("load");
      assert.equal(opened.url(), base + "/fake-photo.png?demo=1"); await opened.close();
      results.push({ case: "synthetic-photo-render-alt-and-full-size-open", passed: true }); await context.close();
    }
    assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
    await writeFile(path.join(output, "results.json"), JSON.stringify({ engine, passed: true, completedAt: new Date().toISOString(), results, fakeGetRequests: requests.length, productWrites: 0, blocked, errors }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, cases: results.length, fakeGetRequests: requests.length, productWrites: 0 }));
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
