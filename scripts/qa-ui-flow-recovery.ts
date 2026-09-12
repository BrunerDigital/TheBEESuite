import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

// No credentials or backend: real components, fake props, intercepted requests only.
async function main() {
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
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.contents); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
  const writes: Array<{ path: string; body: string | null }> = [];
  let outcome: "abort" | "reject" | "success" = "abort";
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith("/api/")) {
      if (request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      writes.push({ path: url.pathname, body: request.postData() });
      if (outcome === "abort") return route.abort("failed");
      return route.fulfill({ status: outcome === "reject" ? 403 : 200, contentType: "application/json", body: JSON.stringify(outcome === "reject" ? { error: "Fake test denial" } : { ok: true }) });
    }
    if (request.method() !== "GET") throw new Error("Unexpected non-API write blocked");
    return route.continue();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error("Local fixture error:", error.message); });
  try {
    await page.goto(`${base}/?view=fte`);
    await page.getByText("Historical reporting week", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Week start", { exact: true }).inputValue(), "2026-04-08");
    assert.equal(await page.getByLabel("Week end", { exact: true }).inputValue(), "2026-04-15");
    const notes = page.getByPlaceholder("Optional context or correction notes");
    assert.equal(await notes.inputValue(), "Fake saved historical notes");
    await notes.fill("Fake notes-only correction");
    await page.getByRole("button", { name: "Save FTE Correction", exact: true }).click();
    await page.getByText(/could not confirm whether this FTE report was saved/).waitFor();
    assert.equal(await notes.inputValue(), "Fake notes-only correction");
    assert.equal(writes.length, 1);
    const submitted = JSON.parse(writes[0].body!);
    assert.equal(submitted.id, "fake-historical-b");
    assert.equal(submitted.centerId, "b");
    assert.equal(submitted.weekStart, "2026-04-08");
    assert.equal(submitted.weekEnd, "2026-04-15");
    assert.equal(submitted.fteCount, "0");
    assert.equal(submitted.totalBilledAmount, "0");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Restore saved report" }).click();
    assert.equal(await notes.inputValue(), "Fake notes-only correction");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restore saved report" }).click();
    assert.equal(await notes.inputValue(), "Fake saved historical notes");
    await page.goto(`${base}/?view=fte&director=1&approved=1`);
    await page.getByText("Approved report · read-only", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save FTE Correction", exact: true }).isDisabled(), true);
    assert.equal(await page.getByPlaceholder("Optional context or correction notes").isDisabled(), true);
    await page.goto(`${base}/?view=fte&single-school=1&approved=1`);
    await page.getByText("Historical reporting week", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save FTE Correction", exact: true }).isEnabled(), true, "Executive approval permissions survive a single-school workspace");
    assert.equal(await page.getByPlaceholder("Optional context or correction notes").isEnabled(), true);
    await page.goto(`${base}/?view=fte-reader`);
    await page.getByText("Historical FTE Explorer", { exact: true }).last().waitFor();
    assert.equal(await page.getByRole("button", { name: /^Correct FTE/ }).count(), 0);

    await page.goto(`${base}/?view=home`);
    const earlier = page.locator("[data-earlier-announcements]");
    await earlier.waitFor();
    assert.equal(await earlier.getAttribute("open"), null);
    await earlier.locator("summary").press("Enter");
    assert.ok(await earlier.getAttribute("open") !== null);
    await page.getByText("Fake earlier classroom news remains available.", { exact: true }).waitFor();

    await page.goto(`${base}/?view=messages`);
    const message = page.locator("#portal-message");
    await message.fill("Fake unsent reply retained");
    await page.locator("#portal-message-attachments").setInputFiles({ name: "fake-note.txt", mimeType: "text/plain", buffer: Buffer.from("Fake attachment only") });
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Reply", exact: true }).first().click();
    assert.equal(await page.getByText("Replying to school", { exact: true }).count(), 0);
    assert.equal(await message.inputValue(), "Fake unsent reply retained");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reply", exact: true }).first().click();
    await page.getByText("Replying to school", { exact: true }).waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reply", exact: true }).last().click();
    assert.equal(await message.inputValue(), "Fake unsent reply retained");
    assert.equal(await page.locator('[aria-label="Selected attachments"]').getByText("fake-note.txt", { exact: true }).count(), 1);
    assert.equal(writes.length, 1, "Changing reply context never sends the draft");

    await page.goto(`${base}/?view=children`);
    outcome = "reject";
    await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
    await page.getByText("Fake test denial", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Acknowledge", exact: true }).count(), 1);
    outcome = "success";
    await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Acknowledged" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Acknowledge", exact: true }).count(), 0, "Receipt updates even with router refresh held");

    await page.goto(`${base}/?view=teacher`);
    outcome = "abort";
    await page.locator("#teacher-profile-setup").getByRole("button", { expanded: false }).first().click();
    await page.getByLabel("Full name", { exact: true }).fill("Fake Teacher Draft");
    await page.getByLabel("Staff kiosk code", { exact: true }).fill("1234");
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await page.getByText(/could not confirm whether your profile was saved/).waitFor();
    assert.equal(await page.getByLabel("Full name", { exact: true }).inputValue(), "Fake Teacher Draft");
    assert.equal(await page.getByLabel("Staff kiosk code", { exact: true }).inputValue(), "1234");
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('#teacher-profile-setup button[type="submit"]')?.disabled === false);
    assert.equal(await page.getByRole("button", { name: "Save profile", exact: true }).isEnabled(), true);
    await page.locator("#teacher-photo").getByRole("button", { expanded: false }).first().click();
    await page.getByLabel("Take or upload photo", { exact: true }).setInputFiles({ name: "fake-photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9YQAAAAASUVORK5CYII=", "base64") });
    await page.getByLabel("Photo caption for parents", { exact: true }).fill("Fake photo draft caption");
    await page.getByRole("button", { name: "Share Photo", exact: true }).click();
    await page.getByText(/could not confirm whether the photo was shared/).waitFor();
    assert.equal(await page.getByLabel("Photo caption for parents", { exact: true }).inputValue(), "Fake photo draft caption");
    assert.equal(await page.getByLabel("Take or upload photo", { exact: true }).evaluate((element: HTMLInputElement) => element.files?.[0]?.name), "fake-photo.png");
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("#teacher-photo button")].some((button) => button.textContent?.trim() === "Share Photo" && !button.disabled));
    assert.equal(await page.getByRole("button", { name: "Share Photo", exact: true }).isEnabled(), true);
    assert.equal(writes.length, 5, "Exactly one request per explicit action; no automatic retries");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ["exact historical school/week", "saved zero retained", "uncertain save preserves draft", "no automatic retry", "discard cancel/confirm", "approved director locked", "auditor read-only", "earlier announcements keyboard disclosure", "reply context preserves draft and attachment", "acknowledgment reject/success with refresh held", "teacher profile failure retains inputs", "teacher photo failure retains selection and caption"], interceptedWrites: writes.length }));
  } finally { await browser.close(); await new Promise<void>((done) => server.close(() => done())); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
