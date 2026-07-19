import "./load-env";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { discoverApiRouteSpecs, type ApiHttpMethod, type ApiRouteSpec } from "./api-route-test-inventory";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const workspaceDir = realpathSync(process.cwd());
const requestTimeoutMs = Number(process.env.API_SMOKE_REQUEST_TIMEOUT_MS || 60_000);

type ApiSmokeResult = {
  method: ApiHttpMethod;
  routePath: string;
  status: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanUrl(value?: string) {
  const cleaned = String(value || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  return /^https?:\/\//i.test(cleaned) ? cleaned : "";
}

async function waitForServer(baseUrl: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(1500) });
      if (response.status < 500) return;
    } catch {
      // Keep waiting for the local API smoke-test server.
    }
    await sleep(1000);
  }

  throw new Error(`API smoke server did not become ready at ${baseUrl}.`);
}

async function reusableBeeSuiteServer(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(1500) });
    if (response.status >= 500) return false;
    const text = await response.text();
    return /The BEE Suite|Log in/i.test(text);
  } catch {
    return false;
  }
}

async function findReusableLocalServer() {
  const candidates = [
    cleanUrl(process.env.API_SMOKE_REUSE_BASE_URL),
    "http://localhost:3002",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3003",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await reusableBeeSuiteServer(candidate)) return candidate;
  }

  return "";
}

function startLocalServer(port: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "http://127.0.0.1:54321";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "api-smoke-publishable-key";
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      API_ROUTE_SMOKE: "1",
      AUTH_SECRET: process.env.AUTH_SECRET || "api-smoke-auth-secret",
      PIN_HASH_SECRET: process.env.PIN_HASH_SECRET || "api-smoke-pin-secret",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      SUPABASE_URL: process.env.SUPABASE_URL || supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || supabaseKey,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseKey,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || supabaseKey,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "api-smoke-service-role-key",
    },
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next-api] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next-api] ${chunk}`));

  return child;
}

function stopServer(server: ChildProcessWithoutNullStreams | null) {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  server.kill();
}

function requestUrl(baseUrl: string, routePath: string) {
  const url = new URL(routePath, baseUrl);
  if (routePath === "/api/inquiries") {
    url.searchParams.set("source", "api-smoke");
  }
  return url.toString();
}

function bodyForRoute(routePath: string, method: ApiHttpMethod) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return undefined;
  if (routePath.startsWith("/api/twilio/")) {
    return new URLSearchParams({
      MessageSid: "SM_api_smoke_test",
      MessageStatus: "delivered",
      From: "+19415550100",
      To: "+19415550101",
      Body: "API smoke test",
    });
  }
  if (routePath === "/api/billing/stripe-webhook") return "{}";
  return JSON.stringify({});
}

function headersForRoute(routePath: string, method: ApiHttpMethod) {
  const headers: Record<string, string> = {
    "X-API-Smoke-Test": "1",
  };
  if (method === "OPTIONS" || routePath === "/api/inquiries") {
    headers.Origin = "https://kidcityusa.com";
  }
  if (routePath.startsWith("/api/twilio/")) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (routePath === "/api/billing/stripe-webhook") {
    headers["Content-Type"] = "application/json";
  } else if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function allowedServerError(routePath: string, method: ApiHttpMethod, status: number) {
  if (status < 500) return true;
  if (method === "GET" && routePath === "/api/health" && status === 503) return true;
  if (method === "POST" && routePath === "/api/billing/stripe-webhook" && status === 503) return true;
  return false;
}

async function smokeRouteMethod(baseUrl: string, spec: ApiRouteSpec, method: ApiHttpMethod): Promise<ApiSmokeResult> {
  const body = bodyForRoute(spec.routePath, method);
  const response = await fetch(requestUrl(baseUrl, spec.routePath), {
    method,
    headers: headersForRoute(spec.routePath, method),
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  return {
    method,
    routePath: spec.routePath,
    status: response.status,
  };
}

async function run() {
  const externalBaseUrl = cleanUrl(process.env.API_SMOKE_BASE_URL);
  const port = Number(process.env.API_SMOKE_PORT || 4188);
  const reusableBaseUrl = externalBaseUrl ? "" : await findReusableLocalServer();
  const baseUrl = externalBaseUrl || reusableBaseUrl || `http://127.0.0.1:${port}`;
  let server: ChildProcessWithoutNullStreams | null = null;

  try {
    if (!externalBaseUrl && !reusableBaseUrl) {
      server = startLocalServer(port);
      await waitForServer(baseUrl);
    }

    const specs = discoverApiRouteSpecs(workspaceDir);
    const missingMethods = specs.filter((spec) => spec.methods.length === 0);
    if (missingMethods.length) {
      throw new Error(`API route files without exported HTTP methods:\n${missingMethods.map((spec) => spec.filePath).join("\n")}`);
    }

    const results: ApiSmokeResult[] = [];
    const failures: ApiSmokeResult[] = [];
    for (const spec of specs) {
      for (const method of spec.methods) {
        const result = await smokeRouteMethod(baseUrl, spec, method);
        results.push(result);
        if (!allowedServerError(spec.routePath, method, result.status)) failures.push(result);
      }
    }

    if (failures.length) {
      throw new Error([
        "API route smoke found unhandled server responses:",
        ...failures.map((failure) => `${failure.method} ${failure.routePath} -> ${failure.status}`),
      ].join("\n"));
    }

    const routeCount = specs.length;
    const methodCount = results.length;
    const statusSummary = new Map<number, number>();
    for (const result of results) {
      statusSummary.set(result.status, (statusSummary.get(result.status) ?? 0) + 1);
    }
    const statuses = Array.from(statusSummary.entries())
      .sort(([a], [b]) => a - b)
      .map(([status, count]) => `${status}:${count}`)
      .join(", ");

    console.log(`API smoke passed ${methodCount} method checks across ${routeCount} routes at ${baseUrl}.`);
    console.log(`Status summary: ${statuses}`);
  } finally {
    stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
