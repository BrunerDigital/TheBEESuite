import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Page, type Request } from "playwright";
import { SYNTHETIC_ROLE_QA_ACCOUNTS } from "@/lib/synthetic-role-qa";

type Viewport = { id: "desktop" | "mobile"; width: number; height: number };
type Workflow = { id: string; href: string };

const viewports: readonly Viewport[] = [
  { id: "desktop", width: 1440, height: 1000 },
  { id: "mobile", width: 390, height: 844 },
];

const workflows: Record<(typeof SYNTHETIC_ROLE_QA_ACCOUNTS)[number]["key"], readonly Workflow[]> = {
  executive: [
    { id: "schools", href: "/multi-location-dashboard" },
    { id: "reporting", href: "/analytics" },
  ],
  director: [
    { id: "classrooms", href: "/classroom-dashboard" },
    { id: "enrollment", href: "/crm-leads" },
  ],
  billing: [
    { id: "invoices", href: "/billing-invoices" },
    { id: "communications", href: "/messages" },
  ],
  teacher: [
    { id: "roster", href: "/teacher-portal#teacher-roster" },
    { id: "quick-log", href: "/teacher-portal#teacher-quick-log" },
  ],
  parent: [
    { id: "updates", href: "/parent-portal?view=updates" },
    { id: "documents", href: "/parent-portal?view=family&section=documents" },
  ],
};

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function cleanBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Credentialed role QA requires HTTPS except on localhost.");
  }
  const productionHost = url.hostname === "thebeesuite.io" || url.hostname === "www.thebeesuite.io";
  if (productionHost && process.env.ALLOW_SYNTHETIC_ROLE_QA_PRODUCTION_LOGIN !== "true") {
    throw new Error("Set ALLOW_SYNTHETIC_ROLE_QA_PRODUCTION_LOGIN=true for the canonical production host.");
  }
  return url.toString().replace(/\/$/, "");
}

const baseUrl = cleanBaseUrl(argument("--base-url", "https://thebeesuite.io"));
const outputDirectory = resolve(argument("--output-dir", `output/playwright/credentialed-role-${Date.now()}`));
const password = process.env.SYNTHETIC_ROLE_QA_PASSWORD?.trim() || process.env.DEMO_PASSWORD?.trim() || "";
if (!password) throw new Error("SYNTHETIC_ROLE_QA_PASSWORD (or DEMO_PASSWORD) is required.");

function safePath(value: string) {
  const url = new URL(value, baseUrl);
  return `${url.pathname}${url.search}${url.hash}`;
}

function matchesWorkflow(actual: string, expected: string) {
  const actualUrl = new URL(actual, baseUrl);
  const expectedUrl = new URL(expected, baseUrl);
  return actualUrl.pathname === expectedUrl.pathname
    && actualUrl.search === expectedUrl.search
    && actualUrl.hash === expectedUrl.hash;
}

function requestProblem(request: Request) {
  const method = request.method().toUpperCase();
  const url = new URL(request.url());
  const base = new URL(baseUrl);
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
  if (url.origin !== base.origin) return null;
  if (method === "POST" && url.origin === base.origin && url.pathname === "/api/auth/login") return null;
  if (method === "POST" && url.origin === base.origin && url.pathname === "/api/device-sessions") return null;
  return `${method} ${url.pathname}`;
}

function httpErrorLabel(response: { status(): number; url(): string; request(): Request }) {
  const request = response.request();
  const url = new URL(response.url());
  let source = "";
  if (url.pathname === "/_next/image") {
    const requestedImage = url.searchParams.get("url");
    if (requestedImage) {
      try {
        const imageUrl = new URL(requestedImage, baseUrl);
        source = ` source=${imageUrl.origin === new URL(baseUrl).origin ? imageUrl.pathname : `${imageUrl.hostname}${imageUrl.pathname}`}`;
      } catch {
        source = " source=invalid";
      }
    }
  }
  return `${request.method().toUpperCase()} ${url.pathname} ${response.status()}${source}`;
}

type PageMetricsResult = {
  title: string;
  pathname: string;
  meaningfulText: number;
  h1Count: number;
  headings: Array<{ level: number; text: string }>;
  activeNavigation: string[];
  horizontalOverflowPx: number;
  clippedInteractiveElements: Array<{ name: string; tag: string }>;
  unnamedInteractiveElements: Array<{ tag: string; type: string | null }>;
  undersizedInteractiveCount: number;
  disclosureCount: number;
  links: Array<{ name: string; href: string }>;
};

async function pageMetrics(page: Page) {
  return page.evaluate<PageMetricsResult>(`(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return element.getAttribute("aria-hidden") !== "true"
        && !element.closest("[inert]")
        && style.visibility !== "hidden"
        && style.display !== "none"
        && box.width > 0
        && box.height > 0;
    };
    const nameFor = (element) => {
      const labelledBy = element.getAttribute("aria-labelledby")
        ?.split(/\\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      const label = element.id
        ? document.querySelector("label[for=\\\"" + CSS.escape(element.id) + "\\\"]")?.textContent
        : "";
      return [
        element.getAttribute("aria-label"),
        labelledBy,
        label,
        element.closest("label")?.textContent,
        element.getAttribute("title"),
        element.textContent,
      ].find((value) => value?.trim())?.trim().replace(/\\s+/g, " ") ?? "";
    };
    const interactive = Array.from(document.querySelectorAll("a[href],button,input,select,textarea,summary,[role='button'],[role='switch'],[role='checkbox'],[role='combobox']"));
    const visible = interactive.filter(isVisible);
    const clipped = visible.filter((element) => {
      const box = element.getBoundingClientRect();
      if (box.left >= -1 && box.right <= window.innerWidth + 1) return false;
      let ancestor = element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (["auto", "scroll"].includes(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
    const unnamed = visible.filter((element) => {
      if (element.matches("input[type='hidden']") || element.id.includes("-hidden-input")) return false;
      return !nameFor(element);
    });
    const undersized = visible.filter((element) => {
      if (element.matches("input[type='hidden']") || element.id.includes("-hidden-input")) return false;
      const box = element.getBoundingClientRect();
      const label = element.closest("label")
        ?? (element.id ? document.querySelector("label[for=\\\"" + CSS.escape(element.id) + "\\\"]") : null);
      const target = label?.getBoundingClientRect() ?? box;
      return target.width < 44 || target.height < 44;
    });
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(isVisible)
      .map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim().replace(/\\s+/g, " ").slice(0, 100) || "" }));
    const active = Array.from(document.querySelectorAll("[aria-current='page'],[aria-current='true'],[data-active='true']"))
      .filter(isVisible)
      .map(nameFor)
      .filter(Boolean);
    return {
      title: document.title,
      pathname: location.pathname + location.search + location.hash,
      meaningfulText: (document.querySelector("main")?.textContent || document.body.textContent || "").trim().length,
      h1Count: headings.filter((heading) => heading.level === 1).length,
      headings,
      activeNavigation: [...new Set(active)].slice(0, 8),
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      clippedInteractiveElements: clipped.map((element) => ({ name: nameFor(element).slice(0, 80), tag: element.tagName.toLowerCase() })).slice(0, 20),
      unnamedInteractiveElements: unnamed.map((element) => ({ tag: element.tagName.toLowerCase(), type: element.getAttribute("type") })).slice(0, 20),
      undersizedInteractiveCount: undersized.length,
      disclosureCount: document.querySelectorAll("main details, main summary, main [aria-expanded]").length,
      links: Array.from(document.querySelectorAll("main a[href]"))
        .filter(isVisible)
        .map((anchor) => ({ name: nameFor(anchor).slice(0, 80), href: anchor.getAttribute("href") ?? "" }))
        .filter((link) => link.name && link.href)
        .slice(0, 60),
    };
  })()`);
}

async function keyboardProbe(page: Page) {
  await page.locator("body").press("Home").catch(() => undefined);
  for (let index = 0; index < 8; index += 1) await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return { focused: false, name: "", visibleIndicator: false };
    const style = getComputedStyle(element);
    const name = element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || element.id || element.tagName;
    return {
      focused: true,
      name: name.trim().replace(/\\s+/g, " ").slice(0, 100),
      visibleIndicator: style.outlineStyle !== "none" || style.boxShadow !== "none",
    };
  });
}

async function disclosureProbe(page: Page) {
  const control = page.locator("main button[aria-expanded]:visible, main summary:visible").first();
  if (!await control.count()) return { available: false };
  const before = await control.getAttribute("aria-expanded") ?? await control.evaluate((element) => element.closest("details")?.hasAttribute("open") ? "true" : "false");
  await control.click();
  const after = await control.getAttribute("aria-expanded") ?? await control.evaluate((element) => element.closest("details")?.hasAttribute("open") ? "true" : "false");
  await control.click().catch(() => undefined);
  return { available: true, before, after, toggled: before !== after };
}

async function visit(page: Page, href: string) {
  const response = await page.goto(`${baseUrl}${href}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  if (response) return response.status();
  return matchesWorkflow(page.url(), href) ? 200 : 0;
}

async function clickWorkflowLink(page: Page, href: string) {
  const target = new URL(href, baseUrl);
  const links = page.locator("a[href]");
  for (let index = 0; index < await links.count(); index += 1) {
    const candidate = links.nth(index);
    if (!await candidate.isVisible().catch(() => false)) continue;
    const value = await candidate.getAttribute("href");
    if (!value) continue;
    const resolved = new URL(value, page.url());
    if (resolved.pathname !== target.pathname) continue;
    if (target.search && resolved.search !== target.search) continue;
    if (target.hash && resolved.hash !== target.hash) continue;
    await candidate.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    return { clicked: true, actual: safePath(page.url()) };
  }
  return { clicked: false, actual: safePath(page.url()) };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch();
  const results: Array<Record<string, unknown>> = [];

  try {
    for (const account of SYNTHETIC_ROLE_QA_ACCOUNTS) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", colorScheme: "light" });
      if (["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname)) {
        await context.route("**/_vercel/**/script.js", (route) => route.fulfill({ status: 204, contentType: "application/javascript" }));
      }
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("/_next/webpack-hmr")) consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("response", (response) => {
        if (response.status() < 400) return;
        const url = new URL(response.url());
        const base = new URL(baseUrl);
        if (url.origin !== base.origin) return;
        httpErrors.push(httpErrorLabel(response));
      });
      page.on("request", (request) => {
        const problem = requestProblem(request);
        if (problem) unsafeRequests.push(problem);
      });

      await visit(page, account.loginPath);
      await page.locator("#email").fill(account.email);
      await page.locator("#password").fill(password);
      await page.locator("button[type='submit']").click();
      await page.waitForURL((url) => !["/login", "/parents", "/teachers", "/directors", "/executives"].includes(url.pathname), { timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      if (/Login failed|Invalid email or password|not active/i.test(await page.locator("body").innerText())) {
        throw new Error(`${account.key} credentialed login failed.`);
      }

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const status = await visit(page, account.landingPath);
        const metrics = await pageMetrics(page);
        const keyboard = await keyboardProbe(page);
        const disclosure = await disclosureProbe(page);
        const screenshot = resolve(outputDirectory, account.key, viewport.id, "landing.png");
        await mkdir(dirname(screenshot), { recursive: true });
        await page.screenshot({ path: screenshot, fullPage: true });

        const primary = workflows[account.key][0];
        const click = await clickWorkflowLink(page, primary.href);
        const clickedPath = safePath(page.url());
        if (click.clicked) {
          await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
          await page.waitForTimeout(300);
        }
        const back = click.clicked ? safePath(page.url()) : null;
        if (click.clicked) {
          await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => null);
          await page.waitForTimeout(300);
        }
        const forward = click.clicked ? safePath(page.url()) : null;
        const primaryScreenshot = resolve(outputDirectory, account.key, viewport.id, `${primary.id}.png`);
        await mkdir(dirname(primaryScreenshot), { recursive: true });
        await page.screenshot({ path: primaryScreenshot, fullPage: true });

        const secondary = workflows[account.key][1];
        const secondaryStatus = await visit(page, secondary.href);
        const secondaryMetrics = await pageMetrics(page);
        const secondaryScreenshot = resolve(outputDirectory, account.key, viewport.id, `${secondary.id}.png`);
        await mkdir(dirname(secondaryScreenshot), { recursive: true });
        await page.screenshot({ path: secondaryScreenshot, fullPage: true });

        const passed = status > 0 && status < 500
          && secondaryStatus > 0 && secondaryStatus < 500
          && !safePath(page.url()).startsWith(account.loginPath)
          && metrics.meaningfulText > 0
          && metrics.h1Count === 1
          && metrics.horizontalOverflowPx === 0
          && metrics.clippedInteractiveElements.length === 0
          && metrics.unnamedInteractiveElements.length === 0
          && keyboard.focused
          && keyboard.visibleIndicator
          && (!disclosure.available || disclosure.toggled)
          && click.clicked
          && matchesWorkflow(clickedPath, primary.href)
          && Boolean(back && matchesWorkflow(back, account.landingPath))
          && Boolean(forward && matchesWorkflow(forward, primary.href))
          && secondaryMetrics.meaningfulText > 0
          && secondaryMetrics.horizontalOverflowPx === 0;

        results.push({
          role: account.key,
          viewport,
          landing: account.landingPath,
          status,
          metrics,
          keyboard,
          disclosure,
          primaryWorkflow: { ...primary, ...click, clickedPath, back, forward, screenshot: primaryScreenshot },
          secondaryWorkflow: { ...secondary, status: secondaryStatus, metrics: secondaryMetrics, screenshot: secondaryScreenshot },
          screenshot,
          passed,
        });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const unexpectedWrites = [...unsafeRequests];
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    accountSet: "isolated synthetic role QA",
    results,
    writeAudit: { allowed: ["POST /api/auth/login", "POST /api/device-sessions (session heartbeat)"], unexpectedWrites },
    httpErrors,
    consoleErrors,
    pageErrors,
    passed: results.length === SYNTHETIC_ROLE_QA_ACCOUNTS.length * viewports.length
      && results.every((result) => result.passed)
      && unexpectedWrites.length === 0
      && httpErrors.length === 0
      && consoleErrors.length === 0
      && pageErrors.length === 0,
  };
  const reportPath = resolve(outputDirectory, "results.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    reportPath,
    baseUrl,
    checks: results.length,
    passed: report.passed,
    failures: results.filter((result) => !result.passed).map((result) => ({
      role: result.role,
      viewport: result.viewport,
      landing: result.landing,
      metrics: result.metrics,
      keyboard: result.keyboard,
      disclosure: result.disclosure,
      primaryWorkflow: result.primaryWorkflow,
      secondaryWorkflow: result.secondaryWorkflow,
    })),
    unexpectedWrites,
    httpErrors,
    consoleErrors,
    pageErrors,
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const unsafeRequests: string[] = [];
const httpErrors: string[] = [];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
