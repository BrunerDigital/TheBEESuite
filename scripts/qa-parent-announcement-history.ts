import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, webkit } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";


async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const files = ["src/components/parent-portal-workspace.tsx", "src/components/use-parent-announcement-history.ts", "src/lib/parent-announcement-history.ts", "tests/fixtures/parent-announcement-history.tsx"];
  const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  const before = await hashes();
  const styles = await Promise.all(["globals", "product-ui", "parent-mobile-home"].map(async name => { const from = path.resolve(`src/app/${name}.css`); return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css; }));
  const font = await readFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2");
  const brand = new Map<string, Buffer>(await Promise.all(["mr-bee-profile.png", "favicon-dark.png"].map(async name => [`/brand/the-bee-suite/${name}`, await readFile(`public/brand/the-bee-suite/${name}`)] as const)));
  const bundle = await build({ entryPoints: ["tests/fixtures/parent-announcement-history.tsx"], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation" ? "const router={refresh(){},push(){},replace(){},back(){}};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);" : "import React from 'react';export default function Element({children,fill,priority,unoptimized,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
  } }] });
  const server = createServer((request, response) => {
    if (brand.has(request.url ?? "")) { response.setHeader("Content-Type", "image/png"); response.end(brand.get(request.url!)); return; }
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles.find(file => file.path.endsWith(".js"))!.contents); return; }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles.join("\n") + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "") + "\n@font-face{font-family:FixtureGeist;src:url('/fixture-font.woff2');font-weight:100 900} :root{--font-geist-sans:FixtureGeist,Arial,sans-serif;--font-geist-mono:monospace}"); return; }
    if (request.url === "/fixture-font.woff2") { response.end(font); return; }
    response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const output = path.resolve(`output/playwright/parent-announcement-history-${engine}-${new Date().toISOString().replace(/[:.]/g, "-")}`); await mkdir(output, { recursive: true });

  const results: object[] = [], unexpected: string[] = [], errors: string[] = [], requests: string[] = [];
  let mode = "success", release: (() => Promise<void>) | null = null;
  try {
    await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) { unexpected.push("off-origin"); return route.abort(); }
        if (url.pathname === "/api/parent/history/announcements" && request.method() === "GET") {
          const familyId = url.searchParams.get("familyId"), cursor = url.searchParams.get("cursor"); requests.push(url.search);
          assert.ok(["exec-demo-family", "fake-second-family"].includes(familyId!)); assert.ok([null, "notice-009", "notice-001"].includes(cursor));
          const start = cursor === null ? 16 : cursor === "notice-009" ? 8 : 0, count = start === 0 ? 1 : 8;
          const items = Array.from({ length: count }, (_, index) => ({ id: "notice-" + String(start - index).padStart(3, "0"), title: "Fake school notice " + (start - index), body: "Fake earlier notice.\nSchool information stays available to its own family.", sendAt: "2026-09-13T14:00:00.000Z" }));
          const body = { ok: mode !== "malformed", familyId: mode === "wrong-family" ? "foreign-family" : familyId, requestCursor: cursor, items: mode === "newer-row" ? [{ ...items[0], sendAt: "2026-09-14T14:00:00.000Z" }] : items, nextCursor: count === 8 ? items.at(-1)!.id : null };
          const status = mode === "failure" ? 503 : mode === "expired" ? 401 : 200;
          const fulfill = () => route.fulfill({ status, json: body });
          if (mode === "deferred") { release = fulfill; return; }
          return fulfill();
        }
        if (url.pathname.startsWith("/api/") || request.method() !== "GET") { unexpected.push(request.method() + " " + url.pathname); return route.abort(); }
        if (request.resourceType() === "document" || brand.has(url.pathname) || ["/fixture.js", "/fixture.css", "/fixture-font.woff2"].includes(url.pathname)) return route.continue();
        unexpected.push(url.pathname); return route.abort();
      });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      const open = async (width = 390, zoom = 100, query = "") => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await page.goto(base + "/parents" + query);
        await page.locator('html[data-fixture-ready="true"]').waitFor(); await page.evaluate(() => document.fonts.ready);
        await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, zoom); await settle();
      };
      const card = () => page.locator("#parent-home-announcements");
      const earlier = () => card().getByRole("button", { name: "Load earlier announcements", exact: true });
      const expand = async () => { await card().locator("[data-earlier-announcements] > summary").click(); };
      const focusClick = async () => { await earlier().focus(); await earlier().press("Enter"); };
      const finishDeferred = async () => { assert.ok(release); const complete = release; release = null; await complete().catch(() => {}); await settle(); };
      for (const width of [320, 390, 768, 1280]) for (const zoom of [100, 200]) {
        mode = "success"; await open(width, zoom);
        assert.equal(await card().locator("[data-earlier-announcements]").getAttribute("open"), null);
        assert.equal(await card().locator("[data-announcement-id]").count(), 8);
        if (width <= 390) await page.screenshot({ path: path.join(output, width + "-" + zoom + "-home-collapsed.png"), fullPage: true });
        await expand(); const bounds = await earlier().boundingBox(); assert.ok(bounds && bounds.height >= 44 && bounds.width >= 44);
        await focusClick(); await card().getByRole("status").filter({ hasText: "8 earlier announcements loaded." }).waitFor(); await settle();
        assert.equal(await card().locator("[data-announcement-id]").count(), 16);
        assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.announcementId), "notice-008");
        await focusClick(); await card().getByRole("status").filter({ hasText: "1 earlier announcement loaded." }).waitFor(); await settle();
        assert.equal(await card().locator("[data-announcement-id]").count(), 17); assert.equal(await earlier().count(), 0);
        assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.announcementId), "notice-000");
        const oldest = card().locator('[data-announcement-id="notice-000"]');
        assert.equal(await oldest.locator("details").getAttribute("open"), null);
        await oldest.locator("summary").click(); assert.match(await oldest.innerText(), /School information stays available/);
        const geometry = await card().evaluate(root => {
          const rect = root.getBoundingClientRect();
          const controls = [...root.querySelectorAll<HTMLElement>("button,summary")].filter(node => node.getBoundingClientRect().height > 0).map(node => { const box = node.getBoundingClientRect(); return { height: box.height, width: box.width, within: box.left >= rect.left && box.right <= rect.right }; });
          return { pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), cardOverflow: root.scrollWidth - root.clientWidth, controls };
        });
        assert.equal(geometry.pageOverflow, 0); assert.equal(geometry.cardOverflow, 0); assert.ok(geometry.controls.every(control => control.height >= 44 && control.width >= 44 && control.within));
        if (width <= 390) { await card().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, width + "-" + zoom + "-history.png"), fullPage: true }); }
        results.push({ width, zoom, geometry, notices: 17, finalPageFocus: "passed" });
      }
      for (const failure of ["failure", "expired", "malformed", "wrong-family", "newer-row"]) {
        mode = failure; await open(320, 200); await expand(); await focusClick();
        await card().getByRole("status").filter({ hasText: "Announcements could not be loaded." }).waitFor();
        assert.equal(await card().locator("[data-announcement-id]").count(), 8);
        const failedCursor = requests.at(-1); mode = "success"; await focusClick();
        await card().getByRole("status").filter({ hasText: "8 earlier announcements loaded." }).waitFor();
        assert.equal(requests.at(-1), failedCursor); assert.equal(await card().locator("[data-announcement-id]").count(), 16);
        results.push({ failure, noticesRetained: true, sameCursorRetry: true });
      }
      for (const event of ["fake-announcement-family", "fake-announcement-refresh"]) {
        mode = "deferred"; await open(); await expand(); await focusClick(); await page.waitForFunction(() => document.querySelector("#parent-home-announcements button")?.getAttribute("aria-busy") === "true");
        assert.ok(release); assert.ok(await card().getByRole("button", { name: "Loading earlier announcements…" }).isDisabled());
        await page.evaluate(event => window.dispatchEvent(new Event(event)), event); await settle(); await finishDeferred();
        assert.equal(await card().locator("[data-announcement-id]").count(), 8); assert.equal(await card().locator('[role="status"]').textContent(), "");
        results.push({ event, staleResponse: "ignored", duplicateSubmission: "locked" });
      }
      mode = "deferred"; await open(); await expand(); await focusClick();
      await card().locator("[data-earlier-announcements] > summary").focus();
      await finishDeferred(); await card().getByRole("status").filter({ hasText: "8 earlier announcements loaded." }).waitFor(); await settle();
      assert.equal(await card().locator("[data-earlier-announcements] > summary").evaluate(node => document.activeElement === node), true);
      results.push({ userMovedFocus: "not stolen" });
      mode = "failure"; await open(320, 200, "?unavailable"); assert.match(await card().innerText(), /temporarily unavailable/); assert.doesNotMatch(await card().innerText(), /No new announcements/);
      await card().getByRole("button", { name: "Retry announcements" }).click(); await card().getByRole("status").filter({ hasText: "Announcements could not be loaded." }).waitFor();
      mode = "success"; await card().getByRole("button", { name: "Retry announcements" }).focus(); await card().getByRole("button", { name: "Retry announcements" }).press("Enter");
      await card().getByRole("status").filter({ hasText: "8 announcements loaded." }).waitFor(); assert.equal(await card().locator("[data-announcement-id]").count(), 8);
      assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.announcementId), "notice-016");
      results.push({ initialFailure: "retry recovered without false empty state" });
      for (const variant of ["reviewer", "demo", "preview"]) {
        const beforeRequests = requests.length; await open(390, 100, "?" + variant); await expand();
        assert.equal(await earlier().count(), 0); assert.equal(requests.length, beforeRequests);
        results.push({ variant, historyRead: "disabled" });
      }
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(await hashes(), before);
      await writeFile(path.join(output, "results.json"), JSON.stringify({ engine, passed: true, cases: results.length, results, requests: requests.length, errors, unexpected, sourceHashes: before, writes: 0 }, null, 2));
      console.log(JSON.stringify({ engine, passed: true, cases: results.length, requests: requests.length, output, writes: 0 }));
    });
  } finally { server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
