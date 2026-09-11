import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit, type Page } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

const argument = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] || fallback;
};
const base = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:3210"));
const output = resolve(argument("--output-dir", "output/playwright/role-home-refinement"));
const engine = argument("--browser", "chromium");

async function noOverflow(page: Page, label: string) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, label);
}

async function main() {
  assert.ok(["chromium", "webkit"].includes(engine));
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Array<Record<string, unknown>> = [];
  await mkdir(output, { recursive: true });
  try {
    for (const width of [390, 768, 1024]) {
      for (const role of ["teacher", "director", "executive"]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", serviceWorkers: "block" });
        const page = await context.newPage();
        const unsafe: string[] = [];
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) {
            unsafe.push(`${request.method()} ${url.pathname}`);
            return route.abort();
          }
          return route.continue();
        });
        const url = `${base}/device-preview?view=${role}&scenario=long-content`;
        await page.goto(url, { waitUntil: "networkidle" });
        await noOverflow(page, `${role} ${width} home`);
        await page.screenshot({ path: resolve(output, `${engine}-${role}-${width}-home.png`), style: "nextjs-portal{display:none!important}" });
        if (role === "teacher") {
          await page.getByRole("link", { name: "View roster", exact: true }).click();
          await page.locator('#teacher-roster[data-collapsed="false"]').waitFor();
          assert.equal(await page.locator("#teacher-roster").getAttribute("data-collapsed"), "false");
          const rosterTop = (await page.locator("#teacher-roster").boundingBox())!.y;
          const headerBottom = await page.locator(".app-header").evaluate((element) => element.getBoundingClientRect().bottom);
          assert.ok(rosterTop >= headerBottom, "Roster anchor is not hidden under the app header");
          assert.ok(await page.locator('.app-header').evaluate((header) => {
            const rect = header.getBoundingClientRect();
            return header.contains(document.elementFromPoint(rect.left + 30, rect.top + 30));
          }), "Scrolling classroom tools must not cover the app header");
          assert.equal(await page.locator('#teacher-roster button[aria-pressed]').count(), 5);
          const child = page.locator('#teacher-roster button[aria-pressed]').nth(1);
          await child.click();
          await page.locator('#teacher-roster button[aria-pressed="true"]').filter({ hasText: "Mason Brooks" }).waitFor();
          assert.equal(await child.getAttribute("aria-pressed"), "true");
          for (const button of await page.locator('#teacher-roster button:visible').all()) {
            const box = await button.boundingBox();
            assert.ok(box && box.width >= 44 && box.height >= 44, "Roster touch targets are at least 44px on tablet and phone");
          }
          await page.getByRole("button", { name: "Check out Mason Brooks", exact: true }).click();
          await page.getByText("Preview only — no classroom record was changed.", { exact: true }).waitFor();
          for (const id of ["teacher-attendance", "teacher-photo", "teacher-daily-report", "teacher-incident", "teacher-profile-setup"]) {
            const card = page.locator(`#${id}`);
            if (await card.getAttribute("data-collapsed") === "true") await card.getByRole("button", { name: /^Expand / }).click();
            await noOverflow(page, `${role} ${width} ${id}`);
          }
          await page.goto(`${url}#teacher-quick-log`, { waitUntil: "networkidle" });
          await page.locator('#teacher-daily-report[data-collapsed="false"]').waitFor();
          const quickLog = (await page.locator('#teacher-quick-log').boundingBox())!;
          const obstruction = await page.locator(width >= 640 ? 'nav[aria-label="Teacher task shortcuts"]' : '.app-header').evaluate((element) => element.getBoundingClientRect().bottom);
          assert.ok(quickLog.y >= obstruction, "Quick-log anchor clears the sticky tools and header");
          await page.goto(`${base}/device-preview?view=teacher&scenario=empty#teacher-roster`, { waitUntil: "networkidle" });
          await page.getByText("No children assigned yet", { exact: true }).waitFor();
        } else {
          const priority = page.locator('ul[aria-labelledby="dashboard-needs-attention"] a[data-preview-destination]').first();
          await priority.waitFor();
          const destination = await priority.getAttribute("data-preview-destination");
          assert.ok(destination?.startsWith(role === "director" ? "/attendance?q=" : "/multi-location-dashboard?q="));
          await priority.click();
          await page.waitForURL((current) => current.searchParams.get("target") === destination);
          if (role === "executive") {
            await page.getByText("Explore dashboard details", { exact: true }).click();
            const lens = page.getByRole("button", { name: "Expand platform dashboard lens", exact: true });
            if (await lens.count()) await lens.click();
            await page.getByRole("button", { name: "Expand Current-week FTE by school", exact: true }).click();
            const links = page.locator('#dashboard-platform-current-week-fte a[data-preview-destination]');
            assert.equal(await links.count(), 3);
            for (const link of await links.all()) {
              const href = new URL((await link.getAttribute("data-preview-destination"))!, base);
              assert.equal(href.searchParams.get("weekStart"), "2026-09-07");
              assert.ok(href.searchParams.get("centerId")?.startsWith("preview-center"));
              assert.ok((await link.boundingBox())!.height >= 44);
            }
            await noOverflow(page, `${role} ${width} FTE follow-up`);
          }
          await page.goto(`${base}/device-preview?view=${role}&scenario=empty`, { waitUntil: "networkidle" });
          await page.getByRole("heading", { name: "You’re up to date", exact: true }).waitFor();
        }
        await page.goto(url, { waitUntil: "networkidle" });
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        await noOverflow(page, `${role} ${width} 200% text`);
        await page.screenshot({ path: resolve(output, `${engine}-${role}-${width}-large-text.png`), style: "nextjs-portal{display:none!important}" });
        assert.deepEqual(unsafe, []);
        assert.deepEqual(errors, []);
        results.push({ engine, role, width, passed: true, unsafeRequests: 0, pageErrors: 0 });
        await context.close();
      }
    }
    await writeFile(resolve(output, `${engine}-results.json`), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ passed: true, results }));
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
