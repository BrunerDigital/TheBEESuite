import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit, type Page } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

function arg(name: string, fallback: string) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] || fallback; }
const base = assertNonProductionBaseUrl(arg("--base-url", "http://localhost:3224"));
const engine = arg("--browser", "chromium");
assert.ok(["chromium", "webkit"].includes(engine));
const output = resolve(arg("--output-dir", `output/playwright/parent-home-fit-${engine}`));
const settle = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))));

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const width of [320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const unsafe: string[] = [], errors: string[] = [];
      await context.addInitScript(() => localStorage.setItem("bee-suite-theme", "light"));
      await context.route("**/*", (route) => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) {
          unsafe.push(`${request.method()} ${url.pathname}`); return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", () => errors.push("Client exception"));
      const open = async (query: string) => {
        await page.goto(`${base}/device-preview?view=parent&${query}`, { waitUntil: "networkidle" });
        await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await settle(page);
      };
      for (const section of ["children", "check-in", "documents", "billing", "profile", "notifications"]) {
        await open(`screen=family&section=${section}`);
        const active = page.locator('#parent-family-section-nav [aria-current="page"]');
        await active.evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
        // Keep enough content below the viewport so zoom cannot clamp scrollY.
        await page.addStyleTag({ content: "body{padding-bottom:1200px!important;overflow-anchor:none!important}" });
        await page.evaluate(() => window.scrollTo(0, 120));
        for (const size of [200, 100, 200]) {
          const before = await page.evaluate(() => ({ y: scrollY, focus: document.activeElement?.getAttribute("href") }));
          await page.evaluate((value) => { document.documentElement.style.fontSize = `${value}%`; }, size);
          await settle(page);
          const geometry = await active.evaluate((el) => {
            const nav = el.parentElement!, box = nav.getBoundingClientRect(), item = el.getBoundingClientRect();
            return { left: item.left, right: item.right, height: item.height, navLeft: box.left + nav.clientLeft, navRight: box.left + nav.clientLeft + nav.clientWidth,
              internalOverflow: el.scrollWidth - el.clientWidth, pageOverflow: document.documentElement.scrollWidth - innerWidth, y: scrollY, focus: document.activeElement?.getAttribute("href") };
          });
          assert.ok(geometry.left >= geometry.navLeft - 1 && geometry.right <= geometry.navRight + 1, `${section}/${width}/${size}: active tab entirely visible ${JSON.stringify(geometry)}`);
          assert.ok(geometry.height >= 44 && geometry.internalOverflow <= 1);
          assert.equal(geometry.pageOverflow, 0);
          assert.equal(geometry.y, before.y, "Layout correction must not move the page vertically");
          assert.equal(geometry.focus, before.focus, "Layout correction must not move keyboard focus");
          results.push({ section, width, size, ...geometry });
        }
        await page.setViewportSize({ width: 1440, height: 1000 }); await settle(page);
        await page.setViewportSize({ width, height: 844 }); await settle(page);
        const inStrip = await active.evaluate((el) => { const nav = el.parentElement!.getBoundingClientRect(), item = el.getBoundingClientRect(); return item.left >= nav.left - 1 && item.right <= nav.right + 1; });
        assert.ok(inStrip, `${section} returns from desktop entirely visible`);
        if (section === "notifications" || section === "documents") await page.screenshot({ path: resolve(output, `${width}-${section}-200.png`) });
      }
      for (const scenario of ["quiet-home", "single-review", "account-missing", "account-pending", "account-ach", "account-open", "account-credit", "account-review", "account-reauthorize", "account-transition"]) {
        await open(`screen=home&scenario=${scenario}`);
        const account = page.locator("#parent-home-account");
        assert.equal(await account.getAttribute("data-compact-account"), scenario === "quiet-home" ? "true" : "false");
        if (scenario === "account-missing") {
          assert.match(await account.innerText(), /Account details are not available yet/);
          assert.doesNotMatch(await account.innerText(), /\$0\.00|No open invoices/);
        }
        if (scenario === "account-review") assert.match(await account.innerText(), /Balance review in progress/);
        if (scenario === "account-open") assert.match(await account.innerText(), /21 open invoices/);
        for (const size of [100, 200]) {
          await page.evaluate((value) => { document.documentElement.style.fontSize = `${value}%`; }, size); await settle(page);
          const metrics = await account.evaluate((element) => {
            const a = element.querySelector("a")!, box = a.getBoundingClientRect();
            return { height: element.getBoundingClientRect().height, linkHeight: box.height, internalOverflow: a.scrollWidth - a.clientWidth,
              childOverflow: [...a.querySelectorAll("span,div,h2")].some((child) => child.scrollWidth > child.clientWidth + 1),
              pageOverflow: document.documentElement.scrollWidth - innerWidth, href: a.getAttribute("href") };
          });
          assert.ok(metrics.linkHeight >= 44 && metrics.internalOverflow <= 1 && !metrics.childOverflow, `${scenario}/${width}/${size}: link contents fit ${JSON.stringify(metrics)}`);
          assert.equal(metrics.pageOverflow, 0);
          const destination = new URL(metrics.href!, base);
          assert.equal(destination.searchParams.get("screen"), "payments"); assert.equal(destination.searchParams.get("familyId"), "exec-demo-family");
          if (scenario === "quiet-home") assert.ok(metrics.height <= (size === 100 ? 150 : 340), "Quiet summary remains compact without shrinking text");
          results.push({ scenario, width, size, ...metrics });
          if (["quiet-home", "single-review", "account-missing"].includes(scenario)) await account.screenshot({ path: resolve(output, `${width}-${scenario}-${size}.png`) });
        }
      }
      assert.deepEqual(unsafe, []); assert.deepEqual(errors, []); await context.close();
    }
    await writeFile(resolve(output, "results.json"), JSON.stringify({ engine, checkedAt: new Date().toISOString(), results }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, cases: results.length, unsafeRequests: 0, clientErrors: 0 }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
