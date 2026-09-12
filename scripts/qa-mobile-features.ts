import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit, type Page } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

const argument = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith("--"), `${name} requires a value`);
  return value;
};
const base = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:3212"));
const output = resolve(argument("--output-dir", "output/playwright/mobile-features"));
const engine = argument("--browser", "chromium");
const widthOption = argument("--width", "all");
const theme = argument("--theme", "light");
const screens = ["home", "updates", "messages", "payments", "children", "check-in", "documents", "billing", "profile", "notifications", "teacher"];
const screenOption = argument("--screen", "all");
assert.ok(["chromium", "webkit"].includes(engine), "Unsupported browser");
assert.ok(["all", "320", "390", "768", "1024"].includes(widthOption), "Unsupported width");
assert.ok(["light", "dark"].includes(theme), "Unsupported theme");
assert.ok(screenOption === "all" || screens.includes(screenOption), "Unsupported screen");

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function layoutFindings(page: Page) {
  return page.evaluate(() => {
    const issues: unknown[] = [];
    if (document.documentElement.scrollWidth > innerWidth) issues.push({ pageOverflow: document.documentElement.scrollWidth - innerWidth });
    const navigation = document.querySelector<HTMLElement>(".app-bottom-navigation");
    const main = document.querySelector("main");
    if (navigation && main && navigation.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(main).paddingBottom)) {
      issues.push({ navigationClearance: "Bottom navigation exceeds the reserved content space" });
    }
    for (const element of document.querySelectorAll<HTMLElement>(":is(main,.app-header) :is(button,input,textarea,select,[role=combobox],summary), .app-bottom-navigation :is(a,button)")) {
      const box = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (box.width <= 1 || box.height <= 1 || style.clip !== "auto" || style.visibility === "hidden") continue;
      // Native input text can scroll horizontally inside its own field.
      const clippedText = !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) && element.scrollWidth > element.clientWidth + 3;
      if (box.left < -1 || box.right > innerWidth + 1 || clippedText) issues.push({
        id: element.id, slot: element.dataset.slot,
        label: (element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 100),
        left: box.left, right: box.right, width: box.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      });
    }
    return issues;
  });
}

async function openDetails(page: Page) {
  const summaries = page.locator("main details:not([open]) > summary:visible");
  for (let index = 0; index < 40 && await summaries.count(); index++) await summaries.first().click();
  assert.equal(await summaries.count(), 0, "Every visible details panel opened");
}

async function checkSelectors(page: Page) {
  let checked = 0;
  for (const trigger of await page.locator("main [role=combobox]:visible").all()) {
    if (await trigger.isDisabled()) continue;
    await trigger.click();
    const popup = page.locator('[data-slot="select-content"]:visible');
    await popup.waitFor();
    await settle(page);
    const bounds = await popup.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, viewport: innerWidth, clipped: element.scrollWidth > element.clientWidth + 3 };
    });
    assert.ok(bounds.left >= -1 && bounds.right <= bounds.viewport + 1 && !bounds.clipped, "Selector options remain inside the viewport");
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    checked++;
  }
  return checked;
}

async function checkHelp(page: Page) {
  let checked = 0;
  for (const trigger of await page.locator("main [data-info-tip-trigger]:visible").all()) {
    await trigger.click();
    const popup = page.locator("[data-info-tip-content]:visible");
    await popup.waitFor();
    await settle(page);
    const bounds = await popup.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight, clipped: element.scrollWidth > element.clientWidth + 3 };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height && !bounds.clipped, `Help stays readable within the viewport: ${JSON.stringify(bounds)}`);
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    assert.ok(await trigger.evaluate((element) => element === document.activeElement), "Help restores keyboard focus");
    await trigger.press("Enter");
    await popup.getByRole("button", { name: "Close information", exact: true }).click();
    await popup.waitFor({ state: "hidden" });
    checked++;
  }
  return checked;
}

async function main() {
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Array<Record<string, unknown>> = [];
  await mkdir(output, { recursive: true });
  try {
    for (const width of [320, 390, 768, 1024].filter((value) => widthOption === "all" || String(value) === widthOption)) {
      for (const zoom of [1, 2]) for (const screen of screens.filter((value) => screenOption === "all" || value === screenOption)) {
        const height = width === 320 ? 568 : width === 390 ? 844 : width === 768 ? 1024 : 768;
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme as "light" | "dark", reducedMotion: "reduce", serviceWorkers: "block" });
        await context.addInitScript((value) => localStorage.setItem("bee-suite-theme", value), theme);
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const unsafeRequests: string[] = [], pageErrors: string[] = [], findings: unknown[] = [];
        const result: Record<string, unknown> = { screen, width, zoom, engine, theme, unsafeRequests, pageErrors, findings };
        let stage = "load";
        page.on("pageerror", () => pageErrors.push("Uncaught client exception"));
        await context.route("**/*", (route) => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) {
            unsafeRequests.push(`${request.method()} ${url.pathname}`);
            return route.abort();
          }
          return route.continue();
        });
        try {
          const search = screen === "teacher" ? "view=teacher&scenario=long-content"
            : screen === "home" ? "view=parent&screen=home&scenario=single-review"
            : ["updates", "messages", "payments"].includes(screen) ? `view=parent&screen=${screen}&scenario=feature-stress`
              : `view=parent&screen=family&section=${screen}&scenario=feature-stress`;
          await page.goto(`${base}/device-preview?${search}`, { waitUntil: "networkidle", timeout: 60000 });
          await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
          await page.evaluate((value) => { document.documentElement.style.fontSize = `${value * 100}%`; }, zoom);
          stage = "expanded panels";
          await openDetails(page);
          if (screen === "teacher") {
            const toggles = page.locator('main [data-collapsible-card] button[aria-expanded="false"]:not([role="combobox"]):visible');
            for (let index = 0; index < 20 && await toggles.count(); index++) await toggles.first().click();
            assert.equal(await toggles.count(), 0);
            stage = "teacher draft tools";
            const report = page.locator("#teacher-daily-report");
            await report.getByRole("button", { name: "Add meal", exact: true }).click();
            await page.getByLabel("Meal 2 food and notes", { exact: true }).fill("Synthetic meal draft only. No records are saved.");
            await report.getByRole("button", { name: "Remove meal 2", exact: true }).click();
            assert.equal(await page.getByLabel("Meal 2 food and notes", { exact: true }).count(), 0);
            await report.getByRole("button", { name: "No nap today", exact: true }).last().click();
            await report.getByRole("button", { name: "Add nap", exact: true }).click();
            await page.getByLabel("Teacher note for parents", { exact: true }).fill("Synthetic classroom note for mobile layout verification.");
            result.teacherDrafts = "Meal add/remove, no-nap/nap recovery, parent note; no saves";
          }
          if (screen === "documents") {
            stage = "all available documents";
            assert.equal(await page.locator("[data-parent-document]").count(), 5);
            for (const count of [10, 12]) {
              const beforeIds = await page.locator("[data-parent-document]").evaluateAll((items) => items.map((item) => item.getAttribute("data-parent-document")));
              const button = page.getByRole("button", { name: "Show more documents", exact: true });
              await button.focus();
              await button.press("Enter");
              await page.waitForFunction((count) => document.querySelectorAll("[data-parent-document]").length === count, count);
              await settle(page);
              const afterIds = await page.locator("[data-parent-document]").evaluateAll((items) => items.map((item) => item.getAttribute("data-parent-document")));
              assert.equal(await page.evaluate(() => document.activeElement?.parentElement?.getAttribute("data-parent-document")), afterIds.find((id) => !beforeIds.includes(id)), "Continuation focuses the first newly revealed priority-ordered document");
            }
            assert.equal(await page.getByRole("button", { name: "Show more documents", exact: true }).count(), 0);
            const signature = page.locator('[data-parent-document="preview-document-1"]');
            await signature.getByLabel("Type your full name", { exact: true }).fill("Jordan Example");
            await signature.getByRole("checkbox").check();
            assert.equal(await signature.getByRole("button", { name: "Sign and Submit", exact: true }).isDisabled(), false);
            // Form state only: do not submit a signature or upload a record.
            result.documents = "5 → 10 → 12, keyboard continuation, signature draft; no submission";
          }
          if (screen === "messages") {
            stage = "message composer";
            await page.locator('[data-message-origin="school"]').last().getByRole("button", { name: "Reply", exact: true }).click();
            await page.getByRole("button", { name: "Cancel reply", exact: true }).click();
            await page.locator("#portal-message").fill("This is an unsent synthetic mobile message. ".repeat(8));
            await page.locator("#portal-message-attachments").setInputFiles({ name: "synthetic-classroom-note.txt", mimeType: "text/plain", buffer: Buffer.from("Fake attachment for UI checks only.") });
            await page.getByRole("button", { name: "Remove synthetic-classroom-note.txt", exact: true }).click();
            assert.equal(await page.getByRole("button", { name: "Send message", exact: true }).isDisabled(), false);
            result.messages = "Reply/cancel, long draft, local attachment/remove; no send";
          }
          stage = "layout";
          await settle(page);
          findings.push(...await layoutFindings(page));
          stage = "selectors";
          result.selectorsChecked = await checkSelectors(page);
          stage = "help popovers";
          result.helpChecked = await checkHelp(page);
          if (screen === "updates") assert.equal(await page.locator("#daily-reports").count(), 1, "Legacy report anchor stays unique");
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.screenshot({ path: resolve(output, `${engine}-${screen}-${width}-${zoom}-${theme}.png`), caret: "initial" });
          if (["updates", "documents"].includes(screen)) {
            stage = "empty state";
            await page.goto(`${base}/device-preview?view=parent&screen=${screen === "documents" ? "family&section=documents" : "updates"}&scenario=empty`, { waitUntil: "networkidle" });
            const label = screen === "documents" ? "No documents requested" : "No daily updates yet";
            assert.ok(await page.getByText(label, { exact: true }).isVisible());
            if (screen === "updates") assert.equal(await page.getByText("No updates for this date", { exact: true }).count(), 0);
            result.emptyState = label;
          }
        } catch (error) {
          findings.push({ stage, error: error instanceof Error ? error.message.slice(0, 1000) : String(error) });
          await page.screenshot({ path: resolve(output, `${engine}-${screen}-${width}-${zoom}-${theme}-failure.png`), caret: "initial" }).catch(() => {});
        } finally { await context.close(); }
        results.push(result);
        await writeFile(resolve(output, `${engine}-${widthOption}-${screenOption}-${theme}-results.json`), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
        console.log(JSON.stringify({ engine, screen, width, zoom, theme, findings: findings.length, unsafeRequests: unsafeRequests.length, pageErrors: pageErrors.length }));
      }
    }
    assert.ok(results.length > 0, "An empty feature audit cannot pass");
    assert.ok(results.every((row) => !(row.findings as unknown[]).length && !(row.unsafeRequests as unknown[]).length && !(row.pageErrors as unknown[]).length), "Inspect the mobile feature report");
  } finally { await browser.close(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
