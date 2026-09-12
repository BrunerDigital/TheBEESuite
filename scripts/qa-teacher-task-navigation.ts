import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit, type Locator } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

function arg(name: string, fallback: string) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] || fallback; }
const base = assertNonProductionBaseUrl(arg("--base-url", "http://localhost:3224"));
const engine = arg("--browser", "chromium");
assert.ok(["chromium", "webkit"].includes(engine));
const output = resolve(arg("--output-dir", `output/playwright/teacher-task-navigation-${engine}`));

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const width of [320, 390]) for (const zoom of [100, 200]) {
      const motion = width === 390 && zoom === 100 ? "no-preference" : "reduce";
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: motion, serviceWorkers: "block" });
      const unsafe: string[] = [], errors: string[] = [], documents: string[] = [];
      await context.addInitScript(() => localStorage.setItem("bee-suite:collapsed:teacher-daily-report", "1"));
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) { unsafe.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (request.isNavigationRequest()) documents.push(url.pathname);
        return route.continue();
      });
      const page = await context.newPage(); page.on("pageerror", () => errors.push("Client exception"));
      page.setDefaultTimeout(15000);
      const teacher = "/device-preview?view=teacher&scenario=history-qa&keep=fake";
      const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))));
      const nav = page.locator(".app-bottom-navigation");
      const task = (name: string) => nav.getByRole("link", { name, exact: true });
      const waitHash = async (hash: string, active: string | null, focusId?: string) => {
        await page.waitForURL(`${base}${teacher}${hash}`); await settle();
        assert.equal(await nav.locator('[aria-current="page"]').count(), active ? 1 : 0);
        if (active) assert.equal(await task(active).getAttribute("aria-current"), "page");
        if (focusId) await page.waitForFunction(id => document.activeElement?.id === id, focusId);
        assert.equal(new URL(page.url()).search, new URL(teacher, base).search, "Native task navigation preserves every query");
      };
      const clickTask = async (name: string, hash: string, focusId: string) => { await task(name).click(); await waitHash(hash, name, focusId); };
      const expand = async (id: string, link: Locator) => { await link.click(); await page.locator(`#${id}[data-collapsed="false"]`).waitFor(); await settle(); };
      const recipientIdentities = () => page.locator('#teacher-roster input[type="checkbox"]:checked').evaluateAll(items => items.map(item => item.getAttribute("aria-label")).sort());
      const headers: Array<Record<string, unknown>> = [];
      const measureHeader = async (id: string) => {
        const geometry = await page.locator(`#${id} > [data-slot="card-header"]`).evaluate(header => {
          const title = header.querySelector("h2")!.getBoundingClientRect(), button = header.querySelector("button[aria-expanded]")!.getBoundingClientRect();
          return { height: header.getBoundingClientRect().height, toggleHeight: button.height, toggleWidth: button.width, titleTop: title.top, toggleTop: button.top, overflow: Math.max(0, header.scrollWidth - header.clientWidth) };
        });
        assert.ok(geometry.toggleWidth >= 44 && geometry.toggleHeight >= 44);
        assert.ok(geometry.toggleWidth <= 48 && geometry.toggleHeight <= 48, "Decorative disclosure icon keeps a 44px touch target as text grows");
        if (zoom === 200) assert.ok(geometry.height < 500, "Compact heading must not consume the entire enlarged-text viewport");
        assert.ok(Math.abs(geometry.titleTop - geometry.toggleTop) <= 4, "Title and disclosure share a row instead of consuming separate rows");
        assert.equal(geometry.overflow, 0); headers.push({ id, ...geometry });
        await page.screenshot({ path: resolve(output, `${width}-${zoom}-${id}.png`) });
      };
      try {
        await page.goto(`${base}${teacher}#teacher-quick-log`, { waitUntil: "networkidle" });
        await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
        // Next's development indicator overlaps the first fixed nav item; it is
        // not shipped UI. Client exceptions remain a separate hard failure.
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await page.locator('#teacher-daily-report[data-collapsed="false"]').waitFor();
        await page.evaluate(value => { document.documentElement.style.fontSize = `${value}%`; }, zoom); await settle();
        await waitHash("#teacher-quick-log", "Log", "teacher-quick-log");
        assert.equal(await page.evaluate(() => localStorage.getItem("bee-suite:collapsed:teacher-daily-report")), "1", "Navigation expansion does not overwrite preference");
        await page.getByRole("button", { name: "Collapse Daily Report", exact: true }).click();
        await clickTask("Log", "#teacher-quick-log", "teacher-quick-log");
        await page.locator('#teacher-daily-report[data-collapsed="false"]').waitFor();
        await page.locator("#teacher-note-for-parents").fill("Fake daily-report draft retained");
        const recipients = await recipientIdentities(); assert.deepEqual(recipients, ["Include Ava Rivera in daily report batch"]);
        await clickTask("Roster", "#teacher-roster", "teacher-roster");
        await measureHeader("teacher-roster");
        await clickTask("Today", "#teacher-home-heading", "teacher-home-heading");
        await expand("teacher-daily-report", page.getByRole("link", { name: "Write daily report", exact: true }));
        await waitHash("#teacher-daily-report", "Log", "teacher-daily-report");
        await page.evaluate(() => history.back()); await waitHash("#teacher-home-heading", "Today", "teacher-home-heading");
        await page.evaluate(() => history.forward()); await waitHash("#teacher-daily-report", "Log", "teacher-daily-report");
        assert.equal(await page.locator("#teacher-note-for-parents").inputValue(), "Fake daily-report draft retained");
        assert.deepEqual(await recipientIdentities(), recipients);

        // The real Base UI menu closes before focus settles on the native target.
        const account = page.getByRole("button", { name: "Open account menu", exact: true });
        const profileMenuItem = page.getByRole("menuitem", { name: "Profile settings", exact: true });
        await account.click(); await profileMenuItem.click();
        await profileMenuItem.waitFor({ state: "hidden" });
        await waitHash("#teacher-profile-setup", null, "teacher-profile-setup");
        await measureHeader("teacher-profile-setup");
        await page.locator("#teacher-profile-name").fill("Fake retained teacher name");
        await account.click(); await profileMenuItem.waitFor(); await settle(); await page.keyboard.press("Escape"); await profileMenuItem.waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open account menu");
        await clickTask("Today", "#teacher-home-heading", "teacher-home-heading");
        await account.focus(); await page.keyboard.press("Enter"); await profileMenuItem.waitFor();
        await profileMenuItem.focus(); await page.keyboard.press("Enter"); await profileMenuItem.waitFor({ state: "hidden" });
        await waitHash("#teacher-profile-setup", null, "teacher-profile-setup");
        await clickTask("Today", "#teacher-home-heading", "teacher-home-heading");
        await expand("teacher-photo", page.getByRole("link", { name: "Share photo", exact: true }));
        await waitHash("#teacher-photo", "Log", "teacher-photo");
        await measureHeader("teacher-photo");
        await page.getByRole("textbox", { name: "Photo caption for parents", exact: true }).fill("Fake retained photo caption");

        // Cancel a real Next cross-page click without changing history or drafts.
        const currentUrl = page.url(), historyLength = await page.evaluate(() => history.length);
        const dialog = page.waitForEvent("dialog"), nextClick = page.getByRole("link", { name: "Fake parent destination", exact: true }).click();
        const prompt = await dialog; assert.match(prompt.message(), /unsaved profile or classroom drafts/); await prompt.dismiss(); await nextClick; await settle();
        assert.equal(page.url(), currentUrl); assert.equal(await page.evaluate(() => history.length), historyLength);
        assert.equal(await page.getByRole("textbox", { name: "Photo caption for parents", exact: true }).inputValue(), "Fake retained photo caption");
        assert.equal(await page.locator("#teacher-profile-name").inputValue(), "Fake retained teacher name");
        assert.equal(await page.locator("#teacher-note-for-parents").inputValue(), "Fake daily-report draft retained");
        assert.deepEqual(await recipientIdentities(), recipients);
        await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".app-bottom-navigation a"));
          links.find(link => link.textContent?.trim() === "Log")!.click();
          links.find(link => link.textContent?.trim() === "Today")!.click();
        });
        await waitHash("#teacher-home-heading", "Today", "teacher-home-heading");
        await clickTask("Log", "#teacher-quick-log", "teacher-quick-log");
        const geometry = await nav.evaluate(element => ({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), links: Array.from(element.querySelectorAll("a")).map(link => ({ w: link.getBoundingClientRect().width, h: link.getBoundingClientRect().height })) }));
        assert.equal(geometry.overflow, 0); for (const link of geometry.links) assert.ok(link.w >= 44 && link.h >= 44, JSON.stringify(link));
        assert.equal(documents.length, 1, "Task changes never reload the document"); assert.deepEqual(unsafe, []); assert.deepEqual(errors, []);
        await page.screenshot({ path: resolve(output, `${width}-${zoom}-daily-report.png`) });
        // Establish a genuine cross-route history entry with a different hash,
        // then verify cancellation restores the exact existing entry.
        const leave = page.waitForEvent("dialog"), leaveClick = page.getByRole("link", { name: "Fake parent destination", exact: true }).click();
        await (await leave).accept(); await leaveClick;
        await page.waitForURL(`${base}/device-preview?view=parent&scenario=history-qa`);
        await page.locator('.bee-app-frame[data-role="PARENT_GUARDIAN"]').waitFor();
        await page.evaluate(() => { location.hash = "parent-home-heading"; });
        await page.waitForURL(`${base}/device-preview?view=parent&scenario=history-qa#parent-home-heading`);
        await page.getByRole("link", { name: "Fake teacher destination", exact: true }).click();
        const secondTeacher = `${base}/device-preview?view=teacher&scenario=history-qa`;
        await page.waitForURL(secondTeacher); await page.locator('.bee-app-frame[data-role="TEACHER"]').waitFor();
        await task("Log").click(); await page.waitForURL(`${secondTeacher}#teacher-quick-log`);
        await page.locator("#teacher-note-for-parents").fill("Fake cross-route history draft");
        const beforeBack = page.url(), beforeLength = await page.evaluate(() => history.length);
        const backDialog = page.waitForEvent("dialog"); await page.evaluate(() => history.go(-2));
        const backPrompt = await backDialog; assert.match(backPrompt.message(), /unsaved profile or classroom drafts/); await backPrompt.dismiss();
        await page.waitForURL(beforeBack); await settle();
        assert.equal(await page.locator("#teacher-note-for-parents").inputValue(), "Fake cross-route history draft");
        assert.equal(await page.evaluate(() => history.length), beforeLength);
        assert.equal(await task("Log").getAttribute("aria-current"), "page");
        const acceptedBack = page.waitForEvent("dialog"); await page.evaluate(() => history.go(-2)); await (await acceptedBack).accept();
        await page.waitForURL(`${base}/device-preview?view=parent&scenario=history-qa#parent-home-heading`);
        await page.locator('.bee-app-frame[data-role="PARENT_GUARDIAN"]').waitFor();
        assert.equal(documents.length, 1); assert.deepEqual(unsafe, []); assert.deepEqual(errors, []);
        results.push({ width, zoom, motion, headers, passed: true, documentNavigations: documents.length, draftTypesRetained: 3, exactRecipientsRetained: true, keyboardProfile: true, crossRouteHistory: true, unsafeRequests: 0, clientErrors: 0 });
      } catch (error) {
        await page.screenshot({ path: resolve(output, `${width}-${zoom}-failure.png`) });
        console.error(JSON.stringify({ width, zoom, url: page.url(), errors, unsafe, focus: await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("aria-label")) }));
        throw error;
      } finally { await context.close(); }
    }
    await writeFile(resolve(output, "results.json"), JSON.stringify({ engine, checkedAt: new Date().toISOString(), passed: true, results }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, cases: results.length }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
