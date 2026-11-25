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
import { buildSchoolPaymentsReadView } from "../src/lib/school-payments-readonly";
import { schoolPaymentsFixture } from "./helpers/school-payments-fixtures";

test("native Payments stays inside BEE Suite and read-only while changing schools", { timeout: 120_000 }, async t => {
  const a = schoolPaymentsFixture(), b = schoolPaymentsFixture("school_b"), c = schoolPaymentsFixture("school_c");
  b.payouts[0].depositEvidence = { ...b.scope, payoutId: "payout_1", amountCents: 97000, currency: "usd", reference: "Synthetic deposit 81", source: "bank_posting", postingStatus: "posted", verified: true };
  a.payouts[0].depositEvidence = { ...a.scope, payoutId: "payout_1", amountCents: 97000, currency: "usd", reference: "Synthetic processor trace", source: "processor_trace", postingStatus: "posted", verified: true };
  b.historyBindings.push({ ...b.scope, accountId: "acct_prior_beta", bindingId: "synthetic_reviewed_history_beta", source: "authoritative_center_account_history", verified: true });
  b.availability.history = "partial";
  b.payouts.push({ ...b.payouts[0], id: "po_synthetic_prior_2209", accountId: "acct_prior_beta", ledger: null, depositEvidence: null, amountCents: 84000 });
  a.payments.push({ ...a.payments[0], id: "expired", reference: "Expired checkout A-105", collection: "not_collected", allocation: "not_allocated", checkout: "expired" });
  a.payments.push({ ...a.payments[0], id: "refresh", reference: "Collected A-106", display: "refresh_pending" });
  c.scope.schoolName = "Fixture School Gamma"; c.payments = []; c.balances = []; c.payouts = [];
  c.availability = { payments: "unavailable", balances: "unavailable", payouts: "unavailable", history: "unavailable" };
  const views = [a, b, c].map(buildSchoolPaymentsReadView);
  const bundle = await build({ entryPoints: ["tests/fixtures/school-payments-readonly.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"', FIXTURE_PAYMENTS_VIEWS: JSON.stringify(views) } });
  assert.equal(new TextDecoder().decode(bundle.outputFiles[0].contents).includes("acct_school_a"), false);
  assert.equal(new TextDecoder().decode(bundle.outputFiles[0].contents).includes("payout_1"), false);
  const from = resolve("src/app/globals.css");
  const css = (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic school Payments review</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`, output = join(tmpdir(), "bee-owner-payments-readonly-qa-20261123");
  await mkdir(output, { recursive: true });
  await withFixtureBrowser(server, () => chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined }), async browser => {
    for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) await t.test(`${viewport.width}: selection, balances, payout/deposit distinction and no writes`, async () => {
      const page = await browser.newPage({ viewport }); const unexpected: string[] = [], errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === base && request.method() === "GET" && ["/", "/fixture.js", "/fixture.css", "/favicon.ico"].includes(url.pathname)) return route.continue();
        unexpected.push(request.method() + " " + url.pathname); await route.abort();
      });
      await page.goto(base); await page.getByRole("heading", { name: "Fixture School Alpha", exact: true }).waitFor();
      await page.getByText("Invoice A-104", { exact: true }).waitFor();
      await page.getByText("Deposit not confirmed", { exact: true }).waitFor();
      await page.getByText("Bank posting: Unconfirmed (processor trace only)", { exact: true }).waitFor();
      await page.getByText("Available: $1,200.00", { exact: true }).waitFor();
      await page.getByText("No completed payment · Not allocated", { exact: true }).waitFor();
      await page.getByText("Checkout expired · Display current", { exact: true }).waitFor();
      await page.getByText("Checkout completed · Display refresh pending", { exact: true }).waitFor();
      assert.equal(await page.locator("button,a,iframe,form").count(), 0);
      await page.screenshot({ path: join(output, `payments-statuses-${viewport.width}.png`), fullPage: true });
      await page.getByLabel("School", { exact: true }).selectOption("school_b");
      await page.getByRole("heading", { name: "Fixture School Beta", exact: true }).waitFor();
      await page.getByText("Invoice B-208", { exact: true }).waitFor();
      assert.equal(await page.getByText("Invoice A-104", { exact: true }).count(), 0);
      await page.getByText("Deposit matched", { exact: true }).waitFor();
      await page.getByText("Bank posting: Posted", { exact: true }).waitFor();
      assert.equal(await page.getByText("Deposit not confirmed", { exact: true }).count(), 1, "Prior-account deposit remains unconfirmed despite the same payout date");
      await page.getByText("Payout …2209 · Prior account …beta", { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: join(output, `payments-${viewport.width}.png`), fullPage: true });
      await page.getByLabel("School", { exact: true }).selectOption("school_c");
      await page.getByText("Payment information is unavailable.", { exact: true }).waitFor();
      await page.getByText(/Missing evidence is not evidence of no payout/).waitFor();
      assert.equal(await page.getByText("No payouts in this view.", { exact: true }).count(), 0);
      await page.screenshot({ path: join(output, `payments-unavailable-${viewport.width}.png`), fullPage: true });
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      await page.close();
    });
  });
});
