import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, type Page, type Route } from "playwright";
import { withFixtureBrowser } from "../scripts/qa-fixture-browser";

type PaymentKind = "cash" | "check";
type FixtureRequest = {
  mode: "manualCashPayment" | "manualCheckPayment" | "offlinePaymentReceipt";
  familyId: string;
  requestId: string;
  amountCents?: number;
};

function receipt(request: FixtureRequest, kind: PaymentKind) {
  return {
    ok: true, totalCents: request.amountCents,
    payment: {
      id: "fixture-recorded-payment", billingAccountId: `account-${request.familyId}`,
      amountCents: request.amountCents, status: "PAID", provider: `manual_${kind}`,
      customFields: { requestId: request.requestId, familyId: request.familyId },
    },
    entry: {
      id: "fixture-receipt-entry", billingAccountId: `account-${request.familyId}`,
      paymentId: "fixture-recorded-payment", amountCents: -request.amountCents!,
    },
  };
}

async function savedOperation(page: Page, familyId = "alpha") {
  return page.evaluate(familyId => {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index)!;
      if (!key.startsWith("bee-suite:offline-payment-operation:")) continue;
      const operation = JSON.parse(sessionStorage.getItem(key)!);
      if (operation.userId === "fixture-director" && operation.familyId === familyId) return operation as { requestId: string };
    }
    return null;
  }, familyId);
}

async function fillPayment(page: Page, kind: PaymentKind) {
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  await page.getByRole("tab", { name: `${kind === "cash" ? "Cash" : "Check"} payment`, exact: true }).click();
  await page.locator(`#billing-${kind}-amount`).fill("12.34");
  await page.locator(`#billing-${kind}-reference`).fill("FIXTURE-123");
  await page.locator(`#billing-${kind}-notes`).fill("Fictional interrupted-payment QA");
  await page.locator(`#billing-${kind}-received-date`).fill("2026-10-30T10:30");
}

function postButton(page: Page, kind: PaymentKind) {
  return page.getByRole("button", { name: `Post ${kind === "cash" ? "Cash" : "Check"} Payment`, exact: true });
}

async function openRecovery(page: Page) {
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  const summary = page.getByText("Recover an interrupted cash or check payment", { exact: true });
  if (await summary.locator("..").getAttribute("open") === null) await summary.click();
}

async function selectFamily(page: Page, name: string) {
  const picker = page.locator("#billing-family-picker");
  if (await picker.getAttribute("open") === null) await picker.locator("summary").first().click();
  await page.locator("#billing-workbench-family").click();
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  await page.getByRole("region", { name: "Selected billing account" }).getByText(name, { exact: true }).waitFor();
}

// Browser-only CI gate. Every API request is intercepted; no signed-in browser or real payment provider is used.
test("offline cash/check submission and interrupted receipt recovery", { timeout: 120_000 }, async t => {
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
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><title>Fictional offline payment QA</title><style>body{font:16px sans-serif;margin:24px}button,input,textarea{margin:4px;padding:8px}svg{width:16px;height:16px}section{margin:16px 0}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  await withFixtureBrowser(server, () => chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL }), async browser => {
    async function run(
      handleApi: (payload: FixtureRequest, route: Route) => Promise<void>,
      check: (page: Page, requests: FixtureRequest[]) => Promise<void>,
      options: { interruptedResponses?: number; storageUnavailable?: boolean } = {},
    ) {
      const page = await browser.newPage();
      page.setDefaultTimeout(10_000);
      const requests: FixtureRequest[] = [], errors: string[] = [], unexpected: string[] = [], failedRequests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() === "error" && !(options.interruptedResponses && /Failed to load resource: net::ERR_FAILED/.test(message.text()))) errors.push(message.text());
      });
      page.on("requestfailed", request => failedRequests.push(request.url()));
      await page.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === base && request.method() === "GET" && !url.pathname.startsWith("/api/")) return route.continue();
        if (url.origin === base && url.pathname === "/api/billing/invoices" && request.method() === "POST") {
          try {
            const payload = request.postDataJSON() as FixtureRequest;
            assert.ok(["manualCashPayment", "manualCheckPayment", "offlinePaymentReceipt"].includes(payload.mode));
            assert.ok(["alpha", "beta"].includes(payload.familyId));
            assert.equal(typeof payload.requestId, "string");
            requests.push(payload);
            await handleApi(payload, route);
            return;
          } catch (error) { errors.push(String(error)); }
        }
        unexpected.push(`${request.method()} ${request.url()}`);
        await route.abort();
      });
      await page.addInitScript(({ storageUnavailable }) => {
        window.confirm = () => true;
        if (storageUnavailable) Storage.prototype.setItem = () => { throw new DOMException("Fixture storage unavailable", "SecurityError"); };
      }, options);
      try {
        await page.goto(`${base}/billing-invoices`);
        await page.getByRole("region", { name: "Selected billing account" }).getByText("Fixture Alpha Family", { exact: true }).waitFor();
        await check(page, requests);
        assert.deepEqual(unexpected, [], "only explicitly mocked local API requests are allowed");
        assert.deepEqual(errors, [], "no unexpected client/runtime or mock errors");
        assert.equal(failedRequests.length, options.interruptedResponses ?? 0, "only the deliberately interrupted response may fail");
      } finally { await page.close(); }
    }

    for (const kind of ["cash", "check"] as const) {
      await t.test(`${kind}: rapid repeated clicks create one request and confirmed receipt clears the draft`, async () => {
        let releaseResponse!: () => void;
        const responseReady = new Promise<void>(resolve => { releaseResponse = resolve; });
        let observeRequest!: () => void;
        const requestReceived = new Promise<void>(resolve => { observeRequest = resolve; });
        await run(async (payload, route) => {
          observeRequest();
          await responseReady;
          await route.fulfill({ json: receipt(payload, kind) });
        }, async (page, requests) => {
          try {
            await fillPayment(page, kind);
            await postButton(page, kind).evaluate(button => {
              if (!(button instanceof HTMLButtonElement)) throw new Error("Expected a payment button");
              button.click(); button.click();
            });
            await requestReceived;
            assert.equal(await postButton(page, kind).isDisabled(), true);
            assert.equal(requests.length, 1);
            assert.equal(requests[0].mode, kind === "cash" ? "manualCashPayment" : "manualCheckPayment");
            assert.equal((await savedOperation(page))?.requestId, requests[0].requestId);
            if (kind === "check") assert.equal(await page.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
            releaseResponse();
            await page.getByText(`$12.34 ${kind} payment posted. The family balance was updated.`, { exact: true }).waitFor();
            for (const field of ["amount", "reference", "notes"]) assert.equal(await page.locator(`#billing-${kind}-${field}`).inputValue(), "");
            assert.equal(await savedOperation(page), null);
            assert.equal(requests.length, 1);
          } finally { releaseResponse(); }
        });
      });

      await t.test(`${kind}: reload recovers the interrupted receipt without posting a second payment`, async () => {
        let recorded: ReturnType<typeof receipt>;
        await run(async (payload, route) => {
          if (payload.mode === "offlinePaymentReceipt") {
            assert.equal(payload.requestId, recorded.payment.customFields.requestId);
            await route.fulfill({ json: { ok: true, found: true, receipt: recorded } });
          } else {
            recorded = receipt(payload, kind);
            await route.abort("failed");
          }
        }, async (page, requests) => {
          await fillPayment(page, kind);
          await postButton(page, kind).click();
          await page.getByText("The billing request was interrupted. Review the current account and Stripe activity, if applicable, before trying the action again.", { exact: true }).waitFor();
          assert.equal(await page.locator(`#billing-${kind}-amount`).inputValue(), "12.34");
          const operation = await savedOperation(page); assert.ok(operation);
          await page.reload();
          await openRecovery(page);
          assert.equal((await savedOperation(page))?.requestId, operation.requestId);
          await page.getByRole("button", { name: "Review unresolved payment", exact: true }).click();
          await page.getByText(`Recorded ${kind} payment: $12.34. Receipt fixture-recorded-payment. No additional payment was posted.`, { exact: true }).waitFor();
          assert.equal((await savedOperation(page))?.requestId, operation.requestId, "review must preserve the marker until explicit acknowledgement");
          assert.equal(requests.filter(request => request.mode !== "offlinePaymentReceipt").length, 1);
          assert.equal(requests.filter(request => request.mode === "offlinePaymentReceipt").length, 1);
          await page.getByRole("button", { name: "I reviewed this receipt; start a new payment", exact: true }).click();
          await page.getByText("Existing receipt reviewed. A separate payment can now be entered; no new payment was posted.", { exact: true }).waitFor();
          assert.equal(await savedOperation(page), null);
          assert.equal(requests.length, 2, "acknowledging a receipt must not submit another payment");
        }, { interruptedResponses: 1 });
      });

      await t.test(`${kind}: a mismatched receipt retains the draft and request identity for a safe retry`, () => run(async (payload, route) => {
        const result = receipt(payload, kind);
        result.payment.customFields.familyId = "beta";
        await route.fulfill({ json: result });
      }, async (page, requests) => {
        await fillPayment(page, kind);
        await postButton(page, kind).click();
        const warning = page.getByText("The payment receipt could not be confirmed. Keep this page open and retry the same payment to check its result safely.", { exact: true });
        await warning.waitFor();
        assert.equal(await page.locator(`#billing-${kind}-amount`).inputValue(), "12.34");
        assert.equal(await page.locator(`#billing-${kind}-notes`).inputValue(), "Fictional interrupted-payment QA");
        const operation = await savedOperation(page); assert.ok(operation);
        const retried = page.waitForResponse(response => response.request().method() === "POST");
        await postButton(page, kind).click();
        await retried;
        await page.waitForFunction(label => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.replace(/\s+/g, " ").trim() === label && !button.disabled), `Post ${kind === "cash" ? "Cash" : "Check"} Payment`);
        assert.equal(requests.length, 2);
        assert.equal(requests[1].requestId, operation.requestId);
        assert.equal((await savedOperation(page))?.requestId, operation.requestId);
      }));

      await t.test(`${kind}: unavailable recovery storage blocks submission`, () => run(async () => {
        assert.fail("a payment must never reach the API when its recovery identity cannot be stored");
      }, async (page, requests) => {
        await fillPayment(page, kind);
        await postButton(page, kind).click();
        await page.getByText("Payment recovery is unavailable. Review the existing payment before recording another payment.", { exact: true }).waitFor();
        assert.equal(requests.length, 0);
        assert.equal(await page.locator(`#billing-${kind}-amount`).inputValue(), "12.34");
      }, { storageUnavailable: true }));

      await t.test(`${kind}: recovery stays with its family after switching accounts`, async () => {
        let recorded: ReturnType<typeof receipt>;
        await run(async (payload, route) => {
          assert.equal(payload.familyId, "alpha", "the other family must never use Alpha's saved operation");
          if (payload.mode === "offlinePaymentReceipt") await route.fulfill({ json: { ok: true, found: true, receipt: recorded } });
          else {
            recorded = receipt(payload, kind);
            await route.fulfill({ json: { ok: true, totalCents: 1234 } });
          }
        }, async (page, requests) => {
          await fillPayment(page, kind);
          await postButton(page, kind).click();
          await page.getByText("The payment receipt could not be confirmed. Keep this page open and retry the same payment to check its result safely.", { exact: true }).waitFor();
          const operation = await savedOperation(page); assert.ok(operation);
          await selectFamily(page, "Fixture Beta Family");
          await openRecovery(page);
          await page.getByRole("button", { name: "Review unresolved payment", exact: true }).click();
          await page.getByText("This browser tab has no unresolved payment marker for this family. Check payment history for earlier receipts.", { exact: true }).waitFor();
          assert.equal(requests.length, 1, "a family without a marker must not issue a receipt lookup");
          assert.equal(await savedOperation(page, "beta"), null);
          assert.equal((await savedOperation(page))?.requestId, operation.requestId);
          await selectFamily(page, "Fixture Alpha Family");
          await openRecovery(page);
          await page.getByRole("button", { name: "Review unresolved payment", exact: true }).click();
          await page.getByText(`Recorded ${kind} payment: $12.34. Receipt fixture-recorded-payment. No additional payment was posted.`, { exact: true }).waitFor();
          assert.equal(requests.length, 2);
          assert.equal(requests[1].mode, "offlinePaymentReceipt");
          assert.equal(requests[1].requestId, operation.requestId);
        });
      });
    }

    await t.test("Cancel clears a check draft while preserving its unresolved payment identity", () => run(async (_payload, route) => {
      await route.fulfill({ json: { ok: true, totalCents: 1234 } });
    }, async (page, requests) => {
      await fillPayment(page, "check");
      await postButton(page, "check").click();
      await page.getByText("The payment receipt could not be confirmed. Keep this page open and retry the same payment to check its result safely.", { exact: true }).waitFor();
      const operation = await savedOperation(page); assert.ok(operation);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("tabpanel", { name: "Overview", exact: true }).waitFor();
      assert.equal((await savedOperation(page))?.requestId, operation.requestId);
      await page.getByRole("tab", { name: "Payments", exact: true }).click();
      await page.getByRole("tab", { name: "Check payment", exact: true }).click();
      for (const field of ["amount", "reference", "notes"]) assert.equal(await page.locator(`#billing-check-${field}`).inputValue(), "");
      assert.equal(requests.length, 1, "Cancel must not submit or retry a payment");
    }));
  });
});
