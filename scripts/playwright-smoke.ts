import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, request as playwrightRequest } from "playwright";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const workspaceDir = realpathSync(process.cwd());

type SmokeRoute = {
  name: string;
  path: string;
  expectedText?: RegExp;
};

const smokeRoutes: SmokeRoute[] = [
  { name: "public landing", path: "/", expectedText: /The BEE Suite|childcare/i },
  { name: "login", path: "/login", expectedText: /Log in to The BEE Suite/i },
  { name: "onboarding", path: "/onboarding", expectedText: /onboarding|workspace/i },
  { name: "crm protected route", path: "/crm-leads", expectedText: /Log in to The BEE Suite|CRM/i },
  { name: "fte protected route", path: "/fte-reports", expectedText: /Log in to The BEE Suite|FTE/i },
  { name: "kiosk launcher", path: "/check-in", expectedText: /Log in to The BEE Suite|check/i },
  { name: "parent portal protected route", path: "/parent-portal", expectedText: /Log in to The BEE Suite|Parent/i },
  { name: "billing protected route", path: "/billing-invoices", expectedText: /Log in to The BEE Suite|Billing/i },
];

const apiChecks = [
  { name: "Kid City hosted embed", path: "/kidcity-inquiry-form.js", expected: /Start an inquiry|api\/inquiries/ },
  { name: "Generic hosted embed", path: "/bee-suite-inquiry-form.js", expected: /Start an inquiry|api\/inquiries/ },
  { name: "Public Kid City locations", path: "/api/public/kidcity-locations", expected: /locations/ },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1200) });
      if (response.status < 500) return;
    } catch {
      // Keep waiting for the local smoke-test server.
    }
    await sleep(1000);
  }

  throw new Error(`Smoke test server did not become ready at ${baseUrl}.`);
}

function cleanUrl(value?: string) {
  const cleaned = String(value || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return /^https?:\/\//i.test(cleaned) ? cleaned : "";
}

function startLocalServer(port: number) {
  const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspaceDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  return child;
}

function ensureProductionBuild() {
  if (process.env.SMOKE_SKIP_BUILD === "1") return;
  if (process.env.SMOKE_REBUILD !== "1" && existsSync(join(workspaceDir, ".next", "BUILD_ID"))) return;

  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: workspaceDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("Production build failed before smoke test.");
  }
}

async function optionalLogin(baseUrl: string) {
  const email = process.env.SMOKE_TEST_EMAIL;
  const password = process.env.SMOKE_TEST_PASSWORD;
  if (!email || !password) return null;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => undefined),
    page.click("button[type='submit']"),
  ]);
  const bodyText = await page.locator("body").innerText();
  if (/Login failed|Unable to sign in/i.test(bodyText)) {
    await browser.close();
    throw new Error("Credentialed smoke login failed.");
  }
  return { browser, page };
}

function stopServer(server: ChildProcessWithoutNullStreams | null) {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  server.kill();
}

async function run() {
  const externalBaseUrl =
    cleanUrl(process.env.SMOKE_BASE_URL) ||
    (process.env.SMOKE_LOCAL === "1" ? "" : cleanUrl(process.env.NEXT_PUBLIC_APP_URL) || "https://thebeesuite.io");
  const port = Number(process.env.SMOKE_PORT || 4177);
  const baseUrl = externalBaseUrl || `http://127.0.0.1:${port}`;
  let server: ChildProcessWithoutNullStreams | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let api: Awaited<ReturnType<typeof playwrightRequest.newContext>> | null = null;

  try {
    if (!externalBaseUrl) {
      ensureProductionBuild();
      server = startLocalServer(port);
      await waitForServer(baseUrl);
    }

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });

    for (const route of smokeRoutes) {
      const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      const status = response?.status() ?? 0;
      if (status >= 500) throw new Error(`${route.name} returned ${status}.`);
      const bodyText = await page.locator("body").innerText();
      if (route.expectedText && !route.expectedText.test(bodyText)) {
        throw new Error(`${route.name} did not render expected text.`);
      }
    }

    api = await playwrightRequest.newContext({ baseURL: baseUrl });
    for (const check of apiChecks) {
      const response = await api.get(check.path);
      if (response.status() >= 500) throw new Error(`${check.name} returned ${response.status()}.`);
      const text = await response.text();
      if (!check.expected.test(text)) throw new Error(`${check.name} did not return expected content.`);
    }
    const options = await api.fetch("/api/inquiries", {
      method: "OPTIONS",
      headers: { Origin: "https://kidcityusa.com" },
    });
    if (options.status() !== 204) throw new Error(`Inquiry OPTIONS returned ${options.status()}.`);

    const loggedIn = await optionalLogin(baseUrl);
    if (loggedIn) {
      await loggedIn.page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
      const bodyText = await loggedIn.page.locator("body").innerText();
      if (/Log in to The BEE Suite/i.test(bodyText)) throw new Error("Credentialed dashboard smoke stayed on login.");
      await loggedIn.browser.close();
    }

    if (pageErrors.length) {
      throw new Error(`Browser console/page errors during smoke test:\n${pageErrors.join("\n")}`);
    }

    console.log(`Smoke checks passed for ${baseUrl}.`);
  } finally {
    await api?.dispose().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
