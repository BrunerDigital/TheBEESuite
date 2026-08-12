import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { assertNonProductionBaseUrl, QA_RECOMMENDED_THRESHOLDS, QA_TARGET_VIEWPORTS } from "./qa-standards";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const baseUrl = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:4177"));
const baseOrigin = new URL(baseUrl).origin;
const outputDirectory = resolve(argument("--output-dir", `outputs/qa/responsive-${Date.now()}`));
const routeFilter = new Set(argument("--route", "").split(",").map((value) => value.trim()).filter(Boolean));
const viewportFilter = new Set(argument("--viewport", "").split(",").map((value) => value.trim()).filter(Boolean));
const routes = [
  "/",
  "/app",
  "/login",
  "/forgot-password",
  "/registration",
  "/reset-password",
  "/parent-portal/setup",
  "/check-in",
  "/resources",
  "/support",
  "/privacy",
  "/terms",
  "/eula",
  "/payment-method-form/not-a-token",
  "/payment-method-form/r/not-a-code",
];

for (const routeValue of routeFilter) {
  if (!routes.some((route) => route === routeValue || route.slice(1) === routeValue)) throw new Error(`Unknown public route filter: ${routeValue}`);
}
for (const viewportId of viewportFilter) {
  if (!QA_TARGET_VIEWPORTS.some((viewport) => viewport.id === viewportId)) throw new Error(`Unknown viewport filter: ${viewportId}`);
}

async function main() {
  const browser = await chromium.launch();
  const results: Array<Record<string, unknown>> = [];

  try {
    for (const viewport of QA_TARGET_VIEWPORTS.filter((candidate) => !viewportFilter.size || viewportFilter.has(candidate.id))) {
      for (const route of routes.filter((candidate) => !routeFilter.size || routeFilter.has(candidate) || routeFilter.has(candidate.slice(1)))) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
        const errors: string[] = [];
        const blockedRequests: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error" && !message.text().includes("/_next/webpack-hmr")) errors.push(message.text());
        });
        await page.route("**/*", async (routeHandler) => {
          const request = routeHandler.request();
          const method = request.method().toUpperCase();
          const url = new URL(request.url());
          if (method !== "GET" || url.origin !== baseOrigin || url.pathname.startsWith("/api/")) {
            blockedRequests.push(`${method} ${request.url()}`);
            await routeHandler.abort("blockedbyclient");
            return;
          }
          await routeHandler.continue();
        });

        const startedAt = performance.now();
        let response = null;
        try {
          response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
          await page.waitForFunction(() => {
            const editableControls = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
            return editableControls.every((control) => Object.keys(control).some((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")));
          }, undefined, { timeout: 10_000 }).catch(() => undefined);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        const metrics = await page.evaluate(() => {
          const interactive = Array.from(document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[role='button'],[role='switch'],[role='checkbox'],[role='combobox']"));
          const visible = interactive.filter((element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return element.getAttribute("aria-hidden") !== "true"
              && !element.closest("[inert]")
              && style.visibility !== "hidden"
              && style.display !== "none"
              && box.width > 0
              && box.height > 0;
          });
          const clipped = visible.filter((element) => {
            const box = element.getBoundingClientRect();
            return box.left < -1 || box.right > window.innerWidth + 1;
          });
          const unnamed = visible.filter((element) => {
            if (element.matches("input[type='hidden']") || element.id.includes("-hidden-input")) return false;
            const labelledBy = element.getAttribute("aria-labelledby")
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ");
            const inputLabel = element.id
              ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`)?.textContent
              : "";
            return ![
              element.getAttribute("aria-label"),
              labelledBy,
              inputLabel,
              element.closest("label")?.textContent,
              element.getAttribute("title"),
              element.textContent,
            ].some((value) => value?.trim());
          });
          const headingOutline = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"))
            .filter((heading) => {
              const style = getComputedStyle(heading);
              return style.visibility !== "hidden" && style.display !== "none";
            })
            .map((heading) => ({
              level: Number(heading.tagName.slice(1)),
              text: heading.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) || "(empty heading)",
            }));
          const headingLevelProblems = headingOutline.flatMap((heading, index) => {
            if (index === 0 && heading.level !== 1) return [`First heading is h${heading.level}: ${heading.text}`];
            const previous = headingOutline[index - 1];
            return previous && heading.level > previous.level + 1
              ? [`Heading level skips from h${previous.level} to h${heading.level}: ${heading.text}`]
              : [];
          });
          return {
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            clippedInteractiveElements: clipped.map((element) => ({
              tag: element.tagName.toLowerCase(),
              id: element.id || null,
              role: element.getAttribute("role"),
              text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || null,
              box: {
                left: Math.round(element.getBoundingClientRect().left),
                right: Math.round(element.getBoundingClientRect().right),
              },
            })),
            unnamedInteractiveElements: unnamed.map((element) => ({
              tag: element.tagName.toLowerCase(),
              id: element.id || null,
              role: element.getAttribute("role"),
              type: element.getAttribute("type"),
              name: element.getAttribute("name"),
              tabIndex: element.tabIndex,
              ariaHidden: element.getAttribute("aria-hidden"),
              className: element.className,
              html: element.outerHTML.slice(0, 320),
            })),
            headingOutline,
            headingLevelProblems,
            meaningfulText: (document.querySelector("main")?.textContent || document.body.textContent || "").trim().length,
          };
        }).catch(() => ({
          scrollWidth: 0,
          viewportWidth: viewport.width,
          horizontalOverflowPx: Number.POSITIVE_INFINITY,
          clippedInteractiveElements: [{ error: "metrics unavailable" }],
          unnamedInteractiveElements: [{ error: "metrics unavailable" }],
          headingOutline: [],
          headingLevelProblems: [{ error: "metrics unavailable" }],
          meaningfulText: 0,
        }));
        const routeId = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
        const screenshot = resolve(outputDirectory, `${viewport.id}__${routeId}.png`);
        await mkdir(dirname(screenshot), { recursive: true });
        await page.screenshot({ path: screenshot, fullPage: true });
        const routeReadyMs = Math.round(performance.now() - startedAt);
        const passed = Boolean(response && response.ok()) &&
          metrics.meaningfulText > 0 &&
          metrics.horizontalOverflowPx <= QA_RECOMMENDED_THRESHOLDS.browser.horizontalOverflowPx &&
          metrics.clippedInteractiveElements.length <= QA_RECOMMENDED_THRESHOLDS.browser.clippedInteractiveElements &&
          metrics.unnamedInteractiveElements.length === 0 &&
          metrics.headingLevelProblems.length === 0 &&
          errors.length <= QA_RECOMMENDED_THRESHOLDS.browser.relevantConsoleErrors &&
          blockedRequests.length === 0;
        results.push({ viewport, route, status: response?.status() ?? 0, routeReadyMs, metrics, errors, blockedRequests, screenshot, passed });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), baseUrl, nonProductionGuard: true, results, passed: results.length > 0 && results.every((result) => result.passed) };
const reportPath = resolve(outputDirectory, "results.json");
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, passed: report.passed, checks: results.length, failures: results.filter((result) => !result.passed) }, null, 2));
  if (!results.length) console.error("Responsive QA selected zero checks.");
  if (!report.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
