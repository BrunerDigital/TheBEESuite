import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outputDirectory = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "screenshots",
  "current",
);
const baseUrl = (
  process.env.PARENT_PORTAL_SCREENSHOT_BASE_URL || "http://127.0.0.1:3114"
).replace(/\/$/, "");

const captures = [
  {
    name: "parent-iphone-overview-light.png",
    path: "/device-preview?view=parent&screen=home",
    title: "Your family",
    viewport: { width: 375, height: 812 },
  },
  {
    name: "parent-iphone-daily-reports-light.png",
    path: "/device-preview?view=parent&screen=updates",
    title: "Daily history",
    viewport: { width: 375, height: 812 },
    focusSelector: "h2",
    focusText: "Daily Report",
    focusOffset: -120,
  },
  {
    name: "parent-iphone-activities-light.png",
    path: "/device-preview?view=parent&screen=updates",
    title: "Daily history",
    viewport: { width: 375, height: 812 },
    focusSelector: "dt",
    focusText: "Activity",
    focusOffset: 0,
  },
  {
    name: "parent-iphone-billing-light.png",
    path: "/device-preview?view=parent&screen=payments",
    title: "Payments",
    viewport: { width: 375, height: 812 },
  },
  {
    name: "parent-ipad-overview-light.png",
    path: "/device-preview?view=parent&screen=home",
    title: "Your family",
    viewport: { width: 1009, height: 1346 },
  },
  {
    name: "parent-desktop-overview-light.png",
    path: "/device-preview?view=parent&screen=home",
    title: "Your family",
    viewport: { width: 1425, height: 990 },
  },
];

async function hidePreviewOnlyUi(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal { display: none !important; }
      * { caret-color: transparent !important; }
    `,
  });
  const previewLabel = page.getByText("Preview only", { exact: true });
  if (await previewLabel.count()) {
    await previewLabel.first().evaluate((label) => {
      const alert = label.closest('[role="alert"]');
      if (alert instanceof HTMLElement) alert.hidden = true;
    });
  }
}

async function capture(browser, item) {
  const context = await browser.newContext({
    viewport: item.viewport,
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const apiRequests = [];
  const failures = [];
  const consoleErrors = [];

  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    failures.push(`${request.method()} ${request.url()}`);
  });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("bee-suite-theme", "light");
  });

  try {
    const response = await page.goto(`${baseUrl}${item.path}`, {
      waitUntil: "networkidle",
    });
    if (!response?.ok()) {
      throw new Error(`${item.name} returned HTTP ${response?.status() ?? "unknown"}`);
    }
    await page.getByRole("heading", { name: item.title, level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await hidePreviewOnlyUi(page);

    if (item.focusText) {
      const focusTarget = page
        .locator(item.focusSelector)
        .filter({ hasText: item.focusText })
        .first();
      await focusTarget.scrollIntoViewIfNeeded();
      await page.evaluate((offset) => window.scrollBy(0, offset), item.focusOffset ?? -120);
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" });
      for (const element of document.querySelectorAll("*")) {
        if (element instanceof HTMLElement && element.scrollLeft) {
          element.scrollLeft = 0;
        }
      }
    });

    await page.waitForTimeout(150);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    if (overflows) throw new Error(`${item.name} has horizontal overflow`);
    if (apiRequests.length) {
      throw new Error(`${item.name} made parent API requests: ${apiRequests.join(", ")}`);
    }
    if (failures.length || consoleErrors.length) {
      throw new Error(
        `${item.name} browser errors: ${[...failures, ...consoleErrors].join(" | ")}`,
      );
    }

    await page.screenshot({
      path: path.join(outputDirectory, item.name),
      type: "png",
      animations: "disabled",
    });
    console.log(`Captured ${item.name}`);
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const item of captures) await capture(browser, item);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
