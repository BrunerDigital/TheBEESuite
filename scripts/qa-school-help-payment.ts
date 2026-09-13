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
import { publicPaymentCases } from "../tests/fixtures/public-payment-form";
import { helpNavigationCardsFor } from "../src/lib/help-navigation";
import { readRenderedTextContrast } from "./qa-rendered-contrast";
import type { AxeResults } from "axe-core";

// Real components, fake local data, no API or provider traffic and no saving.
async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const sourceFiles = ["src/app/globals.css", "src/app/product-ui.css", "src/components/help-page.tsx", "src/components/payment-form-destination.tsx", "src/components/live-ops-pages.tsx", "src/components/payment-method-request-form.tsx", "src/components/parent-portal-workspace.tsx", "src/components/operations-action-hub.tsx", "src/lib/help-navigation.ts", "tests/fixtures/public-payment-form.ts", "tests/fixtures/ui-flow-recovery.tsx", "src/app/[slug]/page.tsx", "src/app/payment-method-form/[token]/page.tsx"];
  const fingerprint = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  sourceFiles.push("src/components/public-payment-page-shell.tsx");
  const sourceHashes = await fingerprint();
  const axeSource = await readFile("node_modules/axe-core/axe.min.js", "utf8");
  const output = path.resolve(`output/playwright/school-help-payment-${engine}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
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
  const roles = ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "TEACHER", "BILLING_ADMIN", "READ_ONLY_AUDITOR"];
  const cases = [
    ...Object.keys(publicPaymentCases).map(state => ({ view: "invoice-payment-link", state })),
    { view: "invalid-payment-link", state: "expired" },
    ...roles.map(state => ({ view: "help", state })),
    { view: "help-empty", state: "BILLING_ADMIN" },
    { view: "announcements", state: "CENTER_DIRECTOR" },
    { view: "payments", state: "demo" },
  ].flatMap(item => [320, 390].flatMap(width => [100, 200].map(zoom => ({ ...item, width, zoom }))));
  cases.push(...["invoice-payment-link", "help", "announcements"].flatMap(view => [768, 1440].flatMap(width => [100, 200].map(zoom => ({ view, state: view === "invoice-payment-link" ? "preserved" : "CENTER_DIRECTOR", width, zoom })))));
  let activeCase: unknown;
  try {
    await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
      for (const [index, candidate] of cases.entries()) {
        activeCase = candidate;
        const context = await browser.newContext({ viewport: { width: candidate.width, height: candidate.width === 320 ? 568 : candidate.width === 390 ? 844 : 1000 }, serviceWorkers: "block", reducedMotion: "reduce" });
        await context.route("**/*", route => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== base || url.pathname.startsWith("/api/")) { blocked.push(request.method() + " " + url.pathname); return route.abort(); }
          return route.continue();
        });
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        const query = new URLSearchParams({ view: candidate.view === "help-empty" ? "help" : candidate.view });
        if (candidate.view === "invoice-payment-link") query.set("public-payment-case", candidate.state);
        if (candidate.view.startsWith("help") || candidate.view === "announcements") query.set("help-role", candidate.state);
        if (candidate.view === "help-empty") query.set("help-empty", "");
        if (candidate.view === "payments") { query.set("app-review-billing", ""); query.set("invoice-date", "2026-09-14"); }
        const href = base + "/fixture?" + query;
        await page.goto(href); await page.locator("html[data-fixture-ready=true]").waitFor(); await page.evaluate(() => document.fonts.ready);
        await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, candidate.zoom);
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, "Whole-page overflow");
        let selector = ".school-help-page a";
        let contrast: unknown = null, refreshed = false, heldCheckout = false;
        const actionContrast: unknown[] = [];
        if (candidate.view === "invoice-payment-link") {
          const state = publicPaymentCases[candidate.state];
          selector = ".public-payment-page button, .public-payment-page a";
          assert.equal(await page.locator("main").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(9, 11, 16)");
          const pending = page.getByText("Bank verification is pending", { exact: true });
          assert.equal(await pending.count(), state.bankVerificationPending ? 1 : 0);
          assert.equal(await page.getByText("Bank verification requested", { exact: true }).count(), state.focus === "instant-bank" && !state.bankVerificationPending ? 1 : 0);
          const setup = page.locator(".public-payment-grid").first().getByRole("button");
          assert.equal(await setup.count(), 2);
          for (const control of await setup.all()) assert.equal(await control.isDisabled(), !!state.bankVerificationPending);
          const labels = await setup.allTextContents();
          assert.match(labels[0], state.focus === "instant-bank" ? /bank account/ : /card/);
          if (!state.bankVerificationPending) {
            await setup.first().focus(); await page.keyboard.press("Tab");
            assert.equal(await setup.nth(1).evaluate(el => el === document.activeElement), true, "DOM keyboard order matches visual action order");
            const boxes = await setup.evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().top));
            assert.ok(boxes[0] <= boxes[1] + 1, "Visual action order");
          }
          assert.equal(await page.getByText("Optional: pay tuition today", { exact: true }).count(), state.reauthorization ? 0 : 1);
          contrast = await page.evaluate(readRenderedTextContrast, '.public-payment-form [data-slot="card-header"] [data-slot="badge"]');
          const measured = contrast as { supported: boolean; ratio?: number; required?: number };
          assert.ok(measured.supported && measured.ratio! >= measured.required!, "Autopay badge contrast: " + JSON.stringify(contrast));
          for (const [buttonIndex, control] of (await page.locator('.public-payment-form [data-slot="button"]:not(:disabled)').all()).entries()) {
            await control.evaluate((el, id) => el.setAttribute("data-contrast-probe", String(id)), buttonIndex);
            for (const hover of [false, true]) {
              if (hover) await control.hover();
              const measurement = await page.evaluate(readRenderedTextContrast, `[data-contrast-probe="${buttonIndex}"]`);
              assert.ok(measurement.supported && measurement.ratio >= measurement.required, "Action contrast: " + JSON.stringify({ label: await control.innerText(), hover, ...measurement }));
              actionContrast.push(measurement);
            }
          }
        } else if (candidate.view === "invalid-payment-link") {
          selector = ".public-payment-page a";
          await page.getByRole("heading", { level: 1, name: "Payment setup link unavailable", exact: true }).waitFor();
          assert.equal(await page.locator('[data-slot="alert"] > svg').evaluate(el => el.getBoundingClientRect().width), 20);
        } else if (candidate.view.startsWith("help")) {
          const shortcuts = page.getByRole("navigation", { name: "Help shortcuts", exact: true });
          assert.deepEqual(await shortcuts.locator("a").evaluateAll(nodes => nodes.map(node => node.getAttribute("href"))), helpNavigationCardsFor(candidate.state).map(link => link.href));
          assert.equal(await page.getByRole("link", { name: "Manage school announcements", exact: true }).count(), ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"].includes(candidate.state) ? 1 : 0);
          assert.equal(await page.locator(".school-help-page table").count(), 0, "Help is readable without horizontally scrolling tables");
          if (candidate.view === "help-empty") await page.getByText("No active alerts are assigned to your account.", { exact: true }).waitFor();
        } else if (candidate.view === "announcements") {
          const school = page.getByRole("combobox", { name: "School", exact: true });
          await school.scrollIntoViewIfNeeded(); assert.match(await school.innerText(), /Fake School A/);
          await school.click(); await page.getByRole("option", { name: "Fake School B", exact: true }).click();
          assert.match(await school.innerText(), /Fake School B/);
          // Selection only. Do not save or send.
          selector = '.operations-action-hub :is(button, input, textarea)';
        } else {
          await page.getByText("Demo billing preview", { exact: true }).waitFor();
          assert.equal(await page.getByText("Online Payments Are Temporarily Unavailable", { exact: true }).count(), 0);
          selector = "";
        }
        const metrics = selector ? await page.locator(selector).evaluateAll(nodes => nodes.filter(node => (node as HTMLElement).offsetHeight > 0 && !node.closest('[aria-hidden="true"]') && node.getAttribute("type") !== "hidden").map(node => {
          const el = node as HTMLElement, rect = el.getBoundingClientRect(); let left = 0, right = innerWidth;
          for (let parent = el.parentElement; parent; parent = parent.parentElement) if (["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(parent).overflowX)) { const box = parent.getBoundingClientRect(); left = Math.max(left, box.left); right = Math.min(right, box.right); }
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let text: Node | null; let clippedText = false;
          while ((text = walker.nextNode())) {
            if (!text.textContent?.trim() || text.parentElement?.closest(".sr-only")) continue;
            const range = document.createRange(); range.selectNodeContents(text);
            if ([...range.getClientRects()].some(box => box.left < Math.max(left, rect.left) - 2 || box.right > Math.min(right, rect.right) + 2 || box.top < rect.top - 2 || box.bottom > rect.bottom + 2)) clippedText = true;
          }
          return { text: el.textContent?.trim(), width: rect.width, height: rect.height, left: rect.left, right: rect.right, clipLeft: left, clipRight: right, clippedText };
        })) : [];
        if (selector) assert.ok(metrics.length);
        for (const metric of metrics) assert.ok(metric.width >= 43.5 && metric.height >= 43.5 && metric.left >= metric.clipLeft - 2 && metric.right <= metric.clipRight + 2 && !metric.clippedText, JSON.stringify(metric));
        if (candidate.view === "invoice-payment-link") {
          const clips = await page.locator('.public-payment-form [data-slot="badge"], .public-payment-form [data-slot="alert"]').evaluateAll(nodes => nodes.map(el => ({ text: el.textContent?.slice(0, 60), client: el.clientWidth, scroll: el.scrollWidth })));
          assert.ok(clips.every(item => item.scroll <= item.client + 1), JSON.stringify(clips));
          if (publicPaymentCases[candidate.state].bankVerificationPending) {
            await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.getByRole("button", { name: "Check status", exact: true }).click()]);
            await page.locator("html[data-fixture-ready=true]").waitFor();
            assert.equal(page.url(), href, "Refresh retains exact fake link");
            await page.getByText("Bank verification is pending", { exact: true }).waitFor();
            await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, candidate.zoom);
            refreshed = true;
            // Hold one exact fake Checkout in browser memory; no network request is made.
            await page.evaluate(() => {
              type FakeWindow = Window & { finishFakeCheckout?: () => void };
              window.fetch = (input, init) => {
                const body = JSON.parse(String(init?.body));
                if (input !== "/api/billing/payment-method-request/checkout" || init?.method !== "POST" || body.token !== "fake-local-token-not-a-credential" || body.invoiceId !== "invoice-a" || body.paymentMethodCategory !== "card") throw new Error("Unexpected fake checkout input");
                document.documentElement.dataset.fakeCheckoutStarted = "true";
                return new Promise<Response>(resolve => { (window as FakeWindow).finishFakeCheckout = () => resolve(new Response(JSON.stringify({ error: "Fake checkout held for testing; nothing was sent." }), { status: 409, headers: { "Content-Type": "application/json" } })); });
              };
            });
            if (!publicPaymentCases[candidate.state].reauthorization) {
              await page.getByRole("button", { name: /^(Card|Debit or credit card)$/ }).click();
              await page.waitForFunction(() => document.documentElement.dataset.fakeCheckoutStarted === "true");
              await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent === "Check status")?.disabled);
              assert.equal(await page.getByRole("button", { name: "Check status", exact: true }).isDisabled(), true);
              await page.evaluate(() => (window as Window & { finishFakeCheckout?: () => void }).finishFakeCheckout?.());
              await page.getByText("Fake checkout held for testing; nothing was sent.", { exact: true }).waitFor();
              heldCheckout = true;
            }
          }
        }
        let accessibilityRules = 0;
        if (candidate.zoom === 100 && candidate.width === 390 && ["normal", "pending", "expired", "BILLING_ADMIN", "CENTER_DIRECTOR"].includes(candidate.state)) {
          await page.addScriptTag({ content: axeSource });
          const accessibility = await page.evaluate(async () => (window as unknown as { axe: { run: (context: Element, options: object) => Promise<AxeResults> } }).axe.run(document.querySelector("main") ?? document.body, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
          assert.deepEqual(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact ?? "")).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), []);
          accessibilityRules = accessibility.passes.length;
        }
        await page.screenshot({ path: path.join(output, index + "-" + candidate.view + "-" + candidate.state + "-" + candidate.width + "-" + candidate.zoom + ".png"), fullPage: true });
        results.push({ ...candidate, controls: metrics.length, contrast, actionContrast, refreshed, heldCheckout, accessibilityRules, passed: true });
        await context.close();
      }
      assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
    });
    assert.deepEqual(await fingerprint(), sourceHashes, "Sources changed while checking");
    await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: true, engine, sourceHashes, results, blocked, errors, completedAt: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ passed: true, cases: results.length, controls: results.reduce((sum, item) => sum + (item as { controls: number }).controls, 0), output }));
  } catch (error) {
    await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: false, activeCase, results, blocked, errors, failure: String(error) }, null, 2)); throw error;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
