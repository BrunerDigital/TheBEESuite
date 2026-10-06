import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, webkit } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const output = "output/playwright/family-billing-intake";
  await mkdir(output, { recursive: true });
  const styles = await Promise.all(["globals", "product-ui"].map(async name => {
    const from = path.resolve(`src/app/${name}.css`);
    return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  }));
  const bundle = await build({ entryPoints: ["tests/fixtures/family-billing-intake.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "fake-next" }));
    builder.onLoad({ filter: /.*/, namespace: "fake-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
      ? "const router={refresh(){},push(){},replace(){}}; export const useRouter=()=>router; export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search);"
      : "import React from 'react'; export default function Link({children,...props}){return React.createElement('a',props,children)}" }));
  } }] });
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles.join("\n")); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><head><title>Family and billing intake fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const results: object[] = [];
  await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
    for (const width of [390, 1280]) for (const outcome of ["success", "network", "invalid"] as const) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
      const requests: string[] = []; const errors: string[] = [];
      let prepared = 0; let storageUploads = 0;
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) throw new Error("Unexpected external request");
        if (!url.pathname.startsWith("/api/") && url.pathname !== "/synthetic-storage-upload") return route.continue();
        requests.push(url.pathname);
        if (url.pathname === "/synthetic-storage-upload") { storageUploads++; assert.equal(route.request().method(), "PUT"); return route.fulfill({ status: 200, body: "{}" }); }
        if (url.pathname === "/api/imports/procare/upload") {
          prepared++; const body = route.request().postDataJSON();
          assert.equal(body.centerId, "synthetic-school"); assert.equal(body.files.length, 1);
          assert.ok(body.files[0].size > 3.5 * 1024 * 1024); assert.match(body.files[0].sha256, /^[a-f0-9]{64}$/);
          return route.fulfill({ status: 200, json: { receipt: "synthetic-signed-receipt", expiresAt: Date.now() + 60_000, uploads: [{ signedUrl: base + "/synthetic-storage-upload" }] } });
        }
        assert.equal(url.pathname, "/api/imports/procare");
        if (route.request().method() === "GET") return route.fulfill({ status: 200, json: { ok: true, batches: [] } });
        if (outcome === "network") return route.abort();
        if (outcome === "invalid") return route.fulfill({ status: 200, body: "<html>Unexpected response</html>" });
        const raw = route.request().postData() || "";
        assert.ok(raw.includes("stagedSourceReceipt")); assert.ok(raw.includes("synthetic-signed-receipt"));
        assert.ok(!raw.includes('filename="synthetic-roster.csv"'), "Source bytes must not be re-sent through the function");
        const summary = {
          rows: 1, sourceSha256: "a".repeat(64), reviewFingerprint: "synthetic-review", warningRowNumbers: [], duplicateReviewRowNumbers: [],
          newFamilies: 1, matchedFamilies: 0, newChildren: 1, matchedChildren: 0, newStaff: 0, matchedStaff: 0, warningRows: 0, readyRows: 1, duplicateMatches: 0, centersTouched: 1, balanceRows: 1,
          ledgerRows: 0, invoiceRows: 0, checkLogRows: 0, attendanceRows: 0, sourceType: "csv_file", sourceHeaders: [],
          correlationReview: [], rowResults: [],
          migrationReview: { currentFamilyAccounts: 1, historicalFamilyAccounts: 0, relationshipsReadyChildren: 1, tuitionReadyChildren: 1, weeklyTuitionReadyChildren: 0, currentChildren: 1, includedCurrentBalanceCents: -1000, excludedHistoricalBalanceCents: 0, blockedRows: 0, rows: [] },
        };
        return route.fulfill({ status: 200, json: { ok: true, dryRun: true, summary } });
      });
      try {
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(base); await page.getByRole("heading", { name: "Bring your family and billing information" }).waitFor();
        await page.locator("#procare-file").setInputFiles({ name: "synthetic-roster.csv", mimeType: "text/csv", buffer: Buffer.alloc(4 * 1024 * 1024, "a") });
        const review = page.getByRole("button", { name: "Submit for Review", exact: true });
        assert.equal(await review.isEnabled(), true, "A valid 4 MB source must be accepted");
        await review.click();
        if (outcome === "success") {
          await page.getByText("Preview ready - no records written yet", { exact: true }).waitFor();
          await page.getByText("Tuition evidence ready", { exact: true }).waitFor();
          assert.equal(await page.getByText("Data transfer saved", { exact: true }).count(), 0);
          // Refreshing the preview reuses verified uploaded bytes, not a second upload.
          await page.keyboard.press("Escape");
          await review.click();
          await page.getByText("Preview ready - no records written yet", { exact: true }).waitFor();
        } else {
          await page.getByText(outcome === "network" ? /upload connection failed/ : /could not be prepared/).waitFor();
          await page.getByText("synthetic-roster.csv", { exact: false }).first().waitFor();
          assert.equal(await page.getByText("Data transfer saved", { exact: true }).count(), 0);
        }
        assert.equal(prepared, 1); assert.equal(storageUploads, 1); assert.deepEqual(errors, []);
        assert.equal(await page.getByText("NaN", { exact: true }).count(), 0);
        if (outcome === "success") {
          const dialog = page.getByRole("dialog");
          const bounds = await dialog.boundingBox(); assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 845, "Review stays within the viewport");
          const background = await dialog.evaluate(element => getComputedStyle(element).backgroundColor);
          assert.ok(background !== "transparent" && background !== "rgba(0, 0, 0, 0)" && !background.includes(" / "), "Review has an opaque background");
          await page.getByRole("button", { name: "Close Review", exact: true }).click();
          await review.click();
          await page.getByText("Preview ready - no records written yet", { exact: true }).waitFor();
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, "No horizontal page overflow");
        await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
        await page.screenshot({ path: `${output}/${engine}-${width}-${outcome}.png`, fullPage: false });
        results.push({ width, outcome, requests, passed: true });
      } finally { await context.close(); }
    }
  });
  await writeFile(`${output}/${engine}.json`, JSON.stringify({ engine, cases: results.length, results, passed: true }, null, 2));
  console.log(JSON.stringify({ engine, cases: results.length, passed: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
