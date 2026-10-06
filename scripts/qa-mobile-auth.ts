import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit, type Page } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

const argument = (name: string, fallback: string) => process.argv[process.argv.indexOf(name) + 1] && process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const base = assertNonProductionBaseUrl(argument("--base-url", "http://localhost:3236"));
const engine = argument("--browser", "webkit");
assert.ok(["chromium", "webkit"].includes(engine));
const output = resolve(`output/playwright/mobile-auth-${engine}`);
const next = "/parent-portal?view=messages#conversation";
const screens = ["/parents", "/teachers", `/forgot-password?next=${encodeURIComponent(next)}`, `/reset-password?next=${encodeURIComponent(next)}`, `/reset-password?force=1&next=${encodeURIComponent(next)}`];

async function fits(page: Page) {
  const findings = await page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth) issues.push("Page overflow");
    for (const element of document.querySelectorAll<HTMLElement>("main :is(a,button,input)")) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(element).visibility === "hidden") continue;
      if (box.left < -1 || box.right > innerWidth + 1) issues.push(`Outside viewport: ${element.id || element.textContent}`);
      if (element.tagName !== "INPUT" && element.scrollWidth > element.clientWidth + 3) issues.push(`Clipped text: ${element.textContent}`);
      if (element.tagName === "INPUT" && parseFloat(getComputedStyle(element).fontSize) < 16) issues.push("Small input text");
    }
    return issues;
  });
  assert.deepEqual(findings, []);
}

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: object[] = [];
  try {
    for (const width of [320, 390]) for (const zoom of [100, 200]) for (const [index, screen] of screens.entries()) {
      const height = width === 320 ? 568 : 844;
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
      const unsafe: string[] = [], errors: string[] = [];
      let interceptedWrites = 0;
      await context.addInitScript(theme => localStorage.setItem("bee-suite-theme", theme), width === 320 ? "light" : "dark");
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === new URL(base).origin && request.method() === "POST" && ["/api/auth/login", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/force-password-reset"].includes(url.pathname)) {
          interceptedWrites++;
          return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Synthetic mobile rejection. Your entries are retained; try again when your connection is available." }) });
        }
        if (url.origin !== new URL(base).origin || request.method() !== "GET" || url.pathname.startsWith("/api/")) { unsafe.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", () => errors.push("Client exception"));
      try {
        await page.goto(`${base}${screen}`, { waitUntil: "networkidle" });
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await page.evaluate(value => { document.documentElement.style.fontSize = `${value}%`; }, zoom);
        const fields = page.locator("main input:visible");
        const values: Array<{ id: string; value: string }> = [];
        for (const field of await fields.all()) {
          const id = (await field.getAttribute("id"))!;
          const value = id === "email" ? "mobile-test@example.test" : "Synthetic-mobile-only-123!";
          await field.fill(value); values.push({ id, value });
        }
        for (const button of await page.getByRole("button", { name: /^Show / }).all()) {
          const controlled = (await button.getAttribute("aria-controls"))!;
          await button.tap();
          assert.equal(await page.locator(`[id="${controlled}"]`).getAttribute("type"), "text");
          await page.locator(`button[aria-controls="${controlled}"]`).press("Enter");
          assert.equal(await page.locator(`[id="${controlled}"]`).getAttribute("type"), "password");
        }
        assert.equal(interceptedWrites, 0, "Revealing passwords cannot submit the form");
        for (const viewport of [{ width, height }, { width: 844, height: 390 }, { width, height }]) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
          await fits(page);
          for (const field of values) assert.equal(await page.locator(`[id="${field.id}"]`).inputValue(), field.value, "Rotation retains form drafts");
        }
        if (screen.includes("next=")) {
          assert.ok(await page.getByText(/parent portal|parent or guardian/i).count() > 0, "Parent deep links retain parent recovery guidance");
        }
        const submit = page.locator('button[type="submit"]');
        if (await submit.count()) {
          await submit.tap();
          await page.getByText("Synthetic mobile rejection. Your entries are retained; try again when your connection is available.", { exact: true }).waitFor();
          await fits(page);
          for (const field of values) assert.equal(await page.locator(`[id="${field.id}"]`).inputValue(), field.value);
          assert.equal(interceptedWrites, 1);
          assert.equal(await page.locator(".bee-submission-notice").count(), 0, "Inline auth errors are not covered by a generic submission toast");
        }
        await page.screenshot({ path: resolve(output, `${index}-${width}-${zoom}.png`) });
        assert.deepEqual(unsafe, []); assert.deepEqual(errors, []);
        results.push({ screen, width, zoom, rotations: 2, interceptedWrites, productWrites: 0 });
      } catch (error) {
        await page.screenshot({ path: resolve(output, `${index}-${width}-${zoom}-failure.png`) }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    await writeFile(resolve(output, "results.json"), JSON.stringify({ engine, passed: true, cases: results }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, cases: results.length, productWrites: 0 }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
