import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Actual parent component and CSS. Every history response is fake; no backend is reachable.
async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const output = path.resolve(`output/playwright/parent-message-history-${engine}`); await mkdir(output, { recursive: true });
  const fixtureFont = await readFile(path.resolve("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2"));
  const css = (await Promise.all(["globals.css", "product-ui.css", "parent-mobile-home.css"].map(async file => {
    const from = path.resolve("src/app", file); return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  }))).join("\n") + "\n@font-face{font-family:FixtureGeist;src:url('/fixture-font.woff2') format('woff2');font-weight:100 900;font-display:swap}:root{--font-geist-sans:FixtureGeist,Arial,sans-serif;--font-geist-mono:monospace}";
  const bundle = await build({ entryPoints: ["tests/fixtures/parent-message-history.tsx"], outfile: "fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "fake-next", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fake-next" }));
      builder.onLoad({ filter: /.*/, namespace: "fake-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
        ? "const router={refresh(){window.dispatchEvent(new Event('fake-message-refresh'))},push(){},replace(){},back(){}}; export const useRouter=()=>router; export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>location.pathname;"
        : "import React from 'react'; export default function Element({children,fill,priority,unoptimized,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
    } }],
  });
  const server = createServer((req, res) => {
    if (req.url === "/fixture-font.woff2") { res.setHeader("Content-Type", "font/woff2"); res.end(fixtureFont); return; }
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles.find(file => file.path.endsWith(".js"))!.contents); return; }
    if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "")); return; }
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div class="bee-app-frame" data-role="PARENT_GUARDIAN"><main class="dashboard-workspace min-w-0 p-4" id="workspace-main"><div id="root"></div></main></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`, browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Record<string, unknown>[] = [], errors: string[] = [], blocked: string[] = [], requests: string[] = [];
  try {
    const context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce" });
    let mode = "valid";
    const deferred: { fulfill?: () => Promise<void> } = {};
    const finishDeferred = async () => {
      const fulfill = deferred.fulfill; assert.ok(fulfill); delete deferred.fulfill;
      await fulfill().catch(() => {});
    };
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) { blocked.push("off-origin"); return route.abort(); }
      if (request.method() === "GET" && url.pathname === "/api/parent/history/messages") {
        requests.push(url.search); const cursor = url.searchParams.get("cursor"), familyId = url.searchParams.get("familyId");
        assert.ok(["exec-demo-family", "fake-second-family"].includes(familyId!)); assert.ok(["message-021", "message-001"].includes(cursor!));
        const start = cursor === "message-021" ? 20 : 0, count = cursor === "message-021" ? 20 : 1;
        const items = Array.from({ length: count }, (_, index) => ({ id: `message-${String(start - index).padStart(3, "0")}`, subject: `Fake canonical subject ${start - index}`,
          body: `Fake earlier message ${start - index}. This entry must remain available to its own family.`, createdAt: "2026-09-12T14:00:00.000Z", sender: { name: "Fake Teacher" }, isFromFamily: false, canReport: false, attachments: [] }));
        const body = { ok: mode !== "malformed", familyId: mode === "wrong-family" ? "foreign-family" : familyId, requestCursor: cursor, items, nextCursor: count === 20 ? "message-001" : null };
        const fulfill = () => route.fulfill({ status: mode === "failure" ? 503 : mode === "expired" ? 401 : 200, contentType: "application/json", body: JSON.stringify(body) });
        if (mode === "deferred") { deferred.fulfill = fulfill; return; }
        return fulfill();
      }
      if (request.method() !== "GET" || url.pathname.startsWith("/api/")) { blocked.push(`${request.method()} ${url.pathname}`); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const open = async (width: number, zoom: number, query = "") => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await page.goto(base + query, { waitUntil: "networkidle" });
      await page.locator('html[data-fixture-ready="true"]').waitFor(); await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, zoom); await settle();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.fonts.check("16px FixtureGeist") && getComputedStyle(document.body).fontFamily.includes("FixtureGeist")), "Use the application's Geist font, not an accidental browser fallback");
    };
    const list = () => page.getByRole("list", { name: "Messages with Sunshine Academy" });
    const earlier = () => page.getByRole("button", { name: "Load earlier messages", exact: true });
    const draft = async () => {
      await page.getByLabel("Message", { exact: true }).fill("Unsent fake draft preserved through history.");
      await page.locator('input#portal-message-attachments').setInputFiles({ name: "fake-draft.txt", mimeType: "text/plain", buffer: Buffer.from("Fake attachment") });
    };
    const measureConversation = async (reply: boolean) => {
      const geometry = await page.locator("#messages").evaluate(root => {
        const box = root.getBoundingClientRect(), title = root.querySelector('[data-slot="card-title"]')!, description = root.querySelector('[data-slot="card-description"]')!;
        const form = root.querySelector("form")!, input = root.querySelector<HTMLTextAreaElement>("#portal-message")!;
        const controls = [...form.querySelectorAll<HTMLElement>('button, label[for="portal-message-attachments"]')].filter(el => el.getBoundingClientRect().height > 0);
        const texts = [title, description, ...form.querySelectorAll('span.whitespace-normal')];
        return { headerHeight: root.querySelector('[data-slot="card-header"]')!.getBoundingClientRect().height, titleWidth: title.getBoundingClientRect().width,
          inputWidth: input.getBoundingClientRect().width, clippedText: texts.filter(el => { const bounds = el.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(el);
            return [...range.getClientRects()].some(rect => rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)); }).length,
          formOverflow: form.scrollWidth - form.clientWidth, controls: controls.map(el => { const r = el.getBoundingClientRect(); return { label: el.getAttribute("aria-label"), width: r.width, height: r.height, within: r.left >= box.left && r.right <= box.right }; }) };
      });
      assert.ok(geometry.headerHeight <= 250 && geometry.titleWidth >= 150, JSON.stringify(geometry));
      assert.ok(geometry.inputWidth >= 160, JSON.stringify(geometry)); assert.equal(geometry.clippedText, 0); assert.equal(geometry.formOverflow, 0);
      assert.ok(geometry.controls.every(control => control.width >= 44 && control.height >= 44 && control.within), JSON.stringify(geometry));
      if (reply) assert.ok(geometry.controls.some(control => control.label === "Cancel reply"));
      return geometry;
    };
    for (const width of [320, 390]) for (const zoom of [100, 200]) {
      mode = "valid"; await open(width, zoom); await draft();
      const initialGeometry = await measureConversation(false);
      const target = await earlier().boundingBox(); assert.ok(target && target.height >= 44 && target.width >= 44);
      await list().evaluate(el => { el.scrollTop = 0; });
      const anchorBefore = await list().evaluate(el => el.querySelector('[data-message-id="message-021"]')!.getBoundingClientRect().top - el.getBoundingClientRect().top);
      await earlier().click();
      await page.getByText("20 earlier messages loaded. Your draft is unchanged.", { exact: true }).waitFor(); await settle();
      assert.equal(await page.locator("[data-message-id]").count(), 40);
      assert.equal(await page.getByLabel("Message", { exact: true }).inputValue(), "Unsent fake draft preserved through history.");
      assert.equal(await page.locator('input[type="file"]').evaluate(el => (el as HTMLInputElement).files?.[0]?.name), "fake-draft.txt");
      const reading = await list().evaluate(el => {
        const box = el.getBoundingClientRect(), anchor = el.querySelector('[data-message-id="message-021"]')!.getBoundingClientRect();
        return { top: el.scrollTop, anchor: anchor.top - box.top, viewport: el.clientHeight, overflow: el.scrollWidth - el.clientWidth };
      });
      assert.ok(reading.top > 0 && Math.abs(reading.anchor - anchorBefore) <= 2, JSON.stringify({ ...reading, anchorBefore })); assert.equal(reading.overflow, 0);
      await list().evaluate(el => { el.scrollTop = 0; }); await earlier().click(); await page.getByRole("button", { name: "Start of conversation", exact: true }).waitFor();
      await page.getByText("1 earlier message loaded. Your draft is unchanged.", { exact: true }).waitFor();
      assert.equal(await page.locator("[data-message-id]").count(), 41);
      const first = page.locator('[data-message-id="message-000"]'); page.once("dialog", dialog => dialog.accept()); await first.getByRole("button", { name: "Reply", exact: true }).click();
      assert.equal(await page.getByLabel("Message", { exact: true }).inputValue(), "Unsent fake draft preserved through history.");
      assert.match(await page.locator("form").innerText(), /Fake canonical subject 0/);
      const replyGeometry = await measureConversation(true);
      const layout = await page.evaluate(() => ({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), font: getComputedStyle(document.documentElement).fontSize }));
      assert.equal(layout.overflow, 0); assert.equal(layout.font, zoom === 200 ? "32px" : "16px");
      await page.screenshot({ path: path.join(output, `${width}-${zoom}-history.png`), fullPage: true });
      results.push({ width, zoom, reading, layout, initialGeometry, replyGeometry, messages: 41, draftPreserved: true });
    }
    for (const failure of ["failure", "expired", "malformed", "wrong-family"]) {
      mode = failure; await open(320, 200); await draft(); await list().evaluate(el => { el.scrollTop = 0; }); await earlier().click();
      await page.getByText(/Earlier messages could not be loaded/).waitFor(); assert.equal(await page.locator("[data-message-id]").count(), 20);
      assert.equal(await page.getByLabel("Message", { exact: true }).inputValue(), "Unsent fake draft preserved through history.");
      mode = "valid"; await earlier().click(); await page.getByText("20 earlier messages loaded. Your draft is unchanged.", { exact: true }).waitFor();
      assert.equal(await page.locator("[data-message-id]").count(), 40); results.push({ failure, retry: "passed" });
    }
    mode = "deferred"; await open(390, 100); await list().evaluate(el => { el.scrollTop = 0; }); await earlier().click();
    await page.waitForFunction(() => document.querySelector("button") !== null); assert.ok(deferred.fulfill);
    await page.evaluate(() => window.dispatchEvent(new Event("fake-message-family"))); await settle();
    await finishDeferred(); await settle();
    assert.equal(await page.locator("[data-message-id]").count(), 20); assert.equal(await page.getByText("20 earlier messages loaded. Your draft is unchanged.", { exact: true }).count(), 0);
    results.push({ staleFamily: "discarded" });
    mode = "deferred"; await open(390, 100); await draft(); await list().evaluate(el => { el.scrollTop = 0; }); await earlier().click();
    assert.ok(await earlier().isDisabled()); assert.ok(deferred.fulfill);
    await page.evaluate(() => window.dispatchEvent(new Event("fake-message-refresh"))); await settle();
    await finishDeferred(); await settle();
    assert.equal(await page.locator("[data-message-id]").count(), 20);
    assert.equal(await page.getByLabel("Message", { exact: true }).inputValue(), "Unsent fake draft preserved through history.");
    assert.equal(await page.getByText("20 earlier messages loaded. Your draft is unchanged.", { exact: true }).count(), 0);
    results.push({ staleSnapshot: "discarded", duplicateControl: "disabled", draftPreserved: true });
    mode = "valid"; await open(320, 200, "?ambiguous-school"); await draft();
    await page.getByRole("alert").filter({ hasText: /current school/ }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Send message", exact: true }).isDisabled());
    await list().evaluate(el => { el.scrollTop = 0; }); await earlier().click();
    await page.getByText("20 earlier messages loaded. Your draft is unchanged.", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-message-id]").count(), 40);
    results.push({ ambiguousSchool: "send blocked; reading retained" });
    await page.locator('input#portal-message-attachments').setInputFiles({ name: "Fake-classroom-supplies-and-parent-instructions-for-the-coming-school-week.txt", mimeType: "text/plain", buffer: Buffer.from("Fake long-name attachment") });
    await measureConversation(false);
    await page.screenshot({ path: path.join(output, "320-200-long-attachment.png"), fullPage: true });
    results.push({ longAttachmentName: "fully visible; remove and send controls contained" });
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    await writeFile(path.join(output, "results.json"), JSON.stringify({ engine, passed: true, results, requests: requests.length, errors, blocked, writes: 0 }, null, 2));
    console.log(JSON.stringify({ engine, passed: true, cases: results.length, requests: requests.length, writes: 0 }));
  } finally { await browser.close(); await new Promise<void>(done => server.close(() => done())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
