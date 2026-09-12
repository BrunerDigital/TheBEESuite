import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

function arg(name: string, fallback: string) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] || fallback; }
const base = assertNonProductionBaseUrl(arg("--base-url", "http://localhost:3224"));
const engine = arg("--browser", "chromium");
assert.ok(["chromium", "webkit"].includes(engine));
const output = resolve(arg("--output-dir", `output/playwright/unsaved-history-${engine}`));

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const unsafe: string[] = [], errors: string[] = [], documents: string[] = [], checks: string[] = [];
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) { unsafe.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (request.isNavigationRequest()) documents.push(url.pathname);
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", () => errors.push("Client exception"));
  const workflow = "/device-preview?view=workflow&scenario=history-qa";
  const parent = "/device-preview?view=parent&scenario=history-qa";
  const billing = "/device-preview?view=billing&scenario=history-qa";
  const waitUrl = async (suffix: string) => {
    await page.waitForURL(`${base}${suffix}`);
    await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
    const view = new URL(suffix, base).searchParams.get("view");
    const role = view === "parent" ? "PARENT_GUARDIAN" : view === "billing" ? "BILLING_ADMIN" : "CENTER_DIRECTOR";
    await page.locator(`.bee-app-frame[data-role="${role}"]`).waitFor({ state: "visible" });
  };
  const link = (label: string) => page.getByRole("navigation", { name: "Fake history destinations" }).getByRole("link", { name: `Fake ${label} destination`, exact: true });
  const field = page.getByLabel("Workflow Name", { exact: true });
  const downstream = () => page.evaluate(() => (window as unknown as { __historyDownstream: string[] }).__historyDownstream.length);
  const travel = async (delta: number, accept: boolean, target: string) => {
    const dialog = page.waitForEvent("dialog");
    await page.evaluate(value => history.go(value), delta);
    const prompt = await dialog;
    assert.match(prompt.message(), /unsaved workflow configuration/);
    if (accept) await prompt.accept(); else await prompt.dismiss();
    await waitUrl(target);
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  };
  try {
    await page.goto(`${base}${parent}`, { waitUntil: "networkidle" }); await waitUrl(parent);
    await page.waitForFunction(() => Boolean(history.state?.__beeUnsavedHistory));
    await page.evaluate(() => {
      (window as unknown as { __historyDownstream: string[] }).__historyDownstream = [];
      addEventListener("popstate", () => (window as unknown as { __historyDownstream: string[] }).__historyDownstream.push(location.search));
    });
    await link("workflow").click(); await waitUrl(workflow); await field.fill("Fake retained Back draft");
    const length = await page.evaluate(() => history.length), firstDownstream = await downstream();
    await travel(-1, false, workflow);
    assert.equal(await field.inputValue(), "Fake retained Back draft"); assert.ok(await field.isVisible());
    assert.equal(await page.evaluate(() => history.length), length); assert.equal(await downstream(), firstDownstream, "Canceled and restoration pops never reach Next/downstream listeners");
    checks.push("Actual Next Back cancel preserves visible draft, exact URL and history length");
    await travel(-1, true, parent); assert.equal(await field.isVisible(), false);
    await page.evaluate(() => history.forward()); await waitUrl(workflow); await field.waitFor();
    checks.push("Back accept then clean Forward navigates normally without a bounce");
    // Reset this clean server record if the framework retains prior state.
    if (await field.inputValue() !== "Tour follow-up and enrollment nurture") {
      page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    }
    await link("billing").click(); await waitUrl(billing);
    await page.evaluate(() => history.back()); await waitUrl(workflow); await field.fill("Fake retained Forward draft");
    const forwardDownstream = await downstream();
    await travel(1, false, workflow);
    assert.equal(await field.inputValue(), "Fake retained Forward draft"); assert.equal(await downstream(), forwardDownstream);
    checks.push("Forward cancel preserves draft and the forward stack");
    await travel(1, true, billing); assert.equal(await field.isVisible(), false);
    checks.push("Forward accept follows the original destination");
    await link("workflow").click(); await waitUrl(workflow); await field.fill("Fake multi-entry draft");
    const multiDownstream = await downstream();
    await travel(-3, false, workflow); assert.equal(await field.inputValue(), "Fake multi-entry draft"); assert.equal(await downstream(), multiDownstream);
    checks.push("Multi-entry Back cancel restores its exact existing entry");
    await travel(-2, false, workflow); assert.equal(await field.inputValue(), "Fake multi-entry draft");
    checks.push("Same-URL distinct history entries still protect drafts");
    const linkDialog = page.waitForEvent("dialog"), click = link("parent").click(); await (await linkDialog).dismiss(); await click; await waitUrl(workflow);
    assert.equal(await field.inputValue(), "Fake multi-entry draft");
    checks.push("Existing Next Link discard cancellation remains intact");
    let unexpected = 0;
    const unexpectedDialog = async (dialog: import("playwright").Dialog) => { unexpected++; await dialog.dismiss(); };
    page.on("dialog", unexpectedDialog);
    await page.evaluate(() => { location.hash = "automation-builder"; }); await waitUrl(`${workflow}#automation-builder`);
    await page.evaluate(() => history.back()); await waitUrl(workflow);
    assert.equal(await field.inputValue(), "Fake multi-entry draft"); assert.equal(unexpected, 0);
    page.off("dialog", unexpectedDialog);
    checks.push("Native hash-only Back does not warn or lose the draft");
    const state = await page.evaluate(() => {
      history.pushState(null, "", `${location.pathname}${location.search}#fake-hash`);
      history.replaceState(null, "", location.href);
      return { next: history.state.__NA, tree: Boolean(history.state.__PRIVATE_NEXTJS_INTERNALS_TREE), marker: Boolean(history.state.__beeUnsavedHistory), early: Boolean((window as unknown as { __beeHistoryEarlyListener: boolean }).__beeHistoryEarlyListener) };
    });
    assert.deepEqual(state, { next: true, tree: true, marker: true, early: true });
    checks.push("Null native push/replace preserve opaque Next state and early guard marker");
    assert.equal(await page.getByRole("button", { name: "Preview only", exact: true }).isDisabled(), true, "Actual workflow remains read-only");
    assert.equal(documents.length, 1, "All role transitions were actual Next client navigation, not document reloads");
    assert.deepEqual(unsafe, []); assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(output, "retained-workflow.png"), fullPage: true });
    await writeFile(resolve(output, "results.json"), JSON.stringify({ engine, checkedAt: new Date().toISOString(), checks, documentNavigations: documents.length, unsafeRequests: 0, clientErrors: 0 }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, checks: checks.length, documentNavigations: documents.length }));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
