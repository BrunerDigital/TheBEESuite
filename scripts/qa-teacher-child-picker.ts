import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { withFixtureBrowser } from "./qa-fixture-browser";

// No credentials or backend: real components, fake props, intercepted requests only.
async function main() {
  const browserEngine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const evidenceDirectory = path.resolve(`output/playwright/teacher-child-picker-${browserEngine}`);
  await mkdir(evidenceDirectory, { recursive: true });
  const stylePath = path.resolve("src/app/globals.css");
  const style = await postcss([tailwindcss()]).process(await readFile(stylePath, "utf8"), { from: stylePath });
  const fixtureFont = await readFile(path.resolve("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2"));
  const productPath = path.resolve("src/app/product-ui.css");
  const product = await postcss([tailwindcss()]).process(await readFile(productPath, "utf8"), { from: productPath });
  const fixtureStyle = `${style.css}\n${product.css}\n@font-face{font-family:FixtureGeist;src:url('/fixture-font.woff2') format('woff2');font-weight:100 900;font-display:swap} :root{--font-geist-sans:FixtureGeist,Arial,sans-serif;--font-geist-mono:monospace}`;
  const bundle = await build({
    entryPoints: ["tests/fixtures/ui-flow-recovery.tsx"], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "mock-next-browser-boundary", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (args) => ({ path: args.path, namespace: "mock-next" }));
      builder.onLoad({ filter: /.*/, namespace: "mock-next" }, (args) => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
        ? "const router={refresh(){window.__refreshes=(window.__refreshes||0)+1},push(){},replace(){},back(){}}; export const useRouter=()=>router; export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>location.pathname;"
        : "import React from 'react'; export default function Element({children,fill,priority,unoptimized,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
    } }],
  });
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.contents); return; }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(fixtureStyle + "\n" + (bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "")); return; }
    if (request.url === "/fixture-font.woff2") { response.setHeader("Content-Type", "font/woff2"); response.end(fixtureFont); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div class="bee-app-frame" data-role="TEACHER"><main class="dashboard-workspace p-4" id="workspace-main"><div id="root"></div></main></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  await withFixtureBrowser(server, () => (browserEngine === "webkit" ? webkit : chromium).launch(), async browser => {

  const errors: string[] = [], blocked: string[] = [], results: Record<string, unknown>[] = [];
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9YQAAAAASUVORK5CYII=", "base64");
  const tasks = [
    { card: "teacher-photo", title: "Photo", id: "photo-child", label: "Child for photo" },
    { card: "teacher-incident", title: "Incident report", id: "incident-child", label: "Child for incident" },
    { card: "teacher-location", title: "Child location", id: "location-child", label: "Child to move" },
  ];
  const settle = async (page: import("playwright").Page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  };
  async function open(extra = "", real = false, width = 390, zoom = 100) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const state = { expectedPath: "", childId: "", status: 200, hold: false, release: null as null | (() => void), dialog: "reject" as "reject" | "cancel" | "confirm", dialogs: 0 };
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) { blocked.push("Off-origin request"); return route.abort(); }
      if (url.pathname.startsWith("/api/")) {
        if (real && request.method() === "GET" && url.pathname === "/api/teacher/offline-queue-key") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ key: Buffer.alloc(32, 7).toString("base64"), scopeId: "fake-scope" }) });
        if (real && request.method() === "POST" && state.expectedPath === url.pathname && ["/api/teacher/incidents", "/api/children/location"].includes(url.pathname)) {
          const body = request.postDataJSON() as Record<string, unknown>;
          assert.equal(body.childId, state.childId, "Exact visible fake child reaches request boundary");
          state.expectedPath = ""; writes.push({ path: url.pathname, body });
          if (state.hold) await new Promise<void>(resolve => { state.release = resolve; });
          return route.fulfill({ status: state.status, contentType: "application/json", body: JSON.stringify(state.status === 200 ? { ok: true } : { ok: false, error: "Fake rejection; draft retained" }) });
        }
        blocked.push(request.method() + " " + url.pathname); return route.abort();
      }
      if (request.method() !== "GET") { blocked.push("Non-API write"); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on("pageerror", () => errors.push("Client exception"));
    page.on("dialog", async dialog => { state.dialogs++; if (state.dialog === "confirm") await dialog.accept(); else { if (state.dialog === "reject") errors.push("Unexpected dialog"); await dialog.dismiss(); } });
    await page.goto(base + "/?view=teacher" + (real ? "" : "&teacher-layout-only=1") + extra, { waitUntil: "networkidle" });
    await page.locator('html[data-fixture-ready="true"]').waitFor();
    await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, zoom); await settle(page);
    return { context, page, state };
  }
  async function expand(page: import("playwright").Page, title: string) {
    const button = page.getByRole("button", { name: "Expand " + title, exact: true }); if (await button.count()) await button.click();
  }
  async function choose(page: import("playwright").Page, id: string, name: string) {
    await page.locator("#" + id).click();
    const option = page.getByRole("option", { name: name + " · Preschool", exact: true });
    await option.click();
    await option.waitFor({ state: "hidden" });
  }
    for (const width of [320, 390]) for (const zoom of [100, 200]) for (const long of [false, true]) {
      const { context, page } = await open(long ? "&teacher-long-names=1" : "", false, width, zoom);
      try {
        const name = long ? "Fake Child 1 Alexandra Gabriella Montgomery-Santiago" : "Fake Child";
        for (const task of tasks) {
          await expand(page, task.title);
          const picker = page.getByRole("combobox", { name: task.label, exact: true }); await picker.waitFor(); await settle(page);
          const geometry = await picker.evaluate(el => {
            const r = el.getBoundingClientRect(), value = el.querySelector('[data-slot="select-value"]')!, v = value.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(value);
            return { controlWidth: r.width, height: r.height, inside: r.left >= 0 && r.right <= innerWidth, font: getComputedStyle(document.documentElement).fontSize, text: value.textContent, overflow: el.scrollWidth - el.clientWidth, pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
              fullName: [...range.getClientRects()].every(rect => !rect.width || (rect.left >= v.left - 1 && rect.right <= v.right + 1 && rect.top >= v.top - 1 && rect.bottom <= v.bottom + 1)) };
          });
          assert.equal(geometry.text, name); assert.equal(geometry.font, zoom === 100 ? "16px" : "32px");
          assert.ok(geometry.controlWidth >= 44 && geometry.height >= 44 && geometry.inside && geometry.fullName); assert.equal(geometry.overflow, 0); assert.equal(geometry.pageOverflow, 0);
          assert.equal(await picker.getAttribute("aria-describedby"), task.id + "-hint");
          await picker.press("Enter"); const options = page.getByRole("option"); await options.first().waitFor(); assert.equal(await options.count(), 2);
          const fit = await options.evaluateAll(items => items.every(el => { const r = el.getBoundingClientRect(); return r.height >= 44 && r.left >= 0 && r.right <= innerWidth && el.scrollWidth === el.clientWidth; })); assert.ok(fit);
          await page.keyboard.press("Escape"); await options.first().waitFor({ state: "hidden" });
          await page.waitForFunction(id => document.activeElement?.id === id, task.id);
          await picker.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(evidenceDirectory, task.id + "-" + width + "-" + zoom + "-" + (long ? "long" : "normal") + ".png") });
          results.push({ task: task.card, width, zoom, long, ...geometry });
        }
      } finally { await context.close(); }
    }
    for (const task of tasks) for (const multi of [false, true]) {
      const { context, page, state } = await open();
      try {
        for (const title of ["Photo", "Incident report", "Child location", "Daily Report", "My profile"]) await expand(page, title);
        if (multi) await page.getByRole("button", { name: "All visible", exact: true }).click();
        await page.getByLabel("Take or upload photo", { exact: true }).setInputFiles({ name: "fake-photo.png", mimeType: "image/png", buffer: png });
        await page.getByLabel("Photo caption for parents", { exact: true }).fill("Fake photo draft");
        await page.getByLabel("Incident type", { exact: true }).fill("Fake type");
        await page.getByLabel("Objective incident description", { exact: true }).fill("Fake description");
        await page.getByLabel("Action taken after incident", { exact: true }).fill("Fake action");
        await page.getByRole("combobox", { name: "Move to", exact: true }).click(); await page.getByRole("option", { name: "Gym", exact: true }).click();
        await page.getByLabel("Reason (optional)", { exact: true }).fill("Fake reason");
        await page.getByLabel("Teacher note for parents", { exact: true }).fill("Fake report draft");
        await page.getByLabel("Report date", { exact: true }).fill("2026-09-09");
        await page.getByRole("checkbox", { name: "Send to parent portal", exact: true }).uncheck();
        await page.getByLabel("Full name", { exact: true }).fill("Fake profile draft");
        await choose(page, task.id, "Fake Child"); assert.equal(state.dialogs, 0, "Same-child choice is a no-op");
        state.dialog = "cancel"; await choose(page, task.id, "Fake Child 2"); assert.equal(state.dialogs, 1);
        for (const field of tasks) assert.equal((await page.locator("#" + field.id).innerText()).includes("Fake Child 2"), false);
        for (const [label, expected] of [["Photo caption for parents", "Fake photo draft"], ["Incident type", "Fake type"], ["Objective incident description", "Fake description"], ["Action taken after incident", "Fake action"], ["Reason (optional)", "Fake reason"], ["Teacher note for parents", "Fake report draft"], ["Full name", "Fake profile draft"]]) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), expected);
        assert.match(await page.locator("#teacher-location-target").innerText(), /Gym/);
        assert.equal(await page.getByLabel("Take or upload photo", { exact: true }).evaluate((el: HTMLInputElement) => el.files?.[0]?.name), "fake-photo.png");
        state.dialog = "confirm"; await choose(page, task.id, "Fake Child 2"); assert.equal(state.dialogs, 2);
        for (const field of tasks) assert.match(await page.locator("#" + field.id).innerText(), /Fake Child 2/);
        for (const label of ["Photo caption for parents", "Objective incident description", "Action taken after incident", "Reason (optional)"]) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), "");
        assert.equal(await page.getByLabel("Incident type", { exact: true }).inputValue(), "Minor injury"); assert.match(await page.locator("#teacher-location-target").innerText(), /Playground/);
        assert.equal(await page.getByLabel("Take or upload photo", { exact: true }).evaluate((el: HTMLInputElement) => el.files?.length), 0);
        assert.equal(await page.getByLabel("Teacher note for parents", { exact: true }).inputValue(), multi ? "Fake report draft" : "");
        assert.equal(await page.getByLabel("Report date", { exact: true }).inputValue(), "2026-09-09"); assert.equal(await page.getByRole("checkbox", { name: "Send to parent portal", exact: true }).isChecked(), false);
        assert.equal(await page.getByLabel("Full name", { exact: true }).inputValue(), "Fake profile draft");
        results.push({ task: task.card, multi, sameChildNoOp: true, cancelRetainsAll: true, confirmExactSharedContext: true, profileAndReportSettingsRetained: true });
      } finally { await context.close(); }
    }
    for (const task of [tasks[1], tasks[2]]) {
      const { context, page, state } = await open("", true);
      try {
        for (const title of ["Photo", "Incident report", "Child location"]) await expand(page, title);
        await choose(page, task.id, "Fake Child 2");
        const incident = task.id === "incident-child", endpoint = incident ? "/api/teacher/incidents" : "/api/children/location";
        const field = page.getByLabel(incident ? "Objective incident description" : "Reason (optional)", { exact: true });
        const save = page.getByRole("button", { name: incident ? "Send incident report" : "Update Location", exact: true });
        await field.fill("Fake exact target draft"); state.expectedPath = endpoint; state.childId = "fake-child-2"; state.status = 403;
        await save.click(); await page.getByText("Fake rejection; draft retained", { exact: true }).waitFor(); assert.equal(await field.inputValue(), "Fake exact target draft");
        state.expectedPath = endpoint; state.status = 200; state.hold = true;
        await save.click(); await page.waitForFunction(id => document.querySelector<HTMLButtonElement>("#" + id)?.disabled, task.id);
        for (const picker of tasks) assert.equal(await page.locator("#" + picker.id).isDisabled(), true);
        assert.equal(await field.isDisabled(), true); assert.equal(await save.isDisabled(), true);
        assert.ok(state.release); state.release(); await page.waitForFunction(id => !document.querySelector<HTMLButtonElement>("#" + id)?.disabled, task.id);
        assert.equal(await field.inputValue(), ""); state.hold = false;
        await choose(page, task.id, "Fake Child"); await field.fill("New fake child-one draft"); await settle(page);
        assert.equal(await field.inputValue(), "New fake child-one draft"); assert.equal(state.expectedPath, "");
        results.push({ task: task.card, exactPayload: "fake-child-2", rejectionRetains: true, allPickersLockedWhilePending: true, nextDraftRetained: true });
      } finally { await context.close(); }
    }
    {
      const { context, page, state } = await open();
      try {
        for (const task of tasks) await expand(page, task.title);
        await page.getByLabel("Objective incident description", { exact: true }).fill("Fake removed-child draft");
        await page.evaluate(() => window.dispatchEvent(new CustomEvent("fake-teacher-remove-child", { detail: "fake-child" })));
        await page.getByText("Review selected children", { exact: true }).waitFor();
        for (const task of tasks) assert.match(await page.locator("#" + task.id).innerText(), /Choose a current child/);
        assert.equal(await page.getByRole("button", { name: "Send incident report", exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: "Update Location", exact: true }).isDisabled(), true);
        assert.equal(await page.getByLabel("Objective incident description", { exact: true }).inputValue(), "Fake removed-child draft");
        state.dialog = "cancel"; await choose(page, "incident-child", "Fake Child 2"); assert.equal(state.dialogs, 1);
        assert.match(await page.locator("#incident-child").innerText(), /Choose a current child/);
        results.push({ removedChild: true, noFallback: true, draftRetained: true, submitDisabled: true });
      } finally { await context.close(); }
    }
    {
      const { context, page } = await open("&teacher-count=0");
      try {
        for (const task of tasks) { await expand(page, task.title); assert.equal(await page.locator("#" + task.id).isDisabled(), true); await page.locator("#" + task.id + "-hint").getByText("No children are on your roster.", { exact: false }).waitFor(); }
        for (const name of ["Send incident report", "Update Location", "Share Photo"]) assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true);
        results.push({ emptyRoster: true, allPickersAndSubmitsDisabled: true });
      } finally { await context.close(); }
    }
    assert.equal(writes.length, 4); assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    await writeFile(path.join(evidenceDirectory, "results.json"), JSON.stringify({ engine: browserEngine, passed: true, cases: results.length, results, errors, blocked, interceptedFakeWrites: writes.length, productWrites: 0 }, null, 2));
    console.log(JSON.stringify({ engine: browserEngine, passed: true, cases: results.length, interceptedFakeWrites: writes.length, productWrites: 0 }));
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
