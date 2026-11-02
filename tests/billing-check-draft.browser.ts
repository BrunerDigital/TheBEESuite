import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";
import { withFixtureBrowser } from "../scripts/qa-fixture-browser";

// Browser-only CI gate: real components, fictional data, no production session or API.
test("check-payment draft cancellation and billing context isolation", { timeout: 120_000 }, async t => {
  const fixture = await build({
    entryPoints: ["tests/fixtures/billing-check-draft.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "fixture-next", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fixture-next" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
        ? "export const useRouter=()=>({refresh(){},push(){},replace(){}});export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;"
        : "import React from 'react';export default function Element({children,fill,priority,unoptimized,prefetch,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
    } }],
  });
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(fixture.outputFiles[0].contents); }
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><title>Billing draft fixture</title><style>body{font:16px sans-serif;margin:24px}button,input,textarea{margin:4px;padding:8px}svg{width:16px;height:16px}section{margin:16px 0}[data-slot="dialog-overlay"]{position:fixed;inset:0;z-index:50;background:#0003}[data-slot="dialog-content"]{position:fixed;z-index:51;top:50%;left:50%;transform:translate(-50%,-50%);width:min(85vw,800px);max-height:85vh;overflow:auto;background:white;border:1px solid;padding:20px}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  await withFixtureBrowser(server, () => chromium.launch({ headless: true }), async browser => {
    async function run(check: (page: Page) => Promise<void>) {
      const page = await browser.newPage();
      page.setDefaultTimeout(10_000);
      const unexpectedRequests: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("**/*", async route => {
        const request = route.request();
        if (new URL(request.url()).origin === base && request.method() === "GET" && !new URL(request.url()).pathname.startsWith("/api/")) return route.continue();
        unexpectedRequests.push(`${request.method()} ${request.url()}`);
        await route.abort();
      });
      await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.fixturePrint = "requested"; }; });
      try {
        await page.goto(`${base}/billing-invoices`);
        await page.getByRole("region", { name: "Selected billing account" }).getByText("Fixture Alpha Family", { exact: true }).waitFor();
        await check(page);
        assert.deepEqual(unexpectedRequests, [], "draft/document checks must never call an API or external service");
        assert.deepEqual(errors, [], "no client runtime errors");
      } finally { await page.close(); }
    }
    async function openCheck(page: Page) {
      await page.getByRole("tab", { name: "Payments", exact: true }).click();
      await page.getByRole("tab", { name: "Check payment", exact: true }).click();
      await page.locator("#billing-check-notes").waitFor();
    }
    async function fillDraft(page: Page) {
      await openCheck(page);
      await page.locator("#billing-check-amount").fill("12.34");
      await page.locator("#billing-check-reference").fill("QA-DRAFT");
      await page.locator("#billing-check-notes").fill("Unsaved fixture note");
      await page.locator("#billing-check-received-date").fill("2026-10-30T10:30");
    }
    async function assertEmptyDraft(page: Page) {
      await openCheck(page);
      for (const field of ["amount", "reference", "notes"]) assert.equal(await page.locator(`#billing-check-${field}`).inputValue(), "");
      assert.equal(await page.getByRole("button", { name: "Post Check Payment", exact: true }).isDisabled(), true);
    }
    async function selectContext(page: Page, kind: "family" | "school", name: string) {
      const picker = page.locator("#billing-family-picker");
      if (await picker.getAttribute("open") === null) await picker.locator("summary").first().click();
      await page.locator(`#billing-workbench-${kind}`).click();
      await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
    }

    await t.test("same-family navigation retains input until explicit Cancel clears only the check draft", () => run(async page => {
      await openCheck(page);
      const initialDate = await page.locator("#billing-check-received-date").inputValue();
      await fillDraft(page);
      await page.getByRole("tab", { name: "Overview", exact: true }).click();
      await openCheck(page);
      assert.equal(await page.locator("#billing-check-notes").inputValue(), "Unsaved fixture note");
      if (process.env.BEE_BILLING_QA_SCREENSHOT) await page.getByRole("tabpanel", { name: "Check payment", exact: true }).screenshot({ path: process.env.BEE_BILLING_QA_SCREENSHOT });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("tabpanel", { name: "Overview", exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("familyId"), "alpha");
      assert.match(await page.getByRole("region", { name: "Selected billing account" }).innerText(), /\$10\.00/);
      await assertEmptyDraft(page);
      assert.equal(await page.locator("#billing-check-received-date").inputValue(), initialDate);
      const dialogs: string[] = [];
      page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
      await selectContext(page, "family", "Fixture Beta Family");
      await page.getByRole("region", { name: "Selected billing account" }).getByText("Fixture Beta Family", { exact: true }).waitFor();
      assert.deepEqual(dialogs, [], "cleared draft must not trigger a stale discard warning");
    }));

    for (const kind of ["family", "school"] as const) for (const accept of [false, true]) {
      await t.test(`${accept ? "accepting" : "canceling"} a ${kind} change preserves the discard guard`, () => run(async page => {
        await fillDraft(page);
        let message = "";
        page.once("dialog", async dialog => { message = dialog.message(); if (accept) await dialog.accept(); else await dialog.dismiss(); });
        const nextFamily = kind === "family" ? "Fixture Beta Family" : "Fixture Gamma Family";
        await selectContext(page, kind, kind === "family" ? nextFamily : "Fixture School Two");
        assert.match(message, /unsaved input.*Discard.*selected school, family, or child/);
        if (accept) {
          await page.getByRole("region", { name: "Selected billing account" }).getByText(nextFamily, { exact: true }).waitFor();
          await assertEmptyDraft(page);
          assert.equal(new URL(page.url()).searchParams.get("centerId"), kind === "family" ? "school-one" : "school-two");
        } else {
          assert.match(await page.getByRole("region", { name: "Selected billing account" }).innerText(), /Fixture Alpha Family/);
          assert.equal(await page.locator("#billing-check-amount").inputValue(), "12.34");
          assert.equal(await page.locator("#billing-check-reference").inputValue(), "QA-DRAFT");
          assert.equal(await page.locator("#billing-check-notes").inputValue(), "Unsaved fixture note");
          assert.equal(await page.locator("#billing-check-received-date").inputValue(), "2026-10-30T10:30");
        }
      }));
    }

    await t.test("statements close and reopen with the selected family's loaded history", () => run(async page => {
      await page.getByRole("tab", { name: "Ledger & Statements", exact: true }).click();
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.getByRole("button", { name: "Preview customer statement", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Statement preview", exact: true });
        await dialog.getByText("Family: Fixture Alpha Family", { exact: true }).waitFor();
        assert.match(await dialog.innerText(), /Fixture School One/);
        await dialog.getByRole("button", { name: "Close preview", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
      }
      await selectContext(page, "family", "Fixture Beta Family");
      await page.getByRole("region", { name: "Selected billing account" }).getByText("Fixture Beta Family", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Preview customer statement", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Statement preview", exact: true });
      await dialog.getByText("Family: Fixture Beta Family", { exact: true }).waitFor();
      assert.doesNotMatch(await dialog.innerText(), /Fixture Alpha Family|Loaded tuition for alpha/);
      assert.match(await dialog.innerText(), /Loaded tuition for beta/);
      await dialog.getByRole("button", { name: "Close preview", exact: true }).click();
    }));

    await t.test("existing director receipt preview reopens and invoice rendering uses a mocked print action", () => run(async page => {
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.getByRole("button", { name: "Open fixture receipt", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByText("Fixture Alpha Family", { exact: true }).waitFor();
        assert.match(await dialog.innerText(), /FIXTURE-INV-1/);
        assert.match(await dialog.innerText(), /Fixture School One/);
        await dialog.getByRole("button", { name: "Close preview", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
      }
      await page.getByRole("button", { name: "Open fixture invoice", exact: true }).click();
      const invoice = page.getByRole("region", { name: "Printable invoice FIXTURE-INV-1", exact: true });
      await invoice.waitFor();
      assert.match(await invoice.innerText(), /Fixture Alpha Family/);
      assert.match(await invoice.innerText(), /Fixture School One/);
      await page.waitForFunction(() => document.documentElement.dataset.fixturePrint === "requested");
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await invoice.waitFor({ state: "hidden" });
    }));
  });
});
