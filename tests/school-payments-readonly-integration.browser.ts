import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { withFixtureBrowser } from "../scripts/qa-fixture-browser";
import { readSchoolPaymentsPage } from "../src/lib/school-payments-readonly-page";
import { readSchoolPaymentsSnapshot, schoolPaymentsWindow } from "../src/lib/school-payments-readonly-adapter";
import { paymentsAuthority, paymentsDirector, paymentsLocalRow, paymentsProviderFixture } from "./helpers/school-payments-integration-fixtures";

test("selected-school GET navigation reauthorizes synthetic reads, preserves refund timing and reports partial coverage", { timeout: 120_000 }, async t => {
  const bundle = await build({ entryPoints: [resolve("tests/fixtures/school-payments-integration.tsx")], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic" });
  const css = (await postcss([tailwindcss()]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") })).css;
  const reads: string[] = [];
  const deps = { currentUser: async () => structuredClone(paymentsDirector), schools: async () => [{ id: "school_a", name: "Fixture School Alpha" }, { id: "school_b", name: "Fixture School Beta" }],
    loadAuthority: async (_u: unknown, id: string) => paymentsAuthority(id), read: async (a: ReturnType<typeof paymentsAuthority>) => {
      reads.push(a.scope.centerId); const f = paymentsProviderFixture(a.scope.centerId), row = paymentsLocalRow(`fixture_${a.scope.centerId}`, a.scope.centerId);
      row.paidAt = new Date("2026-10-01T00:00:00Z"); row.ledgerEntries.push({ id: "fixture_refund", type: "refund", amountCents: 3000, createdAt: new Date("2026-11-20T00:00:00Z") });
      const page = await f.providers.payouts(); page.hasMore = true;
      return readSchoolPaymentsSnapshot(a, schoolPaymentsWindow("2026-11-17", "2026-11-23"), { ...f.providers, local: async () => [row], payouts: async () => page });
    } };
  const server = createServer(async (request, response) => {
    if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url!, "http://127.0.0.1");
    if (url.pathname === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    if (url.pathname === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
    if (url.pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
    const r = await readSchoolPaymentsPage({ enabled: true, centerId: url.searchParams.get("center") || undefined }, deps);
    if (r.status !== "ready") { response.writeHead(403); response.end("School payment information unavailable"); return; }
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>const FIXTURE_PAYMENTS_PAGE=${JSON.stringify({ view: r.view, schools: r.schools }).replaceAll("<", "\\u003c")}</script><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`, output = join(tmpdir(), "bee-payments-integration-qa-20261123");
  await mkdir(output, { recursive: true });
  await withFixtureBrowser(server, () => chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined }), async browser => {
    for (const width of [1365, 390]) await t.test(`${width}: navigation, dates, coverage and forbidden school`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } }), unexpected: string[] = [], errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("**/*", route => {
        const r = route.request(), u = new URL(r.url());
        if (u.origin === base && r.method() === "GET" && ["/", "/fixture.js", "/fixture.css", "/favicon.ico"].includes(u.pathname)) return route.continue();
        unexpected.push(`${r.method()} ${u.pathname}`); return route.abort();
      });
      await page.goto(base); await page.getByRole("heading", { name: "Fixture School Alpha", exact: true }).waitFor();
      await page.getByText(/Not comparable: collection dates/).waitFor();
      await page.getByText(/Original collection: 2026-10-01. Ledger recorded: 2026-11-20/).waitFor();
      await page.getByText(/More processor pages are available/).waitFor();
      await page.getByText("Bank posting: Unconfirmed", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button").count(), 1); assert.equal(await page.locator("iframe,a").count(), 0);
      assert.equal(await page.locator("form").getAttribute("method"), "get");
      await page.screenshot({ path: join(output, `payments-integration-alpha-${width}.png`), fullPage: true });
      await page.getByLabel("School", { exact: true }).selectOption("school_b");
      await page.getByRole("button", { name: "View school", exact: true }).click();
      await page.waitForURL(/center=school_b/); await page.getByRole("heading", { name: "Fixture School Beta", exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Fixture School Alpha", exact: true }).count(), 0);
      assert.ok(reads.includes("school_b")); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: join(output, `payments-integration-beta-${width}.png`), fullPage: true });
      const count = reads.length, denied = await page.goto(`${base}/?center=foreign_school`); assert.equal(denied?.status(), 403); assert.equal(reads.length, count);
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); await page.close();
    });
  });
});
