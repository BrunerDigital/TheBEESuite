import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, webkit, type Page } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

// Real office components and AppShell, exclusively fake props and local assets.
async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const sourceFiles = ["src/app/globals.css", "src/app/product-ui.css", "src/components/app-shell.tsx", "src/components/billing-workbench.tsx", "src/components/family-ledger-card.tsx", "src/components/director-payment-terminal-workspace.tsx", "src/components/workspace-section-directory.tsx", "src/lib/focused-portal-control.ts", "tests/fixtures/ui-flow-recovery.tsx"];
  const fingerprint = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  const sourceHashes = await fingerprint();
  const output = path.resolve(`output/playwright/office-billing-mobile-${engine}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(output, { recursive: true });
  const styles = await Promise.all(["globals", "product-ui"].map(async name => {
    const from = path.resolve(`src/app/${name}.css`);
    return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  }));
  const font = await readFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2");
  const localImages = new Map<string, Buffer>(await Promise.all(["favicon-dark.png", "app-icon-dark.png", "mr-bee-profile.png"].map(async name => [`/brand/the-bee-suite/${name}`, await readFile(`public/brand/the-bee-suite/${name}`)] as const)));
  const bundle = await build({ entryPoints: ["tests/fixtures/ui-flow-recovery.tsx"], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next-boundary", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "mock-next" }));
      builder.onLoad({ filter: /.*/, namespace: "mock-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
        ? "const router={refresh(){},push(){},replace(){},back(){}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;"
        : "import React from 'react';export default function Element({children,fill,priority,unoptimized,prefetch,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
    } }],
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://fixture.invalid");
    if (url.pathname === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles.find(file => file.path.endsWith(".js"))!.contents); return; }
    if (url.pathname === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles.join("\n") + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "") + "\n@font-face{font-family:FixtureGeist;src:url('/fixture-font.woff2');font-weight:100 900}:root{--font-geist-sans:FixtureGeist,Arial,sans-serif;--font-geist-mono:monospace}"); return; }
    if (url.pathname === "/fixture-font.woff2") { response.setHeader("Content-Type", "font/woff2"); response.end(font); return; }
    const localImage = localImages.get(url.pathname);
    if (localImage) { response.setHeader("Content-Type", "image/png"); response.end(localImage); return; }
    response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const results: object[] = [], blocked: string[] = [], errors: string[] = [];
  let activeCase = "setup";
  const settle = (page: Page) => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  async function verifyControls(page: Page, selector: string, touchTargets = true) {
    const metrics = await page.locator(selector).evaluateAll(nodes => nodes.filter(node => (node as HTMLElement).offsetHeight > 0).map(node => {
      const el = node as HTMLElement, rect = el.getBoundingClientRect();
      let left = 0, right = innerWidth;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(parent).overflowX)) {
          const box = parent.getBoundingClientRect(); left = Math.max(left, box.left); right = Math.min(right, box.right);
        }
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let text: Node | null; const clippedText: string[] = [];
      while ((text = walker.nextNode())) {
        if (!text.textContent?.trim() || text.parentElement?.closest(".sr-only")) continue;
        const range = document.createRange(); range.selectNodeContents(text);
        if ([...range.getClientRects()].some(box => box.left < Math.max(left, rect.left) - 2 || box.right > Math.min(right, rect.right) + 2 || box.top < rect.top - 2 || box.bottom > rect.bottom + 2)) clippedText.push(text.textContent);
      }
      return { id: el.id, text: el.textContent?.trim(), width: rect.width, height: rect.height, left: rect.left, right: rect.right, clipLeft: left, clipRight: right, clippedText };
    }));
    assert.ok(metrics.length, `Expected visible controls in ${activeCase}: ${selector}`);
    for (const metric of metrics) {
      if (touchTargets) assert.ok(metric.height >= 43.5 && metric.width >= 43.5, `Small target: ${JSON.stringify(metric)}`);
      assert.ok(metric.left >= metric.clipLeft - 2 && metric.right <= metric.clipRight + 2 && metric.clippedText.length === 0, `Clipped control: ${JSON.stringify(metric)}`);
    }
    return metrics.length;
  }
  try {
    await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
      for (const longNames of [false, true]) for (const view of ["billing", "terminal", "ledger"]) for (const width of (longNames ? [320, 1440] : [320, 390, 768, 1280, 1440])) for (const zoom of [100, 200]) {
        activeCase = `${view}-${width}-${zoom}-${longNames ? "long" : "normal"}`;
        const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : width === 390 ? 844 : 1000 }, serviceWorkers: "block", reducedMotion: "reduce" });
        await context.route("**/*", route => { const request = route.request(), url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== base || url.pathname.startsWith("/api/")) { blocked.push(request.method() + " " + url.pathname); return route.abort(); }
          return route.continue();
        });
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base}/billing-invoices?view=${view}&family=a&office-shell&selectors${longNames ? "&office-long-names&office-refund-example" : ""}`);
        await page.locator("html[data-fixture-ready=true]").waitFor(); await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => [...document.images].every(image => image.complete));
        assert.deepEqual(await page.evaluate(() => [...document.images].filter(image => image.naturalWidth === 0).map(image => new URL(image.src).pathname)), [], "Fixture branding loaded");
        await page.evaluate(zoom => document.documentElement.style.fontSize = zoom + "%", zoom); await settle(page);
        assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, "Whole page overflow");
        let controls = 0;
        const panelChecks: string[] = [];
        if (view === "billing") {
          const tabs = page.locator("#billing-action-tabs"); await tabs.scrollIntoViewIfNeeded();
          assert.equal(await tabs.getByRole("tab").count(), 5);
          controls += await verifyControls(page, "#billing-action-tabs [role=tab], #billing-workbench .workspace-section-directory a, #billing-workbench-family");
          await verifyControls(page, "#billing-family-overview h2, #billing-family-overview .billing-summary-grid > div", false);
          await verifyControls(page, '#billing-workbench [data-slot="badge"]', false);
          const first = tabs.getByRole("tab").first(); await first.focus(); await first.press("ArrowRight");
          const next = tabs.getByRole("tab", { name: "Family charge", exact: true });
          assert.equal(await next.evaluate(el => el === document.activeElement), true, "Arrow key moves tab focus");
          await next.press("Enter"); await settle(page); assert.equal(await next.getAttribute("aria-selected"), "true");
          await page.getByRole("button", { name: "More billing tasks", exact: true }).click();
          assert.equal(await tabs.getByRole("tab").count(), 11); controls += await verifyControls(page, "#billing-action-tabs [role=tab]");
          for (const tab of await tabs.getByRole("tab").all()) {
            const name = (await tab.innerText()).trim();
            await tab.click(); await settle(page);
            assert.equal(await tab.getAttribute("aria-selected"), "true", name);
            if (name === "Refund" && !longNames) {
              await page.getByText("No refundable online payments", { exact: true }).waitFor();
              assert.equal(await page.getByRole("button", { name: "Request Refund Approval", exact: true }).count(), 0);
            } else {
              await page.locator('#billing-workbench [role="tabpanel"] [data-slot="button"]').first().waitFor({ state: "visible" });
              controls += await verifyControls(page, '#billing-workbench [role="tabpanel"] :is(button, [data-slot="input"], [data-slot="textarea"], [data-slot="select-trigger"], label:has(input[type="checkbox"]))');
            }
            await verifyControls(page, '#billing-workbench [data-slot="badge"]', false);
            assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, `Overflow in ${name}`);
            panelChecks.push(name);
          }
          await tabs.getByRole("tab", { name: "Edit invoice", exact: true }).click();
          await page.getByRole("button", { name: "More billing tasks", exact: true }).click();
          assert.equal(await tabs.getByRole("tab", { name: "Edit invoice", exact: true }).getAttribute("aria-selected"), "true");
          assert.equal(await tabs.getByRole("tab").count(), 6);
          await tabs.scrollIntoViewIfNeeded();
        } else if (view === "terminal") {
          controls += await verifyControls(page, ".director-payment-terminal-workspace [data-slot=select-trigger], .director-payment-terminal-workspace [data-slot=button]");
          const family = page.getByRole("combobox", { name: "Current family", exact: true }); await family.focus(); await family.press("Enter");
          await page.getByRole("option").nth(1).press("Enter"); await settle(page);
          assert.match(await family.innerText(), /Fake Family B/);
          const target = page.getByRole("combobox", { name: "Apply payment to", exact: true }); await target.focus(); await target.press("Enter");
          await page.getByRole("option", { name: "Custom family account payment", exact: true }).press("Enter");
          await page.getByLabel("Account payment amount", { exact: true }).fill("125.00"); await settle(page);
          assert.ok((await page.locator(".terminal-review-value").allTextContents()).includes("$125.00"));
          controls += await verifyControls(page, ".director-payment-terminal-workspace [data-slot=select-trigger], .director-payment-terminal-workspace [data-slot=button]");
          await page.locator("#terminal-family").scrollIntoViewIfNeeded();
        } else {
          await page.locator("#family-ledger-start-date").fill("2026-09-01");
          await page.locator("#family-ledger-end-date").fill("2026-09-13");
          controls += await verifyControls(page, '#family-ledger [data-slot=select-trigger], #family-ledger button, #family-ledger input[type="date"]');
          for (const id of ["family-ledger-start-date", "family-ledger-end-date"]) {
            const date = page.locator(`#${id}`);
            assert.match(await date.inputValue(), /^2026-09-(01|13)$/);
            assert.equal(await date.evaluate(el => getComputedStyle(el).paddingInline), "10px");
          }
          await page.locator("#family-ledger-start-date").scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, activeCase + "-filled-dates.png") });
          await page.getByRole("button", { name: "Charge / credit summary", exact: true }).scrollIntoViewIfNeeded();
        }
        assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, "Post-interaction page overflow");
        await page.screenshot({ path: path.join(output, activeCase + ".png") });
        const focusChecks: object[] = [];
        if (width <= 390) {
          await page.locator(view === "ledger" ? "#family-ledger-family" : view === "terminal" ? "#terminal-family" : "#billing-invoice-editor").focus();
          for (let step = 0; step < (view === "ledger" ? 8 : view === "terminal" ? 6 : 12); step++) {
            await page.keyboard.press("Tab"); await page.waitForTimeout(350); await settle(page);
            const focused = await page.evaluate(() => {
              const el = document.activeElement as HTMLElement | null;
              if (!el?.matches("a, button, input, textarea, select, summary, [role=combobox]") || !el.closest(".office-billing-workspace, .director-payment-terminal-workspace") || el.getAttribute("aria-expanded") === "true") return null;
              const frame = el.closest(".bee-app-frame")!, header = frame.querySelector<HTMLElement>(".app-header"), nav = frame.querySelector<HTMLElement>(".app-bottom-navigation");
              const top = header && ["sticky", "fixed"].includes(getComputedStyle(header).position) ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
              const navRect = nav?.getBoundingClientRect(), bottom = navRect && navRect.height > 0 ? Math.min(innerHeight, navRect.top) : innerHeight;
              const rect = el.getBoundingClientRect();
              return { id: el.id, tag: el.tagName, top: rect.top, bottom: rect.bottom, shellTop: top, shellBottom: bottom };
            });
            if (focused) {
              assert.ok(focused.top >= focused.shellTop + 11 && focused.bottom <= focused.shellBottom - 11, `Focused control obscured: ${JSON.stringify(focused)}`);
              focusChecks.push(focused);
            }
          }
          assert.ok(focusChecks.length >= (view === "terminal" ? 2 : 4), "Keyboard reached the actual office form controls");
          await page.screenshot({ path: path.join(output, activeCase + "-keyboard.png") });
        }
        results.push({ view, viewportWidth: width, zoom, longNames, actualShell: true, controls, panelChecks, focusChecks, passed: true });
        await context.close();
      }
      assert.deepEqual(blocked, []); assert.deepEqual(errors, []); assert.equal(results.length, 42);
    });
    assert.deepEqual(await fingerprint(), sourceHashes, "Fixture sources changed during verification");
    await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: true, sourceHashes, results, blocked, errors, completedAt: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ passed: true, cases: results.length, output, blocked, errors }));
  } catch (error) {
    await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: false, activeCase, results, blocked, errors, failure: String(error) }, null, 2));
    throw error;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
