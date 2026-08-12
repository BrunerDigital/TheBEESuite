import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Page, type Request } from "playwright";
import { assertNonProductionBaseUrl, QA_TARGET_VIEWPORTS } from "./qa-standards";

type PreviewRoute = {
  id: string;
  path: string;
  preferredViewport: string;
};

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

const baseUrl = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:3210"));
const outputDirectory = resolve(argument("--output-dir", `outputs/qa/device-preview-${Date.now()}`));
const fullMatrix = hasFlag("--full-matrix");
const routeFilter = new Set(argument("--route", "").split(",").map((value) => value.trim()).filter(Boolean));
const viewportFilter = new Set(argument("--viewport", "").split(",").map((value) => value.trim()).filter(Boolean));

const routes: PreviewRoute[] = [
  { id: "director", path: "/device-preview?view=director", preferredViewport: "desktop-1440" },
  { id: "teacher", path: "/device-preview?view=teacher", preferredViewport: "phone-390" },
  { id: "executive", path: "/device-preview?view=executive", preferredViewport: "desktop-1440" },
  { id: "regional", path: "/device-preview?view=regional", preferredViewport: "desktop-1440" },
  { id: "billing", path: "/device-preview?view=billing", preferredViewport: "desktop-1440" },
  { id: "auditor", path: "/device-preview?view=auditor", preferredViewport: "desktop-1440" },
  { id: "pickup", path: "/device-preview?view=pickup", preferredViewport: "phone-390" },
  { id: "workflow", path: "/device-preview?view=workflow", preferredViewport: "desktop-1440" },
  { id: "family-kiosk", path: "/device-preview?view=kiosk", preferredViewport: "tablet-landscape-1024" },
  { id: "staff-kiosk", path: "/device-preview?view=kiosk-staff", preferredViewport: "tablet-landscape-1024" },
  { id: "parent-home", path: "/device-preview?view=parent&screen=home", preferredViewport: "phone-390" },
  { id: "parent-updates", path: "/device-preview?view=parent&screen=updates", preferredViewport: "phone-390" },
  { id: "parent-messages", path: "/device-preview?view=parent&screen=messages", preferredViewport: "phone-390" },
  { id: "parent-payments", path: "/device-preview?view=parent&screen=payments", preferredViewport: "phone-390" },
  { id: "parent-family", path: "/device-preview?view=parent&screen=family", preferredViewport: "phone-390" },
  { id: "parent-children", path: "/device-preview?view=parent&screen=family&section=children", preferredViewport: "phone-390" },
  { id: "parent-check-in", path: "/device-preview?view=parent&screen=family&section=check-in", preferredViewport: "phone-390" },
  { id: "parent-documents", path: "/device-preview?view=parent&screen=family&section=documents", preferredViewport: "phone-390" },
  { id: "parent-profile", path: "/device-preview?view=parent&screen=family&section=profile", preferredViewport: "phone-390" },
  { id: "parent-notifications", path: "/device-preview?view=parent&screen=family&section=notifications", preferredViewport: "phone-390" },
];

for (const routeId of routeFilter) {
  if (!routes.some((route) => route.id === routeId)) throw new Error(`Unknown preview route filter: ${routeId}`);
}
for (const viewportId of viewportFilter) {
  if (!QA_TARGET_VIEWPORTS.some((viewport) => viewport.id === viewportId)) throw new Error(`Unknown viewport filter: ${viewportId}`);
}

const coreResponsiveRoutes = new Set(["director", "teacher", "pickup", "workflow", "family-kiosk", "staff-kiosk", "parent-home"]);

async function main() {
const browser = await chromium.launch();
const results: Array<Record<string, unknown>> = [];

function requestProblem(request: Request) {
  const url = new URL(request.url());
  const base = new URL(baseUrl);
  const method = request.method().toUpperCase();

  if (method !== "GET") return `${method} ${url.href}`;
  if (url.origin !== base.origin) return `external GET ${url.href}`;
  if (url.pathname.startsWith("/api/")) return `API GET ${url.pathname}`;
  return null;
}

async function pageMetrics(page: Page) {
  return page.evaluate(() => {
    const interactive = Array.from(document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[role='button'],[role='switch'],[role='checkbox'],[role='combobox']"));
    const clipped = interactive.filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.visibility === "hidden" || style.display === "none" || box.width === 0 || box.height === 0) return false;
      if (box.left >= -1 && box.right <= window.innerWidth + 1) return false;
      let ancestor = element.parentElement;
      while (ancestor) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (["auto", "scroll"].includes(ancestorStyle.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
    const unnamed = interactive.filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.visibility === "hidden" || style.display === "none" || box.width === 0 || box.height === 0) return false;
      if (element.getAttribute("aria-hidden") === "true" || element.closest("[inert]")) return false;
      if (element.matches("input[type='hidden']")) return false;
      if (element.id.includes("-hidden-input")) return false;
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      const inputLabel = element.id
        ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`)?.textContent
        : "";
      const wrappingLabel = element.closest("label")?.textContent;
      const name = [
        element.getAttribute("aria-label"),
        labelledText,
        inputLabel,
        wrappingLabel,
        element.getAttribute("title"),
        element.getAttribute("alt"),
        element.textContent,
      ].find((value) => value?.trim());
      return !name;
    });
    const escapingLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .filter((anchor) => {
        const style = getComputedStyle(anchor);
        const box = anchor.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
      })
      .map((anchor) => anchor.getAttribute("href") ?? "")
      .filter((href) => {
        if (!href || href.startsWith("#")) return false;
        const url = new URL(href, window.location.href);
        return url.origin !== window.location.origin || url.pathname !== "/device-preview";
      });
    const undersized = interactive.filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.visibility === "hidden" || style.display === "none" || box.width === 0 || box.height === 0) return false;
      if (element.getAttribute("aria-hidden") === "true" || element.closest("[inert]")) return false;
      if (element.classList.contains("sr-only") || style.clip !== "auto") return false;
      if (element.id.includes("-hidden-input")) return false;
      if (element.tagName === "INPUT" && box.width <= 1 && box.height <= 1) return false;
      const associatedLabel = element.closest("label")
        ?? (element.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`) : null);
      if (associatedLabel) {
        const labelBox = associatedLabel.getBoundingClientRect();
        if (labelBox.width >= 24 && labelBox.height >= 24) return false;
      }
      return box.width < 24 || box.height < 24;
    });
    const firstSection = document.querySelector<HTMLElement>("main section");
    const firstSectionStyle = firstSection ? getComputedStyle(firstSection) : null;
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
      title: document.title,
      meaningfulText: (document.querySelector("main")?.textContent || document.body.textContent || "").trim().length,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      clippedInteractiveElements: clipped.map((element) => ({
        tag: element.tagName.toLocaleLowerCase(),
        id: element.id || null,
        role: element.getAttribute("role"),
        text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || null,
        href: element.getAttribute("href"),
        box: {
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height),
        },
      })),
      unnamedInteractiveElements: unnamed.map((element) => ({
        tag: element.tagName.toLocaleLowerCase(),
        id: element.id || null,
        role: element.getAttribute("role"),
        type: element.getAttribute("type"),
        className: element.className,
      })),
      undersizedInteractiveElements: undersized.map((element) => ({
        tag: element.tagName.toLocaleLowerCase(),
        id: element.id || null,
        role: element.getAttribute("role"),
        text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || null,
        box: {
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height),
        },
      })),
      escapingLinks: [...new Set(escapingLinks)].sort(),
      headingCount: headingOutline.length,
      headingOutline,
      headingLevelProblems,
      hasPreviewGuard: Boolean(document.querySelector('[data-device-preview-guard="true"]')),
      firstSectionBackgroundImage: firstSectionStyle?.backgroundImage ?? null,
      firstSectionBackdropFilter: firstSectionStyle?.backdropFilter ?? null,
    };
  });
}

try {
  for (const viewport of QA_TARGET_VIEWPORTS.filter((candidate) => !viewportFilter.size || viewportFilter.has(candidate.id))) {
    const selectedRoutes = routes.filter((route) => !routeFilter.size || routeFilter.has(route.id));
    const viewportRoutes = fullMatrix || routeFilter.size
      ? selectedRoutes
      : selectedRoutes.filter((route) => coreResponsiveRoutes.has(route.id) || route.preferredViewport === viewport.id);

    for (const route of viewportRoutes) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const consoleErrors: string[] = [];
      const requestProblems: string[] = [];
      const pageErrors: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("/_next/webpack-hmr")) consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", async (routeHandler) => {
        const problem = requestProblem(routeHandler.request());
        if (problem) {
          requestProblems.push(problem);
          await routeHandler.abort("blockedbyclient");
          return;
        }
        await routeHandler.continue();
      });

      const startedAt = performance.now();
      const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle", timeout: 30_000 });
      await page.locator('html[data-device-preview-hydrated="true"]').waitFor({
        state: "attached",
        timeout: 10_000,
      });
      const metrics = await pageMetrics(page);
      const screenshot = resolve(outputDirectory, `${viewport.id}__${route.id}.png`);
      await mkdir(dirname(screenshot), { recursive: true });
      await page.screenshot({ path: screenshot, fullPage: true });
      const passed = Boolean(response && response.status() === 200)
        && metrics.meaningfulText > 0
        && metrics.horizontalOverflowPx === 0
        && metrics.clippedInteractiveElements.length === 0
        && metrics.unnamedInteractiveElements.length === 0
        && metrics.undersizedInteractiveElements.length === 0
        && metrics.escapingLinks.length === 0
        && metrics.headingLevelProblems.length === 0
        && metrics.hasPreviewGuard
        && (!metrics.firstSectionBackgroundImage || metrics.firstSectionBackgroundImage === "none")
        && (!metrics.firstSectionBackdropFilter || metrics.firstSectionBackdropFilter === "none")
        && requestProblems.length === 0
        && consoleErrors.length === 0
        && pageErrors.length === 0;

      results.push({
        viewport,
        route,
        status: response?.status() ?? 0,
        routeReadyMs: Math.round(performance.now() - startedAt),
        metrics,
        requestProblems,
        consoleErrors,
        pageErrors,
        screenshot,
        passed,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  baseUrl,
  nonProductionGuard: true,
  fullMatrix,
  checks: results.length,
  passed: results.length > 0 && results.every((result) => result.passed),
  results,
};
const reportPath = resolve(outputDirectory, "results.json");
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  reportPath,
  passed: report.passed,
  checks: report.checks,
  failures: results.filter((result) => !result.passed).map((result) => ({
    viewport: result.viewport,
    route: result.route,
    metrics: result.metrics,
    requestProblems: result.requestProblems,
    consoleErrors: result.consoleErrors,
    pageErrors: result.pageErrors,
  })),
}, null, 2));
if (!results.length) console.error("UI preview QA selected zero checks.");
if (!report.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
