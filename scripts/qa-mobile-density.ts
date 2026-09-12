import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith("--"), `${name} requires a value`);
  return value;
}
const base = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:3216"));
const output = resolve(argument("--output-dir", "output/playwright/mobile-density"));
const engine = argument("--browser", "chromium");
assert.ok(["chromium", "webkit"].includes(engine));

async function main() {
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results = [];
  await mkdir(output, { recursive: true });
  try {
    for (const width of [320, 390, 768]) for (const zoom of [1, 2]) {
      for (const scenario of ["single-review", "school-context", "quiet-home", "absent-home", "long-content", "multiple", "teacher", "teacher-review"]) {
        const height = width === 320 ? 568 : width === 390 ? 844 : 1024;
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
        await context.addInitScript(() => localStorage.setItem("bee-suite-theme", "light"));
        const page = await context.newPage();
        const unsafe: string[] = [], errors: string[] = [];
        await context.route("**/*", (route) => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) {
            unsafe.push(`${request.method()} ${url.pathname}`);
            return route.abort();
          }
          return route.continue();
        });
        page.on("pageerror", () => errors.push("Uncaught client exception"));
        try {
          const teacher = scenario.startsWith("teacher");
          const search = teacher ? `view=teacher&scenario=${scenario === "teacher-review" ? "review" : "normal"}` : `view=parent&screen=home&scenario=${scenario}`;
          await page.goto(`${base}/device-preview?${search}`, { waitUntil: "networkidle", timeout: 60000 });
          await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
          await page.evaluate((value) => { document.documentElement.style.fontSize = `${value * 100}%`; }, zoom);
          await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
          const metrics = await page.evaluate(() => {
            const bottom = document.querySelector(".app-bottom-navigation")?.getBoundingClientRect().top ?? innerHeight;
            const navigation = [...document.querySelectorAll<HTMLAnchorElement>(".app-bottom-navigation a")].map((link) => {
              const box = link.getBoundingClientRect(), label = link.querySelector("span");
              const labelBox = label?.getBoundingClientRect();
              return { href: link.getAttribute("href"), text: link.textContent?.trim(), width: box.width, height: box.height, top: box.top, focusable: link.tabIndex >= 0, labelHeight: labelBox?.height ?? 0, lineHeight: label ? parseFloat(getComputedStyle(label).lineHeight) : 0 };
            });
            const actions = [...document.querySelectorAll<HTMLAnchorElement>('[data-parent-home-actions] a, nav[aria-label="Teacher task shortcuts"] a')].map((a) => {
              const box = a.getBoundingClientRect();
              return { text: a.textContent?.trim(), href: a.getAttribute("href"), top: box.top, bottom: box.bottom, width: box.width, height: box.height, visible: box.top >= 0 && box.bottom <= bottom };
            });
            const boxes = [...document.querySelectorAll<HTMLElement>("main > div > header, main > div > section, main > div > nav, .teacher-mobile-workspace > section, .teacher-mobile-workspace > nav")].map((e) => ({ id: e.id, label: e.querySelector("h1,h2")?.textContent, height: e.getBoundingClientRect().height }));
            return { scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, usableBottom: bottom, navigationHeight: innerHeight - bottom, navigation, actions, boxes };
          });
          assert.equal(metrics.scrollWidth, width, `${scenario} page overflow`);
          assert.equal(metrics.actions.length, teacher ? 6 : 4);
          for (const action of metrics.actions) assert.ok(action.height >= 44, "Every action retains a 44px touch target");
          if (!teacher) {
            assert.equal(metrics.navigation.length, 5, "All parent destinations remain available");
            for (const link of metrics.navigation) {
              assert.ok(link.href && link.focusable && link.height >= 44 && link.width >= 44, "Every navigation link remains focusable and touch sized");
              assert.ok(link.labelHeight <= link.lineHeight + 1, "Navigation labels remain complete single lines");
            }
            if (width <= 390) assert.ok(metrics.navigationHeight <= (zoom === 2 ? 145 : 70), "Parent navigation uses at most two enlarged rows or one default row");
          }
          if (zoom === 1 && width <= 390 && ["single-review", "school-context", "teacher"].includes(scenario)) {
            assert.ok(metrics.actions.every((action) => action.visible), "Every primary action fits above navigation at default phone text size");
          }
          if (zoom === 1 && width === 390 && scenario === "teacher-review") assert.ok(metrics.actions.every((action) => action.visible), "Review notice does not push shortcuts off a standard phone");
          await page.screenshot({ path: resolve(output, `${scenario}-${width}-${zoom * 100}.png`) });
          if (scenario === "teacher-review") {
            const summary = page.locator("[data-teacher-review-notice] summary");
            await summary.focus();
            await summary.press("Enter");
            assert.match(await page.locator("[data-teacher-review-notice][open] p").innerText(), /cannot change the shared profile, create a staff kiosk code, or clock time/);
            await summary.press("Enter");
          }
          if (teacher) for (const action of metrics.actions) {
            const href = action.href;
            assert.ok(typeof href === "string" && href.startsWith("#teacher-"));
            const link = page.locator(`nav[aria-label="Teacher task shortcuts"] a[href="${href}"]`);
            await link.focus();
            await link.press("Enter");
            const target = page.locator(href);
            await target.locator('[aria-expanded="true"][aria-controls]').first().waitFor();
            assert.ok(await target.evaluate((element) => element.contains(document.activeElement)), "Shortcut opens its task and transfers keyboard focus");
          }
          assert.deepEqual(unsafe, []);
          assert.deepEqual(errors, []);
          results.push({ scenario, width, height, zoom, ...metrics });
        } finally { await context.close(); }
      }
    }
    assert.equal(results.length, 48);
    await writeFile(resolve(output, "density-results.json"), JSON.stringify({ engine, checkedAt: new Date().toISOString(), results }, null, 2));
    console.log(JSON.stringify({ engine, cases: results.length, normalPhone: results.filter((r) => r.width < 768 && r.zoom === 1 && ["teacher", "single-review"].includes(r.scenario)).map((r) => ({ scenario: r.scenario, width: r.width, visibleActions: r.actions.filter((a) => a.visible).length, lastActionBottom: r.actions.at(-1)?.bottom, scrollHeight: r.scrollHeight })) }));
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
