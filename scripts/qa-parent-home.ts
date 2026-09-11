import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] || fallback;
}

const baseUrl = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:3210"));
const browserName = argument("--browser", "chromium");
assert.ok(["chromium", "webkit"].includes(browserName), "Use chromium or webkit");
const output = resolve(argument("--output-dir", "output/playwright/parent-home"));
async function main() {
const browser = await (browserName === "webkit" ? webkit : chromium).launch();
const results: Array<Record<string, unknown>> = [];

try {
  await mkdir(output, { recursive: true });
  for (const width of [360, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    const unsafeRequests: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET" || url.origin !== new URL(baseUrl).origin || url.pathname.startsWith("/api/")) {
        unsafeRequests.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    const homeUrl = `${baseUrl}/device-preview?view=parent&screen=home&scenario=single-review`;
    await page.goto(homeUrl, { waitUntil: "networkidle" });
    const actions = page.locator('[data-parent-home-actions="true"] a');
    assert.equal(await actions.count(), 4);
    const navTop = await page.getByRole("navigation", { name: "Family portal navigation" }).evaluate((el) => el.getBoundingClientRect().top);
    for (const action of await actions.all()) {
      const box = await action.boundingBox();
      assert.ok(box && box.height >= 44 && box.width >= 44 && box.y + box.height < navTop, "All four home actions fit above the fixed navigation");
    }
    await page.screenshot({ path: resolve(output, `${browserName}-${width}-home.png`), style: "nextjs-portal { display: none !important; }" });
    const summary = page.locator("#today summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#today details").first().getAttribute("open"), "");
    assert.match(await page.locator("#today details").first().innerText(), /Schedule[\s\S]*Classroom[\s\S]*Latest attendance update[\s\S]*Daily update/);
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#today details").first().getAttribute("open"), null);

    for (const [label, screen, section] of [
      ["School Check-In", "family", "check-in"],
      ["Message the School", "messages", null],
      ["Photos & Daily Reports", "updates", null],
      ["View Payments", "payments", null],
    ] as const) {
      await page.goto(homeUrl, { waitUntil: "networkidle" });
      await page.locator('[data-parent-home-actions="true"]').getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("screen") === screen);
      assert.equal(new URL(page.url()).searchParams.get("familyId"), "exec-demo-family");
      if (section) assert.equal(new URL(page.url()).searchParams.get("section"), section);
    }

    await page.goto(`${baseUrl}/device-preview?view=parent&screen=home`, { waitUntil: "networkidle" });
    const children = page.locator("#today article");
    assert.equal(await children.count(), 2);
    for (const child of await children.all()) {
      const box = await child.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width, "Every sibling is visible without horizontal swiping");
    }
    assert.equal(await page.getByRole("link", { name: /Daily report ready for/ }).count(), 2);

    await page.goto(`${baseUrl}/device-preview?view=parent&screen=home&scenario=absent-home`, { waitUntil: "networkidle" });
    const attendanceText = await page.locator("#today").innerText();
    assert.match(attendanceText, /Absent/);
    assert.doesNotMatch(attendanceText, /No attendance event yet|Not marked today/);

    await page.goto(`${baseUrl}/device-preview?view=parent&screen=home&scenario=quiet-home`, { waitUntil: "networkidle" });
    assert.match(await page.locator("#parent-home-attention").innerText(), /You’re all caught up/);
    assert.match(await page.locator("#parent-home-account").innerText(), /\$0\.00/);
    assert.equal(await page.getByRole("link", { name: "Review & Pay", exact: true }).count(), 0);

    await page.goto(`${baseUrl}/device-preview?view=parent&screen=home&scenario=long-content`, { waitUntil: "networkidle" });
    await page.locator("#parent-home-announcements summary").click();
    assert.match(await page.locator("#parent-home-announcements details[open] > p").innerText(), /Please contact the school office with any questions\.$/);
    await page.locator("#parent-home-announcements summary").click();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, "Long content at 200% text size must not overflow horizontally");
    await page.screenshot({ path: resolve(output, `${browserName}-${width}-large-text.png`), style: "nextjs-portal { display: none !important; }" });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; localStorage.setItem("bee-suite-theme", "dark"); document.documentElement.classList.add("dark"); });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `${browserName}-${width}-dark.png`), style: "nextjs-portal { display: none !important; }" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    assert.deepEqual(unsafeRequests, []);
    results.push({ browser: browserName, width, shortcuts: 4, keyboardDetails: "passed", navigation: "passed", siblings: "passed", absence: "passed", quietAccount: "passed", fullAnnouncement: "passed", largeText: "passed", unsafeRequests: 0 });
    await context.close();
  }
  await writeFile(resolve(output, `${browserName}-results.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  await browser.close();
}
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
