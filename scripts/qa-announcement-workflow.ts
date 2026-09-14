import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, webkit } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";
import { announcementCreateId, announcementRecordSignature, type AnnouncementRecord } from "../src/lib/announcement-workflow";

async function main() {
  const engine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const files = ["src/components/announcement-workspace.tsx", "src/components/announcement-email-delivery.tsx", "src/lib/announcement-workflow.ts", "tests/fixtures/announcements.tsx"];
  const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
  const before = await hashes();
  const styles = await Promise.all(["globals", "product-ui"].map(async name => { const from = path.resolve(`src/app/${name}.css`); return (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css; }));
  const font = await readFile("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2");
  const brand = new Map<string, Buffer>(await Promise.all(["mr-bee-profile.png", "favicon-dark.png"].map(async name => [`/brand/the-bee-suite/${name}`, await readFile(`public/brand/the-bee-suite/${name}`)] as const)));
  const bundle = await build({ entryPoints: ["tests/fixtures/announcements.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "fake-next", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation" ? "const router={refresh(){},push(){},replace(){},back(){}};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);" : "import React from 'react';export default function Element({children,fill,priority,unoptimized,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
  } }] });
  const server = createServer((request, response) => {
    if (brand.has(request.url ?? "")) { response.setHeader("Content-Type", "image/png"); response.end(brand.get(request.url!)); return; }
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(styles.join("\n") + "\n@font-face{font-family:FixtureGeist;src:url('/fixture-font.woff2');font-weight:100 900} :root{--font-geist-sans:FixtureGeist,Arial,sans-serif;--font-geist-mono:monospace}"); return; }
    if (request.url === "/fixture-font.woff2") { response.end(font); return; }
    response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const output = path.resolve(`output/playwright/announcement-workflow-${engine}-${new Date().toISOString().replace(/[:.]/g, "-")}`); await mkdir(output, { recursive: true });
  const results: object[] = [], unexpected: string[] = [], errors: string[] = [], writes: object[] = [];
  const rows = new Map<string, AnnouncementRecord>();
  let mode: "success" | "abort-after-save" | "invalid" | "hold" = "success", release: (() => void) | null = null;
  let emailMode: "success" | "unknown" = "success", emailAttempt: { id: string; status: string; recipientCount: number } | null = null;
  try {
    await withFixtureBrowser(server, () => (engine === "webkit" ? webkit : chromium).launch(), async browser => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", timezoneId: "Asia/Tokyo" });
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) { unexpected.push("off-origin"); return route.abort(); }
        if (url.pathname === "/api/operations/records" && request.method() === "POST") {
          const input = request.postDataJSON(); writes.push({ entity: input.entity, id: input.id ?? null, intent: input.intent }); assert.equal(input.entity, "announcement");
          if (mode === "hold") await new Promise<void>(resolve => { release = resolve; });
          const existing = input.id ? rows.get(input.id) : null;
          if (input.id && (!existing || input.expectedRecordSignature !== announcementRecordSignature(existing))) return route.fulfill({ status: 409, json: { ok: false, error: "Fake concurrent edit" } });
          const saved: AnnouncementRecord = { id: input.id || announcementCreateId(input.requestId), centerId: input.centerId, title: input.title, body: input.body, audience: existing ? existing.audience : { label: "school_parent_portal" }, status: input.intent === "publish" ? "published" : existing?.status ?? "draft", sendAt: input.intent === "publish" ? "2026-09-13T22:00:00Z" : existing?.sendAt ?? null };
          rows.set(saved.id, saved);
          if (mode === "abort-after-save") return route.abort("failed");
          return route.fulfill({ json: { ok: true, entity: "announcement", portalOnly: true, intent: input.intent, record: mode === "invalid" ? { ...saved, id: "wrong-fake-id" } : saved } });
        }
        if (/^\/api\/communications\/announcements\/[^/]+\/send$/.test(url.pathname)) {
          const id = decodeURIComponent(url.pathname.split("/")[4]);
          if (request.method() === "GET") return route.fulfill({ json: { ok: true, preview: { announcementId: id, centerId: "fake-school", schoolName: "Fake School A", subject: "Announcement: Fake published school update", body: "This is a fake published notice.", recipientCount: 2, suppressedRecipientCount: 0, familyCount: 1, fingerprint: "f".repeat(64), attempt: emailAttempt } } });
          if (request.method() === "POST") { writes.push({ entity: "email", id }); assert.equal(request.postDataJSON().confirmEmail, true); emailAttempt = { id: "fake-email-attempt", status: emailMode === "unknown" ? "unconfirmed" : "queued", recipientCount: 2 }; if (emailMode === "unknown") return route.abort("failed"); return route.fulfill({ json: { ok: true, announcementId: id, centerId: "fake-school", attempt: emailAttempt } }); }
        }
        if (/^\/api\/communications\/announcements\/[^/]+$/.test(url.pathname) && request.method() === "GET") return route.fulfill({ json: { ok: true, record: rows.get(decodeURIComponent(url.pathname.split("/")[4])) ?? null } });
        if (url.pathname.startsWith("/api/")) { unexpected.push(request.method() + " " + url.pathname); return route.abort(); }
        if (request.method() === "GET" && (request.resourceType() === "document" || brand.has(url.pathname) || ["/fixture.js", "/fixture.css", "/fixture-font.woff2"].includes(url.pathname))) return route.continue();
        unexpected.push(request.resourceType() + " " + url.pathname); return route.abort();
      });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      let acceptDialog = true; page.on("dialog", dialog => { void (acceptDialog ? dialog.accept() : dialog.dismiss()); });
      const open = async (query = "") => { await page.goto(base + "/announcements" + query); await page.locator('html[data-fixture-ready="true"]').waitFor(); await page.evaluate(() => document.fonts.ready); };
      const title = page.getByLabel("Title", { exact: true }), body = page.getByLabel("Message", { exact: true }), school = page.getByLabel("School", { exact: true });
      const save = () => page.getByRole("button", { name: "Save draft", exact: true });
      await open();
      await page.getByRole("button", { name: "New announcement", exact: true }).click();
      await save().click(); assert.equal(await school.getAttribute("aria-invalid"), "true"); assert.equal(await school.evaluate(element => document.activeElement === element), true);
      await school.selectOption("fake-school"); await save().click(); assert.equal(await title.evaluate(element => document.activeElement === element), true);
      await title.fill("Fake new notice"); await save().click(); assert.equal(await body.evaluate(element => document.activeElement === element), true); await body.fill("Fake new message.");
      mode = "hold"; await save().click(); await page.waitForFunction(() => document.querySelector("fieldset")?.disabled === true); assert.equal(await title.isDisabled(), true);
      assert.ok(release); (release as () => void)(); mode = "success";
      await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor(); assert.equal(await save().isDisabled(), true);
      const createdId = [...rows.keys()][0]; assert.equal(rows.size, 1); assert.ok(createdId.startsWith("ann_"));
      await page.getByRole("button", { name: "Publish to parent portal", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Published to the parent portal" }).waitFor(); assert.equal(rows.get(createdId)?.status, "published");
      await title.fill("Fake changed published notice"); acceptDialog = false; const beforeCancel = writes.length; await page.getByRole("button", { name: "New announcement", exact: true }).click(); assert.equal(await title.inputValue(), "Fake changed published notice"); assert.equal(writes.length, beforeCancel);
      acceptDialog = true; mode = "abort-after-save"; await page.getByRole("button", { name: "Save published changes", exact: true }).click(); await page.getByText(/Editing is paused/).waitFor(); assert.equal(await title.inputValue(), "Fake changed published notice");
      await page.getByRole("button", { name: "Check saved version", exact: true }).click(); await page.getByRole("button", { name: "Load saved version", exact: true }).click(); assert.equal(await title.inputValue(), "Fake changed published notice");
      assert.equal(await page.getByRole("button", { name: "Save published changes", exact: true }).isDisabled(), true);
      mode = "success"; results.push({ case: "create-publish-dirty-unknown-recovery", passed: true });
      await open(); const global = page.locator("article").filter({ has: page.getByRole("heading", { name: "Fake platform-wide notice", exact: true }) }); assert.equal(await global.getByRole("button", { name: /^Edit/ }).count(), 0);
      const published = page.locator("article").filter({ has: page.getByRole("heading", { name: "Fake published school update", exact: true }) });
      await published.getByRole("button", { name: "Review email delivery", exact: true }).click(); await published.getByRole("button", { name: "Confirm email to 2 addresses", exact: true }).waitFor();
      emailMode = "unknown"; await published.getByRole("button", { name: "Confirm email to 2 addresses", exact: true }).click(); await published.getByRole("alert").waitFor(); assert.equal(await published.getByRole("button", { name: "Confirm email to 2 addresses", exact: true }).isDisabled(), true);
      await page.getByRole("button", { name: "New announcement", exact: true }).click();
      await title.fill("Unrelated fake draft still retained");
      await published.getByRole("button", { name: "Check email status", exact: true }).click(); await published.getByRole("status").waitFor(); assert.equal(await title.inputValue(), "Unrelated fake draft still retained"); assert.equal(await published.getByRole("button", { name: /^Confirm email/ }).count(), 0); assert.equal(writes.filter((row: object) => (row as { entity: string }).entity === "email").length, 1);
      results.push({ case: "email-preview-unknown-read-only-status", passed: true });
      for (const role of ["director", "auditor"]) for (const width of [320, 390, 768, 1280]) for (const zoom of [100, 200]) {
        await page.setViewportSize({ width, height: 900 }); await open(role === "auditor" ? "?auditor" : ""); await page.evaluate(size => { document.documentElement.style.fontSize = `${size}%`; }, zoom);
        const layout = await page.evaluate(() => ({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), smallControls: [...document.querySelectorAll<HTMLElement>(".announcement-workspace button,.announcement-workspace input,.announcement-workspace select,.announcement-workspace summary")].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map(element => element.tagName) }));
        if (layout.overflow) { await page.screenshot({ path: path.join(output, `overflow-${role}-${width}-${zoom}.png`), fullPage: true }); console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".announcement-workspace *")].filter(element => element.getBoundingClientRect().right > innerWidth).map(element => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 60), width: element.getBoundingClientRect().width })) ))); }
        assert.equal(layout.overflow, 0, `${role}/${width}/${zoom} overflow`); assert.deepEqual(layout.smallControls, [], `${role}/${width}/${zoom} touch targets`);
        if (role === "auditor") assert.equal(await title.count(), 0);
        if (width === 390 || width === 320 && zoom === 200) await page.screenshot({ path: path.join(output, `${role}-${width}-${zoom}.png`), fullPage: true });
        results.push({ role, width, zoom, ...layout, passed: true });
        if (role === "director") {
          await page.getByRole("button", { name: "New announcement", exact: true }).click();
          const editorLayout = await page.evaluate(() => ({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), undersized: [...document.querySelectorAll<HTMLElement>("#announcement-editor button,#announcement-editor input,#announcement-editor select")].filter(element => element.getBoundingClientRect().height < 43.5).length }));
          assert.equal(editorLayout.overflow, 0); assert.equal(editorLayout.undersized, 0);
          await page.getByRole("button", { name: "Save draft", exact: true }).click(); assert.equal(await school.evaluate(element => document.activeElement === element), true);
          if (width === 390 || width === 320 && zoom === 200) await page.screenshot({ path: path.join(output, `editor-${width}-${zoom}.png`), fullPage: true });
          results.push({ view: "editor", width, zoom, ...editorLayout, passed: true });
        }
      }
      for (const selected of [false, true]) { await open("?owner" + (selected ? "&selected-school" : "")); assert.equal(await page.locator("article").filter({ has: page.getByRole("heading", { name: "Fake platform-wide notice", exact: true }) }).getByRole("button", { name: /^Edit/ }).count(), selected ? 0 : 1); }
      results.push({ case: "platform-all-versus-selected-school", passed: true });
      await context.close();
    });
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert.deepEqual(await hashes(), before);
    await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: true, engine, checkedAt: new Date().toISOString(), sourceHashes: before, results, interceptedWrites: writes.length, realProviderRequests: 0, unexpected, errors }, null, 2)); console.log(JSON.stringify({ passed: true, engine, cases: results.length, output }));
  } catch (error) { await writeFile(path.join(output, "failure.json"), JSON.stringify({ results, unexpected, errors, message: error instanceof Error ? error.message : "Failure" }, null, 2)); throw error; }
}
void main();
