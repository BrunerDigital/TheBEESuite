import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Actual components and CSS, synthetic props, no backend or provider access.
async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const output = path.resolve(`output/playwright/parent-payment-status-${engine}`);
  await mkdir(output, { recursive: true });
  const stylePath = path.resolve("src/app/globals.css");
  const style = await postcss([tailwindcss()]).process(await readFile(stylePath, "utf8"), { from: stylePath });
  const font = await readFile(path.resolve("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2"));
  const roleStyles = await Promise.all(["product-ui.css", "parent-mobile-home.css"].map(async file => {
    const from = path.resolve("src/app", file); return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  }));
  const css = style.css + roleStyles.join("\n") + "\n@font-face{font-family:FixtureGeist;src:url('/font.woff2')} :root{--font-geist-sans:FixtureGeist,Arial,sans-serif}";
  const bundle = await build({
    entryPoints: ["tests/fixtures/ui-flow-recovery.tsx"], outfile: "fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "mock-next-browser-boundary", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "mock-next" }));
      builder.onLoad({ filter: /.*/, namespace: "mock-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(),
        contents: args.path === "next/navigation"
          ? "const router={refresh(){window.__refreshes=(window.__refreshes||0)+1},push(){},replace(){},back(){}}; export const useRouter=()=>router; export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>location.pathname;"
          : "import React from 'react'; export default function Element({children,fill,priority,unoptimized,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
    } }],
  });
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles.find(f => f.path.endsWith(".js"))!.contents); return; }
    if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css + (bundle.outputFiles.find(f => f.path.endsWith(".css"))?.text ?? "")); return; }
    if (req.url === "/font.woff2") { res.setHeader("Content-Type", "font/woff2"); res.end(font); return; }
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div class="bee-app-frame" data-role="PARENT_GUARDIAN"><div id="root"></div></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const addr = server.address(); assert.ok(addr && typeof addr !== "string"); const base = `http://127.0.0.1:${addr.port}`;
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Array<Record<string, unknown>> = [], errors: string[] = [], blocked: string[] = [], writes: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
    let allowProductDenial = false;
    let paymentResponse: { status: number; body: unknown; deferred?: boolean } | null = null;
    let pendingPost: (() => Promise<void>) | null = null;
    let statusMode = "empty";
    let pendingStatus: (() => Promise<void>) | null = null;
    const observations: string[] = [], recoveryCases: string[] = [];
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (request.method() === "GET" && url.pathname === "/api/parent/payment-status") {
        observations.push(url.pathname);
        const target = { familyId: url.searchParams.get("familyId"), invoiceId: url.searchParams.get("invoiceId"), paymentId: url.searchParams.get("paymentId"), requestNonce: url.searchParams.get("requestNonce") };
        assert.ok(["exec-demo-family", "fake-second-family"].includes(target.familyId!));
        const phase = { phase: "confirmation_unknown", method: "card" };
        const active = ["active", "other-invoice", "family-active"].includes(statusMode);
        const body = { ...target, ok: true, version: 1, observedAt: new Date().toISOString(),
          accountPaymentBlocker: active ? { ...phase, count: statusMode === "other-invoice" ? 2 : 1, blocksInvoicePayments: statusMode === "family-active" } : null,
          invoicePayments: statusMode === "other-invoice" ? [{ invoiceId: "fake-product-other", payment: phase }] : [],
          outcome: statusMode === "settled" || statusMode === "family-active" ? "settled" : active ? "active" : target.paymentId ? "unresolved" : "unidentified" };
        if (statusMode === "wrong-nonce") body.requestNonce = "wrong";
        const fulfill = () => route.fulfill({ status: statusMode === "failure" ? 503 : 200, contentType: "application/json", body: JSON.stringify(body) });
        if (statusMode === "deferred") { pendingStatus = fulfill; return; }
        return fulfill();
      }
      if (request.method() === "POST" && ["/api/billing/family-payment", "/api/billing/checkout-session"].includes(url.pathname) && paymentResponse) {
        const reply = paymentResponse; paymentResponse = null;
        const body = request.postDataJSON();
        assert.equal(url.pathname === "/api/billing/family-payment" ? body.familyId : body.invoiceId, url.pathname === "/api/billing/family-payment" ? "exec-demo-family" : "fake-product-invoice");
        writes.push(url.pathname);
        const fulfill = () => route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
        if (reply.deferred) { pendingPost = fulfill; return; }
        return fulfill();
      }
      if (request.method() === "POST" && url.pathname === "/api/billing/checkout-session" && allowProductDenial) {
        allowProductDenial = false;
        const body = request.postDataJSON(); assert.equal(body.invoiceId, "fake-product-invoice");
        writes.push(url.pathname); return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Fake product denial" }) });
      }
      if (request.method() !== "GET" || url.pathname.startsWith("/api/")) { blocked.push(request.method() + " " + url.pathname); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))));
    const open = async (scenario: string, view = "payments") => {
      await page.goto(base + "/?view=" + view + "&payment-case=" + scenario, { waitUntil: "networkidle" });
      await page.locator('html[data-fixture-ready="true"]').waitFor(); await page.evaluate(() => document.fonts.ready); await settle();
    };
    for (const width of [320, 390]) for (const zoom of [100, 200]) {
      await page.setViewportSize({ width, height: 844 });
      for (const scenario of ["unknown", "hidden", "mixed", "family", "terminal", "terminal-unknown", "ach", "inactive", "settled", "manual"]) {
        await open(scenario); await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, zoom); await settle();
        const active = !["inactive", "settled", "manual"].includes(scenario), notice = page.locator("[data-parent-payment-status]");
        assert.equal(await notice.count(), active ? 1 : 0, scenario);
        if (active) {
          assert.equal(await page.getByRole("button", { name: "Debit or credit card", exact: true }).count(), 0);
          assert.equal(await page.getByLabel("Amount to pay", { exact: false }).count(), 0);
          const copy = await notice.innerText();
          assert.match(copy, scenario === "family" ? /New balance and invoice payments are paused/ : /New balance payments are paused/);
          if (scenario === "ach") assert.match(copy, /ACH payment processing/); else assert.doesNotMatch(copy, /Paid — processing|provisionally credited/);
          if (scenario === "hidden") assert.equal(await page.getByText("FAKE-PENDING", { exact: true }).count(), 0);
          const first = await page.locator("#billing [data-slot=card-content]").evaluate(el => el.firstElementChild?.hasAttribute("data-parent-payment-status"));
          assert.equal(first, true, "Payment status precedes secondary settings/history");
          const button = notice.getByRole("button", { name: "Refresh payment status", exact: true });
          const before = await page.evaluate(() => (window as unknown as { __refreshes?: number }).__refreshes ?? 0);
          await button.click(); await settle();
          assert.equal(await page.evaluate(() => (window as unknown as { __refreshes?: number }).__refreshes ?? 0), before + 1);
          assert.equal(await notice.count(), 1, "Refresh alone does not pretend payment settled");
          const geometry = await notice.evaluate(el => {
            const b = el.querySelector("button")!.getBoundingClientRect();
            return { height: el.getBoundingClientRect().height, buttonHeight: b.height, buttonWidth: b.width, buttonClass: el.querySelector("button")!.className, minHeight: getComputedStyle(el.querySelector("button")!).minHeight,
              overflow: Math.max(0, el.scrollWidth - el.clientWidth), pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) };
          });
          assert.ok(geometry.buttonHeight >= 44 && geometry.buttonWidth >= 44, JSON.stringify({ width, zoom, scenario, geometry }));
          assert.equal(geometry.overflow, 0); assert.equal(geometry.pageOverflow, 0, JSON.stringify({ width, zoom, scenario, geometry }));
          results.push({ width, zoom, scenario, ...geometry });
          if (["unknown", "ach", "family"].includes(scenario)) await notice.screenshot({ path: path.join(output, `${width}-${zoom}-${scenario}.png`) });
          if (["hidden", "mixed", "family"].includes(scenario)) {
            await page.getByText("Invoice history", { exact: true }).click();
            const product = page.getByRole("button", { name: "Pay invoice by card", exact: true });
            assert.equal(await product.isDisabled(), scenario === "family", "Only family-wide attempts block unrelated product invoices");
          }
          if (scenario === "family") {
            assert.equal(await page.getByRole("button", { name: "Buy with card", exact: true }).isDisabled(), true);
            assert.equal(await page.getByRole("button", { name: "Buy with Link", exact: true }).isDisabled(), true);
          }
          assert.equal(await page.getByRole("link", { name: /Billing settings/ }).count(), 1);
        } else {
          assert.equal(await page.getByRole("button", { name: "Debit or credit card", exact: true }).isDisabled(), false);
          results.push({ width, zoom, scenario, active: false });
        }
        assert.deepEqual(writes, []); assert.deepEqual(blocked, []);
      }
      await open("unknown", "home"); await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, zoom); await settle();
      const account = page.locator("#parent-home-account"); assert.match(await account.innerText(), /Payment confirmation pending/);
      const statusLink = account.getByRole("link", { name: "View payment status", exact: true }); assert.equal(await statusLink.count(), 1);
      const href = new URL((await statusLink.getAttribute("href"))!, base);
      assert.equal(href.searchParams.get("view"), "payments"); assert.equal(href.searchParams.get("familyId"), "exec-demo-family");
      assert.doesNotMatch(await account.innerText(), /Review & Pay/);
      results.push({ width, zoom, scenario: "home", passed: true });
      await open("ach", "home");
      assert.match(await page.locator("#parent-home-account").innerText(), /\$50\.00/);
      assert.match(await page.locator("#parent-home-account").innerText(), /ACH payment processing/);
      assert.equal(await page.getByText("Upcoming payment", { exact: true }).count(), 0);
      await open("credit"); assert.equal(await page.getByText("Account credit", { exact: true }).count(), 1);
      assert.match(await page.getByText("Account credit", { exact: true }).locator("..").innerText(), /\$25\.00/);
      assert.doesNotMatch(await page.getByText("Account credit", { exact: true }).locator("..").innerText(), /-\$|\$-/);
      await open("review"); assert.equal(await page.getByText("Being confirmed", { exact: true }).count(), 1);
    }
    await open("unknown");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-parent-payment-refresh", { detail: "settled" })));
    await page.locator("[data-parent-payment-status]").waitFor({ state: "detached" });
    assert.equal(await page.getByRole("button", { name: "Debit or credit card", exact: true }).isDisabled(), false);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-parent-payment-refresh", { detail: "unknown" })));
    await page.locator("[data-parent-payment-status]").waitFor();
    assert.equal(await page.getByRole("button", { name: "Debit or credit card", exact: true }).count(), 0);
    assert.deepEqual(writes, []); assert.deepEqual(blocked, []);
    await open("mixed"); allowProductDenial = true;
    await page.getByText("Invoice history", { exact: true }).click();
    await page.getByRole("button", { name: "Pay invoice by card", exact: true }).click();
    await page.getByText("Fake product denial", { exact: true }).waitFor();
    assert.deepEqual(writes, ["/api/billing/checkout-session"]); assert.deepEqual(blocked, []); assert.deepEqual(errors, []);

    const notice = () => page.locator("[data-parent-payment-status]");
    const refresh = async (mode: string) => {
      statusMode = mode; await notice().getByRole("button", { name: "Refresh payment status", exact: true }).click();
      await notice().getByRole("button", { name: "Refresh payment status", exact: true }).waitFor(); await settle();
    };
    for (const failure of [
      { name: "503-with-receipt", status: 503, body: { ok: false, paymentId: "fake-payment" } },
      { name: "409-conflict", status: 409, body: { ok: false, paymentId: "fake-payment" } },
      { name: "lost-response", status: 503, body: {} },
      { name: "contradictory-success", status: 200, body: { ok: false, url: "https://checkout.stripe.com/c/pay_fake" } },
      { name: "incomplete-success-receipt", status: 200, body: { ok: true, url: "https://invalid.example.test" } },
    ]) {
      await page.setViewportSize({ width: 320, height: 844 });
      await open("clear-products"); await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); await settle();
      const before: number = writes.length; paymentResponse = failure;
      const pay = page.getByRole("button", { name: "Debit or credit card", exact: true });
      await pay.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
      await notice().waitFor(); assert.equal(writes.length, before + 1, "Same-tick taps create only one fake request");
      assert.equal(await pay.count(), 0);
      await refresh("empty"); assert.match(await notice().innerText(), /Keep this attempt paused/);
      assert.equal(await pay.count(), 0, "Empty status does not release a lost attempt");
      await refresh("wrong-nonce"); assert.match(await notice().innerText(), /could not confirm/);
      await refresh("failure"); assert.match(await notice().innerText(), /could not confirm/);
      assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, failure.name);
      await page.getByText("Invoice history", { exact: true }).click();
      assert.ok((await page.getByRole("button", { name: "Pay invoice by card", exact: true }).all()).length === 3);
      for (const button of await page.getByRole("button", { name: "Pay invoice by card", exact: true }).all()) assert.equal(await button.isDisabled(), true);
      if ("paymentId" in failure.body) {
        await refresh("settled"); assert.match(await notice().innerText(), /Payment recorded/);
        assert.equal(await notice().getByRole("link", { name: "Review updated balance", exact: true }).count(), 1);
        assert.equal(await pay.count(), 0, "Recorded receipt never repeats the old amount automatically");
      }
      recoveryCases.push(failure.name);
    }
    await open("clear-products"); await page.getByText("Invoice history", { exact: true }).click();
    paymentResponse = { status: 503, body: { ok: false, paymentId: "fake-payment" } };
    await page.getByRole("button", { name: "Pay invoice by card", exact: true }).first().click(); await notice().waitFor();
    assert.equal(await page.getByRole("button", { name: "Debit or credit card", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Pay invoice by card", exact: true }).count(), 2, "Held exact invoice shows status, not another Pay action");
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).filter(button => button.textContent?.trim() === "Pay invoice by card").every(button => !button.disabled));
    for (const button of await page.getByRole("button", { name: "Pay invoice by card", exact: true }).all()) assert.equal(await button.isDisabled(), false);
    await refresh("other-invoice");
    assert.equal(await page.getByRole("button", { name: "Pay invoice by card", exact: true }).count(), 1, "New observed invoice B blocks B while C stays available");
    assert.equal(await page.getByRole("button", { name: "Pay invoice by card", exact: true }).isDisabled(), false);
    await refresh("family-active"); assert.doesNotMatch(await notice().innerText(), /Payment recorded/);
    for (const button of await page.getByRole("button", { name: "Pay invoice by card", exact: true }).all()) assert.equal(await button.isDisabled(), true);
    recoveryCases.push("exact-invoice-and-observed-family-scope");

    await open("clear-products"); paymentResponse = { status: 503, body: { ok: false, paymentId: "fake-payment" } };
    await page.getByRole("button", { name: "Debit or credit card", exact: true }).click(); await notice().waitFor();
    statusMode = "deferred"; await notice().getByRole("button", { name: "Refresh payment status", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-parent-payment-status] button')?.getAttribute("aria-busy") === "true");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-parent-payment-family", { detail: "fake-second-family" })));
    await notice().waitFor({ state: "detached" }); if (pendingStatus) { await (pendingStatus as () => Promise<void>)().catch(() => {}); pendingStatus = null; }
    await settle(); assert.equal(await notice().count(), 0, "Old family observation cannot leak into the new family");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-parent-payment-family", { detail: "exec-demo-family" })));
    await notice().waitFor(); assert.match(await notice().innerText(), /confirmation pending/i);
    recoveryCases.push("stale-family-observation");

    await open("clear-products"); paymentResponse = { status: 200, body: { ok: true, paymentId: "fake-payment", stripeSessionId: "cs_test_fake", url: "https://payments.example.test/c/pay/cs_test_fake" }, deferred: true };
    await page.getByRole("button", { name: "Debit or credit card", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-busy="true"]') !== null); await settle();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-parent-payment-family", { detail: "fake-second-family" })));
    assert.ok(pendingPost); await (pendingPost as unknown as () => Promise<void>)(); pendingPost = null; await settle();
    assert.equal(new URL(page.url()).origin, base, "Late response cannot redirect a different family to Checkout");
    assert.equal(await notice().count(), 0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-parent-payment-family", { detail: "exec-demo-family" })));
    await notice().waitFor(); recoveryCases.push("late-checkout-family-navigation");
    assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
    await writeFile(path.join(output, "results.json"), JSON.stringify({ engine, checkedAt: new Date().toISOString(), passed: true,
      results, recoveryCases, statusRefreshAndPropRecovery: true, blockedBalancePosts: 0, interceptedFakePosts: writes.length, interceptedReadOnlyObservations: observations.length, backendRequests: 0, errors }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, layoutCases: results.length, recoveryCases, interceptedFakePosts: writes.length, interceptedReadOnlyObservations: observations.length, backendRequests: 0 }));
    await context.close();
  } finally { await browser.close(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
