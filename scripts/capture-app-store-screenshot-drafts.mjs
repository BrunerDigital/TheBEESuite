import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = process.env.APP_STORE_SCREENSHOT_OUTPUT_DIR || path.join(root, "output", "app-store");
const baseUrl = (process.env.APP_STORE_SCREENSHOT_BASE_URL || "http://localhost:4177").replace(/\/$/, "");
const cssViewport = { width: 430, height: 932 };
const deviceScaleFactor = 3;
const pixelDimensions = { width: cssViewport.width * deviceScaleFactor, height: cssViewport.height * deviceScaleFactor };

const captures = [
  { app: "parent", name: "01-family-home.png", path: "/device-preview?view=parent&screen=home", caption: "Your family day at a glance" },
  { app: "parent", name: "02-daily-updates.png", path: "/device-preview?view=parent&screen=updates", caption: "Daily reports, meals, naps, and activities" },
  { app: "parent", name: "03-messages.png", path: "/device-preview?view=parent&screen=messages", caption: "Private communication with your school", resetSelector: 'ol[aria-label^="Messages with"]' },
  { app: "parent", name: "04-payments.png", path: "/device-preview?view=parent&screen=payments", caption: "Tuition and payment history in one place" },
  { app: "parent", name: "05-documents.png", path: "/device-preview?view=parent&screen=family&section=documents", caption: "Family documents and acknowledgements" },
  { app: "teacher", name: "01-classroom-today.png", path: "/device-preview?view=teacher&screen=home", caption: "The classroom day at a glance" },
  { app: "teacher", name: "02-roster.png", path: "/device-preview?view=teacher&screen=roster#teacher-roster", expandedSelector: "#teacher-roster", focusSelector: "#teacher-roster", caption: "A current classroom roster" },
  { app: "teacher", name: "03-quick-log.png", path: "/device-preview?view=teacher&screen=quick-log#teacher-quick-log", expandedSelector: "#teacher-daily-report", focusSelector: "#teacher-quick-log", caption: "Meals, naps, activities, photos, and notes" },
];

async function preparePage(page) {
  await page.addInitScript(() => window.localStorage.setItem("bee-suite-theme", "light"));
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } * { caret-color: transparent !important; }" });
  const previewLabel = page.getByText("Preview only", { exact: true });
  if (await previewLabel.count()) {
    await previewLabel.first().evaluate((label) => {
      const alert = label.closest('[data-slot="alert"]');
      if (alert instanceof HTMLElement) alert.hidden = true;
    });
  }
  await page.evaluate(() => {
    document.querySelectorAll('[class*="parentWorkspacePreview"]').forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      for (const className of [...element.classList]) {
        if (className.includes("parentWorkspacePreview")) element.classList.remove(className);
      }
    });
  });
}

async function capture(browser, item) {
  const context = await browser.newContext({
    viewport: cssViewport,
    deviceScaleFactor,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.route("**/_vercel/*/script.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("/_next/webpack-hmr")) problems.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || (url.origin !== new URL(baseUrl).origin && !url.protocol.startsWith("data"))) {
      problems.push(`Unexpected request: ${request.method()} ${url.href}`);
    }
  });

  try {
    const response = await page.goto(`${baseUrl}${item.path}`, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) throw new Error(`${item.name} returned HTTP ${response?.status() ?? "unknown"}.`);
    await page.locator('html[data-device-preview-hydrated="true"]').waitFor({ timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready);
    await preparePage(page);
    if (item.expandedSelector) await page.locator(`${item.expandedSelector}[data-collapsed="false"]`).waitFor();
    if (item.focusSelector) {
      const target = page.locator(item.focusSelector).first();
      await target.evaluate((element) => element.scrollIntoView({ block: "start" }));
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.waitForTimeout(150);
    await page.evaluate(({ preserveWindowScroll, resetSelector }) => {
      const windowScroll = window.scrollY;
      const resetTarget = resetSelector ? document.querySelector(resetSelector) : null;
      if (resetTarget instanceof HTMLElement) resetTarget.scrollTop = 0;
      if (preserveWindowScroll) window.scrollTo(0, windowScroll);
      else window.scrollTo(0, 0);
    }, { preserveWindowScroll: Boolean(item.focusSelector), resetSelector: item.resetSelector ?? null });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (horizontalOverflow) problems.push("Horizontal overflow detected.");
    const headerVisible = await page.locator('.app-header').evaluate((header) => {
      const rect = header.getBoundingClientRect();
      return header.contains(document.elementFromPoint(rect.left + 30, rect.top + 30));
    });
    if (!headerVisible) problems.push("Scrolled content obscures the app header.");
    if (problems.length) throw new Error(`${item.name}: ${problems.join(" | ")}`);

    const screenshot = await page.screenshot({ type: "png", animations: "disabled", fullPage: false });
    const outputDirectory = path.join(outputRoot, item.app === "parent" ? "ios" : "ios-teacher", "screenshots-draft");
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, item.name);
    await sharp(screenshot).flatten({ background: "#ffffff" }).removeAlpha().png({ compressionLevel: 9 }).toFile(outputPath);
    const metadata = await sharp(outputPath).metadata();
    if (metadata.width !== pixelDimensions.width || metadata.height !== pixelDimensions.height || metadata.hasAlpha) {
      throw new Error(`${item.name} was not ${pixelDimensions.width}x${pixelDimensions.height} RGB.`);
    }
    return { ...item, outputPath: path.relative(root, outputPath).replaceAll("\\", "/"), width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const item of captures) results.push(await capture(browser, item));
  } finally {
    await browser.close();
  }
  const manifestPath = path.join(outputRoot, "screenshot-drafts-manifest.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "/device-preview synthetic data",
    nonNativeDraft: true,
    finalCaptureRequired: "Replace with matching screenshots from the signed TestFlight build before App Review.",
    dimensions: pixelDimensions,
    captures: results,
  }, null, 2)}\n`, "utf8");
  console.log(`Captured ${results.length} safe screenshot drafts at ${pixelDimensions.width}x${pixelDimensions.height}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
