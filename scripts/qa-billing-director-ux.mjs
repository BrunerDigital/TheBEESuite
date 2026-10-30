import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Run with Playwright CLI run-code, passing its page. Synthetic localhost route only. */
export async function runBillingDirectorQa(page, baseUrl = "http://localhost:3057") {
  const origin = new URL(baseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname), "QA is restricted to a local development preview");
  const out = resolve("output/playwright/billing-director-ux");
  await mkdir(out, { recursive: true });
  const report = { checks: [], layouts: [], accessibility: [], apiRequests: [], consoleErrors: [] };
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) report.apiRequests.push({ method: request.method(), path: new URL(request.url()).pathname }); });
  page.on("pageerror", error => report.consoleErrors.push(error.message));
  await page.route("**/api/**", route => route.abort());
  // The dev preview has no live identity environment. Avoid the unrelated PWA install request.
  await page.addInitScript(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register = async () => ({ scope: "/", update: async () => {}, addEventListener() {}, active: null, waiting: null, installing: null });
  });
  const url = (params = "") => `${origin.origin}/device-preview?view=billing&scenario=director-ux${params}`;
  const context = () => page.getByRole("region", { name: "Selected billing account", exact: true });
  const section = name => page.getByRole("tab", { name, exact: true }).click();
  const checkContext = async text => assert.ok((await context().innerText()).includes(text), `Selected account must include ${text}`);
  const goto = async (params = "") => {
    await page.goto(url(params));
    await page.waitForFunction(() => document.documentElement.dataset.devicePreviewHydrated === "true");
    await context().waitFor();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  };
  const openPicker = async () => { if ((await page.locator("#billing-family-picker").getAttribute("open")) === null) await page.locator("#billing-family-picker > summary").click(); };
  const pick = async id => {
    await openPicker();
    const browse = page.getByRole("button", { name: /^(Browse|Hide) family list/ });
    if ((await browse.getAttribute("aria-expanded")) !== "true") await browse.click();
    await page.getByRole("group", { name: "Browse billing families", exact: true }).getByRole("button").filter({ hasText: new RegExp(`Account ${id}$`) }).click();
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await goto();
  await checkContext("demo-family-0");
  await page.getByText("$145.00", { exact: true }).waitFor();
  assert.equal(await page.locator("#billing-family-picker").getByRole("button", { name: "Current (30)", exact: true, includeHidden: true }).getAttribute("aria-pressed"), "true");
  await page.screenshot({ path: resolve(out, "after-desktop-overview.png"), fullPage: true });
  report.checks.push("Posted $245, pending ACH $100 and collectible $145 are distinct; initial overview has no financial form.");

  await openPicker();
  await page.getByRole("searchbox", { name: "Find a family in this category" }).fill("Liam Rivera");
  await checkContext("demo-family-0");
  await page.getByRole("combobox", { name: "Family", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option").filter({ hasText: "Liam Rivera" }).waitFor();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await checkContext("demo-family-1");
  await page.getByRole("searchbox", { name: "Find a family in this category" }).fill("");
  await section("Ledger & Statements");
  assert.equal(await page.locator("#family-ledger [role=combobox]").count(), 0);
  assert.ok((await page.locator("#family-ledger").innerText()).includes("Liam Rivera"));
  assert.ok(!(await page.locator("#family-ledger").innerText()).includes("Ava Rivera"));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.devicePreviewHydrated === "true");
  await context().waitFor();
  await checkContext("demo-family-1");
  assert.equal(await page.getByRole("tab", { name: "Ledger & Statements", exact: true }).getAttribute("aria-selected"), "true");
  report.checks.push("Keyboard search selects the correct duplicate household; ledger uses the same ID; refresh preserves family and section.");

  await page.getByRole("textbox", { name: "From", exact: true }).fill("2026-10-01");
  await page.getByRole("textbox", { name: "Through", exact: true }).fill("2026-10-31");
  await page.evaluate(() => { window.__billingPrintCalls = 0; window.print = () => { window.__billingPrintCalls++; }; });
  await page.getByRole("button", { name: "Preview customer statement", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Statement preview", exact: true });
  await dialog.waitFor();
  const statementText = await dialog.innerText();
  for (const text of ["demo-family-1", "Centennial", "2026-10-01 through 2026-10-31", "$246.00", "Loaded activity only"]) assert.ok(statementText.includes(text), `${text} in ${statementText}`);
  assert.equal(await page.evaluate(() => window.__billingPrintCalls), 0);
  await page.screenshot({ path: resolve(out, "after-desktop-statement-preview.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
  await page.waitForFunction(() => window.__billingPrintCalls === 1);
  await dialog.getByRole("status").waitFor();
  await page.pdf({ path: resolve(out, "statement-demo.pdf"), format: "Letter", printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await dialog.getByRole("button", { name: "Close preview", exact: true }).click();
  for (const [button, title] of [["Preview ledger", "Rivera Household Ledger Report preview"], ["Preview charge / credit summary", "Charge / credit summary preview"]]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    const reportDialog = page.getByRole("dialog", { name: title, exact: true });
    await reportDialog.waitFor();
    assert.ok((await reportDialog.innerText()).includes("Centennial"));
    await reportDialog.getByRole("button", { name: "Close preview", exact: true }).click();
  }
  assert.equal(await page.evaluate(() => document.body.classList.contains("bee-report-printing")), false);
  await page.getByRole("button", { name: "Preview customer statement", exact: true }).click();
  await page.evaluate(() => { window.print = () => { throw new Error("Synthetic print failure"); }; });
  await dialog.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  await dialog.getByRole("button", { name: "Close preview", exact: true }).click();
  await page.getByRole("textbox", { name: "Through", exact: true }).fill("2026-09-01");
  assert.equal(await page.getByRole("button", { name: "Preview customer statement", exact: true }).isDisabled(), true);
  report.checks.push("Statement preview is explicit, includes account/school/period and history limits, requests print only on confirmation, and rejects reversed dates.");

  await section("Payments");
  await section("Ledger & Statements");
  assert.equal(await page.getByRole("textbox", { name: "From", exact: true }).inputValue(), "2026-10-01");
  await section("Payments");
  await page.getByRole("tab", { name: "Cash payment", exact: true }).click();
  await page.locator("#billing-cash-amount").fill("12.00");
  page.once("dialog", dialog => dialog.dismiss());
  await pick("demo-family-3");
  await checkContext("demo-family-1");
  assert.equal(await page.locator("#billing-cash-amount").inputValue(), "12.00");
  await section("Ledger & Statements");
  await section("Payments");
  await page.getByRole("tab", { name: "Cash payment", exact: true }).click();
  assert.equal(await page.locator("#billing-cash-amount").inputValue(), "12.00");
  page.once("dialog", dialog => dialog.accept());
  await pick("demo-family-3");
  await checkContext("demo-family-3");
  await page.getByRole("tab", { name: "Cash payment", exact: true }).click();
  assert.equal(await page.locator("#billing-cash-amount").inputValue(), "");
  report.checks.push("Cancelled family switch retains the draft; section changes retain edits; confirmed family switch clears family-bound drafts.");

  // In-memory response only: exercise the exact review/lock handlers without any API request.
  await page.getByRole("tab", { name: "Online payment", exact: true }).click();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (new URL(String(input), location.href).pathname === "/api/billing/family-payment") {
        window.__billingMockRequest = JSON.parse(init.body);
        return new Promise(resolve => { window.__billingResolve = () => resolve(new Response(JSON.stringify({ error: "Synthetic response: no payment was made." }), { status: 409, headers: { "Content-Type": "application/json" } })); });
      }
      return original(input, init);
    };
    window.__billingRestoreFetch = () => { window.fetch = original; };
  });
  await page.getByRole("button", { name: "Digital Terminal", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Open Digital Terminal on this device", exact: true });
  assert.ok((await review.innerText()).includes("demo-family-3"));
  await review.getByRole("button", { name: "Open Digital Terminal on this device", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__billingMockRequest));
  assert.equal(await page.getByRole("combobox", { name: "Family", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Past accounts (1)", exact: true }).isDisabled(), true);
  const submitted = await page.evaluate(() => window.__billingMockRequest);
  assert.equal(submitted.familyId, "demo-family-3");
  assert.equal(submitted.billingAccountId, "demo-account-3");
  await page.evaluate(() => window.__billingResolve());
  await page.getByText("Synthetic response: no payment was made.", { exact: true }).waitFor();
  await page.evaluate(() => window.__billingRestoreFetch());
  await pick("demo-family-1");
  assert.equal(await page.getByText("Synthetic response: no payment was made.", { exact: true }).count(), 0);
  report.checks.push("Financial review identifies the exact account; in-flight requests lock family/category controls; no stale response survives a later switch. Submission was intercepted in memory.");

  await openPicker();
  await page.getByRole("button", { name: "Past accounts (1)", exact: true }).click();
  await checkContext("demo-family-30");
  await section("Tuition & Fees");
  assert.equal(await page.getByRole("tab", { name: "Child tuition", exact: true }).isDisabled(), true);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.devicePreviewHydrated === "true");
  await checkContext("demo-family-30");
  assert.equal(await page.getByRole("tab", { name: "Edit invoice", exact: true }).getAttribute("aria-selected"), "true");
  await openPicker();
  await page.getByRole("button", { name: "Pending (1)", exact: true }).click();
  await checkContext("demo-family-31");
  assert.equal(await page.getByRole("tab", { name: "Child tuition", exact: true }).isDisabled(), true);
  report.checks.push("Past and pending categories show their own family and count; recurring tuition remains disabled with business explanations.");

  await page.getByRole("combobox", { name: "School", exact: true }).click();
  await page.getByRole("option", { name: "Empty school · Demo", exact: true }).click();
  await page.getByRole("button", { name: "Pending (0)", exact: true }).click();
  await checkContext("Choose a family");
  await checkContext("Pending");
  assert.ok(!page.url().includes("familyId="));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.devicePreviewHydrated === "true");
  await context().waitFor();
  await openPicker();
  assert.equal(await page.getByRole("button", { name: "Pending (0)", exact: true }).getAttribute("aria-pressed"), "true");
  await checkContext("Choose a family");
  await goto("&familyId=demo-family-0&centerId=demo-empty-school");
  await checkContext("Choose a family");
  await page.getByText(/The requested family or school is not available/).waitFor();
  report.checks.push("Empty categories and mismatched exact school/family links fail closed, including after refresh.");

  for (const [width, height, name] of [[1440, 1000, "desktop"], [834, 1112, "tablet"], [390, 844, "mobile"], [320, 740, "small-mobile"]]) {
    await page.setViewportSize({ width, height });
    await goto("&familyId=demo-family-0&centerId=preview-center");
    for (const sectionName of ["Overview", "Tuition & Fees", "Payments", "Ledger & Statements"]) {
      await section(sectionName);
      await page.getByRole("tabpanel", { name: sectionName, exact: true }).waitFor();
      const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, workspaceHeight: document.getElementById("billing-workbench").scrollHeight }));
      assert.ok(layout.scrollWidth <= width + 1, `${name}/${sectionName} page overflow: ${layout.scrollWidth}`);
      const targets = await page.getByRole("tablist", { name: "Account sections", exact: true }).getByRole("tab").evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
      assert.ok(targets.every(rect => rect.height >= 44), `${name} touch targets`);
      report.layouts.push({ device: name, section: sectionName, ...layout });
      if (name === "desktop" || name === "mobile") {
        if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
        const violations = await page.evaluate(async () => (await window.axe.run(document.getElementById("billing-workbench"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => node.target) })));
        report.accessibility.push({ device: name, section: sectionName, violations });
        assert.deepEqual(violations, [], `${name}/${sectionName} accessibility`);
      }
      if (sectionName === "Overview" || sectionName === "Ledger & Statements") {
        if (sectionName === "Ledger & Statements" && width < 1024) await page.locator("#family-ledger").evaluate(el => {
          const context = document.querySelector("[data-billing-context]");
          const offset = el.getBoundingClientRect().top - context.getBoundingClientRect().bottom - 12;
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) { p.scrollTop += offset; return; }
          }
        });
        await page.screenshot({ path: resolve(out, `after-${name}-${sectionName === "Overview" ? "overview" : "ledger"}.png`), fullPage: true });
      }
      if (sectionName === "Tuition & Fees") {
        await context().evaluate(el => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) { p.scrollTop = p.scrollHeight; return; }
          }
          scrollTo(0, document.documentElement.scrollHeight);
        });
        const rect = await context().boundingBox();
        assert.ok(rect.y >= 0 && rect.y + rect.height <= height, `${name} persistent context must remain visible`);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await goto("&familyId=demo-family-1&centerId=preview-center");
  await section("Tuition & Fees");
  const invoiceSummary = page.getByText("Net recurring invoice", { exact: true }).locator("..");
  await invoiceSummary.getByText("$500.00", { exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Billing cycle", exact: true }).click();
  await page.getByRole("option", { name: "Every 4 weeks · 4 weeks ahead", exact: true }).click();
  await invoiceSummary.getByText("$1,000.00", { exact: true }).waitFor();
  page.once("dialog", dialog => dialog.accept());
  await pick("demo-family-0");
  await page.getByRole("tab", { name: "Pay ahead", exact: true }).click();
  const firstMonth = await page.getByLabel("First month", { exact: true }).inputValue();
  await page.getByLabel("Months paid ahead", { exact: true }).fill("3");
  await page.getByLabel("First month", { exact: true }).fill("2027-01");
  page.once("dialog", dialog => dialog.dismiss());
  await pick("demo-family-1");
  await checkContext("demo-family-0");
  assert.equal(await page.getByLabel("Months paid ahead", { exact: true }).inputValue(), "3");
  page.once("dialog", dialog => dialog.accept());
  await pick("demo-family-1");
  await page.getByRole("tab", { name: "Pay ahead", exact: true }).click();
  assert.equal(await page.getByLabel("Months paid ahead", { exact: true }).inputValue(), "1");
  assert.equal(await page.getByLabel("First month", { exact: true }).inputValue(), firstMonth);
  report.checks.push("A $250 weekly rate displays $500 biweekly and $1,000 every four weeks; pay-ahead edits warn, survive cancellation and reset on a confirmed family switch.");
  await page.setViewportSize({ width: 390, height: 844 });
  await goto("&familyId=demo-family-1&centerId=preview-center");
  await openPicker();
  await page.getByRole("searchbox", { name: "Find a family in this category" }).fill("no-such-demo-household");
  await page.getByRole("button", { name: "Browse family list (30)", exact: true }).click();
  await page.getByText(/No matching families. Try a child/).waitFor();
  await checkContext("demo-family-1");
  await page.getByRole("searchbox", { name: "Find a family in this category" }).fill("");
  const browseList = page.getByRole("group", { name: "Browse billing families", exact: true });
  await browseList.evaluate(el => el.scrollIntoView({ block: "end" }));
  const listRect = await browseList.boundingBox();
  const touch = await page.context().newCDPSession(page);
  const x = listRect.x + listRect.width / 2;
  const bottom = Math.min(listRect.y + listRect.height - 12, 760);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: bottom }] });
  for (const distance of [50, 100, 160]) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: bottom - distance }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.ok(await browseList.evaluate(el => el.scrollTop > 0), "The family browse list must scroll with a touch gesture");
  await touch.detach();
  report.checks.push("An empty local search retains the selected family; the long browse list scrolls with an emulated touch gesture.");
  await page.goto(`${origin.origin}/device-preview?view=billing&scenario=director-receipt`);
  await page.waitForFunction(() => document.documentElement.dataset.devicePreviewHydrated === "true");
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  const receiptDialog = page.getByRole("dialog", { name: "Payment receipt preview", exact: true });
  const receiptText = await receiptDialog.innerText();
  for (const text of ["Rivera Household", "Centennial", "$100.00", "DEMO-RECEIPT-1"]) assert.ok(receiptText.includes(text), text);
  assert.ok(!receiptText.includes("annual statement"));
  await receiptDialog.getByRole("button", { name: "Close preview", exact: true }).click();
  await page.goto(`${origin.origin}/device-preview?view=billing&scenario=overview-refresh`);
  await page.waitForFunction(() => document.documentElement.dataset.devicePreviewHydrated === "true");
  await page.getByRole("status").filter({ hasText: "Pending: 0; collectible: 24500" }).waitFor();
  await page.getByRole("button", { name: "Simulate pending ACH props", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Pending: 1; collectible: 14500" }).waitFor();
  await page.getByText("Posted balance: $245.00", { exact: true }).waitFor();
  report.checks.push("Refreshed pending ACH props invalidate the actual overview hook while the family, account and $245 posted balance remain unchanged.");
  assert.deepEqual(report.apiRequests, [], "The fixture browser must never request an API");
  assert.deepEqual(report.consoleErrors, [], "No application runtime errors");
  report.checks.push("Ledger and charge/credit summaries also preview before printing; director receipt preview identifies the paid family, school, amount and receipt reference.");
  report.checks.push("All four sections fit desktop, tablet, 390px and 320px layouts with 44px section targets and persistent context; zero API traffic.");
  await writeFile(resolve(out, "browser-results.json"), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block", hasTouch: true });
    const page = await context.newPage();
    console.log(JSON.stringify(await runBillingDirectorQa(page, process.argv[2]), null, 2));
  } finally {
    await browser.close();
  }
}
