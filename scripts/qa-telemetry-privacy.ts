import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

type FixtureWindow = Window & { telemetryFixture: {
  navigate(path: string): void; report(message: string): void;
  analytics(event: { type: "pageview"; url: string }): unknown;
  speed(event: { type: "vital"; url: string; route?: string }): unknown;
} };

async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const files = ["src/lib/telemetry-privacy.ts", "src/lib/client-error-reporting.ts", "src/components/client-error-reporter.tsx", "src/components/privacy-safe-telemetry.tsx", "tests/fixtures/telemetry-privacy.tsx"];
  const fingerprint = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  const sourceHashes = await fingerprint();
  const bundle = await build({ entryPoints: ["tests/fixtures/telemetry-privacy.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_CLIENT_ERROR_REPORTING": '"on"', "process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG": '""' }, plugins: [{ name: "local-navigation", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation(?:\.js)?$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", resolveDir: process.cwd(), contents: "import {useSyncExternalStore} from 'react';const sub=fn=>{addEventListener('fixture-navigation',fn);return()=>removeEventListener('fixture-navigation',fn)};export const usePathname=()=>useSyncExternalStore(sub,()=>location.pathname,()=>'/');export const useSearchParams=()=>new URLSearchParams(location.search);export const useParams=()=>({});" }));
  } }] });
  let activeReports: string[] = [], activeReferrers: string[] = [];
  const server = createServer((request, response) => {
    response.setHeader("Referrer-Policy", "no-referrer");
    if (request.url === "/api/system/client-error-reports" && request.method === "POST") {
      const chunks: Buffer[] = []; let bytes = 0;
      request.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 16384) request.destroy(); else chunks.push(chunk); });
      request.on("end", () => { activeReports.push(Buffer.concat(chunks).toString("utf8")); activeReferrers.push(request.headers.referer ?? ""); response.setHeader("Content-Type", "application/json"); response.end('{"ok":true}'); }); return;
    }
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const output = path.resolve(`output/playwright/telemetry-privacy-${engine}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const results: object[] = [], unexpected: string[] = [], errors: string[] = [];
  const token = "FakePayloadSentinel.FakeSignatureSentinel";
  try {
    await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
      for (const coldPath of [`/payment-method-form/${token}`, "/payment-method-form/r/FakeShortCode", "/%70ayment-method-form/FakeShortCode", "/reset-password?code=FakeShortCode", "/parents/setup", "/parent-portal", "/support"]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
        let sdkRequests = 0; const reports: string[] = [], reportReferrers: string[] = [];
        activeReports = reports; activeReferrers = reportReferrers;
        await context.route("**/*", route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin === base && request.method() === "GET" && (request.resourceType() === "document" || url.pathname === "/fixture.js")) return route.continue();
          if (url.origin === base && request.method() === "GET" && ["/_vercel/insights/script.js", "/_vercel/speed-insights/script.js"].includes(url.pathname)) { sdkRequests++; return route.fulfill({ contentType: "text/javascript", body: "/* locally intercepted collector; no provider traffic */" }); }
          if (url.origin === base && request.method() === "POST" && url.pathname === "/api/system/client-error-reports") return route.continue();
          unexpected.push(request.method() + " " + request.resourceType()); return route.abort();
        });
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(base + coldPath); await page.getByText("Fake telemetry fixture", { exact: true }).waitFor();
        const publicPage = coldPath === "/support";
        if (publicPage) await page.waitForFunction(() => document.querySelectorAll("script[data-sdkn]").length === 2);
        assert.equal(await page.locator("script[data-sdkn]").count(), publicPage ? 2 : 0);
        const expectedReport = coldPath === "/parent-portal" || publicPage;
        const reported = expectedReport ? page.waitForResponse(response => response.url() === base + "/api/system/client-error-reports") : null;
        await page.evaluate(value => (window as unknown as FixtureWindow).telemetryFixture.report(value), token);
        if (reported) await reported;
        if (coldPath === "/parent-portal" || publicPage) {
          assert.equal(reports.length, 1);
          assert.equal(reports[0].includes("Sentinel"), false); assert.equal(reports[0].includes("FakeShortCode"), false);
          assert.equal(JSON.parse(reports[0]).errorType, "TypeError"); assert.equal(JSON.parse(reports[0]).metadata.line, 12);
          await page.evaluate("Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => false })");
          const fallbackReported = page.waitForResponse(response => response.url() === base + "/api/system/client-error-reports");
          await page.evaluate(() => (window as unknown as FixtureWindow).telemetryFixture.report('Fallback diagnostic control'));
          await fallbackReported; assert.equal(reports.length, 2);
          assert.equal(JSON.parse(reports[1]).message, "Fallback diagnostic control");
        } else assert.equal(reports.length, 0);
        assert.ok(reportReferrers.every(value => value === ""));
        if (publicPage) {
          const controls = await page.evaluate(() => { const w = window as unknown as FixtureWindow; return { analytics: w.telemetryFixture.analytics({ type: "pageview", url: location.href }), speed: w.telemetryFixture.speed({ type: "vital", url: location.href, route: "/FakeShortCode" }), queued: [!!w.vaq?.some(item => item[0] === "beforeSend"), !!w.siq?.some(item => item[0] === "beforeSend")] }; });
          assert.deepEqual(controls.analytics, { type: "pageview", url: base + "/support" }); assert.deepEqual(controls.speed, { type: "vital", url: base + "/support", route: "/support" }); assert.deepEqual(controls.queued, [true, true]);
          const beforeReports = reports.length;
          for (const next of [`/payment-method-form/${token}`, "/support?token=FakeShortCode", "/support#code=FakeShortCode", "/reset-password", "/parent-portal"]) {
            await page.evaluate(nextPath => (window as unknown as FixtureWindow).telemetryFixture.navigate(nextPath), next);
            const delayed = await page.evaluate(safeUrl => { const w = window as unknown as FixtureWindow; const analytics = w.vaq?.find(item => item[0] === "beforeSend")?.[1] as ((event: object) => unknown); const speed = w.siq?.find(item => item[0] === "beforeSend")?.[1] as ((event: object) => unknown); return [analytics({ type: "pageview", url: safeUrl }), speed({ type: "vital", url: safeUrl, route: "/support" })]; }, base + "/support");
            assert.deepEqual(delayed, [null, null]);
          }
          await page.evaluate(nextPath => (window as unknown as FixtureWindow).telemetryFixture.navigate(nextPath), `/payment-method-form/${token}`);
          await page.evaluate(() => (window as unknown as FixtureWindow).telemetryFixture.report("FakeShortCode"));
          assert.equal(reports.length, beforeReports);
          assert.equal(sdkRequests, 2);
          results.push({ case: "delayed-callbacks", navigationCases: 5, passed: true });
        }
        results.push({ case: results.length, publicPage, scripts: sdkRequests, reports: reports.length, noReferer: true, passed: true });
        await context.close();
      }
    });
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert.deepEqual(await fingerprint(), sourceHashes);
    await mkdir(output, { recursive: true }); await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: true, engine, checkedAt: new Date().toISOString(), sourceHashes, results, unexpected, errors, providerRequests: 0 }, null, 2));
    console.log(JSON.stringify({ passed: true, engine, output, cases: results.length, providerRequests: 0 }));
  } catch (error) { await mkdir(output, { recursive: true }); await writeFile(path.join(output, "failure.json"), JSON.stringify({ results, unexpected, errors, message: error instanceof Error ? error.message : "Failure" }, null, 2)); throw error; }
}
void main();
