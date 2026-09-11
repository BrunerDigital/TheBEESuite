import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import axe from "axe-core";
import { chromium, webkit } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";
import { readRenderedTextContrast } from "./qa-rendered-contrast";

const argument = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] || fallback;
};
const base = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:3210"));
const output = resolve(argument("--output-dir", "output/playwright/home-accessibility"));
const engine = argument("--browser", "chromium");

async function main() {
  assert.ok(["chromium", "webkit"].includes(engine));
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Array<Record<string, unknown>> = [];
  await mkdir(output, { recursive: true });
  try {
    const calibration = await browser.newPage();
    await calibration.setContent('<html style="background:white"><body><p id="black" style="color:black">Black</p><p id="gray" style="color:#777">Gray</p><p id="gold" style="color:#f0a800">Gold</p></body></html>');
    const black = await calibration.evaluate(readRenderedTextContrast, "#black");
    const gray = await calibration.evaluate(readRenderedTextContrast, "#gray");
    const gold = await calibration.evaluate(readRenderedTextContrast, "#gold");
    assert.ok(black.supported && Math.abs(black.ratio - 21) < 0.01);
    assert.ok(gray.supported && Math.abs(gray.ratio - 4.478) < 0.01 && gray.ratio < gray.required);
    assert.ok(gold.supported && gold.ratio < gold.required, "The supplemental check must reject the original low-contrast gold");
    await calibration.close();

    for (const width of [390, 1024]) for (const theme of ["light", "dark"] as const) for (const role of ["parent", "teacher", "director", "executive"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: "reduce", serviceWorkers: "block" });
      await context.addInitScript((theme) => localStorage.setItem("bee-suite-theme", theme), theme);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const unsafe: string[] = [];
      await page.route("**/*", (route) => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) {
          unsafe.push(`${request.method()} ${url.pathname}`);
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(`${base}/device-preview?view=${role}&scenario=long-content`, { waitUntil: "networkidle", timeout: 60000 });
      await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.addScriptTag({ content: axe.source });
      const audit = await page.evaluate(async () => {
        const engine = (window as unknown as { axe: typeof axe }).axe;
        const result = await engine.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } });
        return { version: result.testEngine.version, violations: result.violations, incomplete: result.incomplete, passedRuleCount: result.passes.length };
      });
      const supplemental = [];
      const unresolved = [];
      for (const finding of audit.incomplete) for (const node of finding.nodes) {
        // Only complete the known parser gap. Never silence other incomplete findings.
        if (finding.id === "color-contrast" && /Could not parse color string/.test(node.failureSummary ?? "") && node.target.length === 1 && typeof node.target[0] === "string") {
          const contrast = await page.evaluate(readRenderedTextContrast, node.target[0]);
          supplemental.push({ target: node.target, originalFailure: node.failureSummary, contrast });
          if (!contrast.supported || contrast.ratio < contrast.required) unresolved.push({ id: finding.id, target: node.target, contrast });
        } else unresolved.push({ id: finding.id, target: node.target, failure: node.failureSummary });
      }
      if (role === "parent") await page.getByRole("group", { name: "Children’s status today", exact: true }).waitFor();
      if (["director", "executive"].includes(role)) {
        await page.getByRole("group", { name: "Primary actions", exact: true }).waitFor();
        if (width < 1024) {
          const alerts = page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name: "Alerts", exact: true });
          await alerts.waitFor();
          const label = await alerts.locator("span").evaluate((el) => ({ height: el.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(el).lineHeight) }));
          assert.ok(label.height <= label.lineHeight + 1, "Alerts fits on one line at default phone text size");
        }
      }
      await page.screenshot({ path: resolve(output, `${engine}-${role}-${width}-${theme}.png`), caret: "initial" });
      results.push({ role, width, theme, unsafeRequests: unsafe, ...audit, supplemental, unresolved });
      console.log(JSON.stringify({ engine, role, width, theme, violations: audit.violations.length, supplemental: supplemental.length, unresolved: unresolved.length, unsafeRequests: unsafe.length }));
      await context.close();
    }
    await writeFile(resolve(output, `${engine}-results.json`), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
    assert.ok(results.every((row) => (row.violations as unknown[]).length === 0 && (row.unresolved as unknown[]).length === 0 && (row.unsafeRequests as unknown[]).length === 0), "Review the audit report: no violation, unreviewed incomplete result or API request may pass");
  } finally { await browser.close(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
