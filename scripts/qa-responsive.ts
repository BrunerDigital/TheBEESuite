import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { assertNonProductionBaseUrl, QA_RECOMMENDED_THRESHOLDS, QA_TARGET_VIEWPORTS } from "./qa-standards";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const baseUrl = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:4177"));
const outputDirectory = resolve(argument("--output-dir", `outputs/qa/responsive-${Date.now()}`));
const routes = ["/", "/login", "/registration", "/check-in"];
const browser = await chromium.launch();
const results = [];

try {
  for (const viewport of QA_TARGET_VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    for (const route of routes) {
      const startedAt = performance.now();
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
      const metrics = await page.evaluate(() => {
        const interactive = Array.from(document.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[role='button']"));
        const clipped = interactive.filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && (box.left < 0 || box.right > window.innerWidth);
        }).length;
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          clippedInteractiveElements: clipped,
          meaningfulText: (document.querySelector("main")?.textContent || document.body.textContent || "").trim().length,
        };
      });
      const routeId = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
      const screenshot = resolve(outputDirectory, `${viewport.id}__${routeId}.png`);
      await mkdir(dirname(screenshot), { recursive: true });
      await page.screenshot({ path: screenshot, fullPage: true });
      const routeErrors = [...errors];
      errors.length = 0;
      const routeReadyMs = Math.round(performance.now() - startedAt);
      const passed = Boolean(response && response.status() < 500) &&
        metrics.meaningfulText > 0 &&
        metrics.horizontalOverflowPx <= QA_RECOMMENDED_THRESHOLDS.browser.horizontalOverflowPx &&
        metrics.clippedInteractiveElements <= QA_RECOMMENDED_THRESHOLDS.browser.clippedInteractiveElements &&
        routeErrors.length <= QA_RECOMMENDED_THRESHOLDS.browser.relevantConsoleErrors;
      results.push({ viewport, route, status: response?.status() ?? 0, routeReadyMs, metrics, errors: routeErrors, screenshot, passed });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), baseUrl, nonProductionGuard: true, results, passed: results.every((result) => result.passed) };
const reportPath = resolve(outputDirectory, "results.json");
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, passed: report.passed, checks: results.length, failures: results.filter((result) => !result.passed) }, null, 2));
if (!report.passed) process.exitCode = 1;

