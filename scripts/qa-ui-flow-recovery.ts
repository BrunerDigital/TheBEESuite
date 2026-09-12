import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// No credentials or backend: real components, fake props, intercepted requests only.
async function main() {
  const browserEngine = process.env.QA_BROWSER_ENGINE === "webkit" ? "webkit" : "chromium";
  const evidenceDirectory = path.resolve(`output/playwright/ui-flow-recovery${browserEngine === "webkit" ? "-webkit" : ""}`);
  await mkdir(evidenceDirectory, { recursive: true });
  const stylePath = path.resolve("src/app/globals.css");
  const style = await postcss([tailwindcss()]).process(await readFile(stylePath, "utf8"), { from: stylePath });
  const fixtureFont = await readFile(path.resolve("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2"));
  const fixtureStyle = `${style.css}\n@font-face{font-family:FixtureGeist;src:url('/fixture-font.woff2') format('woff2');font-weight:100 900;font-display:swap} :root{--font-geist-sans:FixtureGeist,Arial,sans-serif;--font-geist-mono:monospace}`;
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
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(fixtureStyle); return; }
    if (request.url === "/fixture-font.woff2") { response.setHeader("Content-Type", "font/woff2"); response.end(fixtureFont); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const browser = await (browserEngine === "webkit" ? webkit : chromium).launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
  const writes: Array<{ path: string; body: string | null }> = [];
  let outcome: "abort" | "reject" | "success" | "hold" | "invalid-success" = "abort";
  let releaseHeld: (() => void) | undefined;
  function releaseHeldResponse() {
    assert.ok(releaseHeld, "Held save reached the intercepted boundary");
    releaseHeld();
  }
  let terminalPollFailure: "http" | "malformed" | null = null;
  let holdReaderQuotes = false;
  let wrongProfileTarget = false;
  const releaseReaderQuotes: Array<() => void> = [];
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith("/api/")) {
      if (request.method() === "GET" && url.pathname === "/api/billing/terminal-payment" && holdReaderQuotes) await new Promise<void>((resolve) => releaseReaderQuotes.push(resolve));
      if (request.method() === "GET" && url.pathname === "/api/billing/terminal-payment") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ readers: [{ id: "fake-reader", label: "Fake Reader", status: "online", actionStatus: null }], amounts: { invoiceAmountCents: Number(url.searchParams.get("amountCents")), accountCreditAppliedCents: 0, parentProcessingRecoveryAmountCents: 0, checkoutTotalCents: Number(url.searchParams.get("amountCents")), paymentRequired: true } }) });
      if (request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      writes.push({ path: url.pathname, body: request.postData() });
      if (outcome === "abort") return route.abort("failed");
      if (outcome === "hold") await new Promise<void>((resolve) => { releaseHeld = resolve; });
      if (url.pathname === "/api/billing/terminal-payment" && terminalPollFailure && JSON.parse(request.postData() || "{}").action === "payment_status") return route.fulfill({ status: terminalPollFailure === "http" ? 500 : 200, contentType: "application/json", body: "{}" });
      if (url.pathname === "/api/billing/terminal-payment" && outcome === "success") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, paymentId: "fake-payment", status: JSON.parse(request.postData() || "{}").action === "payment_status" ? "succeeded" : "processing" }) });
      if (url.pathname === "/api/teacher/profile" && (outcome === "success" || outcome === "hold")) {
        const input = JSON.parse(request.postData() || "{}");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, mode: "updated", profile: {
          id: "fake-teacher", centerId: wrongProfileTarget ? "other-fake-center" : "fake-center", name: input.name, title: input.title,
          contactEmail: input.contactEmail, phone: input.phone, classroomId: input.classroomId ?? "fake-room", hasStaffKioskCode: true,
        } }) });
      }
      if (/^\/api\/parent\/documents\/[^/]+\/submit$/.test(url.pathname) && outcome === "success") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, document: { id: decodeURIComponent(url.pathname.split("/")[4]), status: "SUBMITTED" } }) });
      return route.fulfill({ status: outcome === "reject" ? 403 : 200, contentType: "application/json", body: JSON.stringify(outcome === "reject" ? { error: "Fake test denial" } : outcome === "invalid-success" ? { ok: false } : { ok: true, ...(url.pathname === "/api/device-sessions" ? { revokedAt: new Date().toISOString() } : {}) }) });
    }
    if (request.method() !== "GET") throw new Error("Unexpected non-API write blocked");
    return route.continue();
  });
  const page = await context.newPage();
  async function openFixture(url: string) {
    await page.goto(url);
    await page.locator('html[data-fixture-ready="true"]').waitFor();
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error("Local fixture error:", error.message); });
  try {
    await openFixture(`${base}/?view=shortcuts`);
    await page.getByRole("link", { name: "First fake task", exact: true }).waitFor();
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const deferredFocus = await page.evaluate(async () => {
      const originalFrame = window.requestAnimationFrame, originalCancel = window.cancelAnimationFrame;
      let frameId = 1_000_000;
      const frames = new Map<number, FrameRequestCallback>();
      window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
      window.cancelAnimationFrame = (id) => { if (!frames.delete(id)) originalCancel(id); };
      try {
        const first = document.querySelector<HTMLAnchorElement>('a[href="#fake-task-a"]')!;
        const next = document.querySelector<HTMLAnchorElement>('a[href="#fake-task-b"]')!;
        const changed = new Promise<void>((done) => window.addEventListener("hashchange", () => done(), { once: true }));
        first.focus(); first.click(); await changed;
        next.focus();
        for (const callback of [...frames.values()]) callback(performance.now());
        return { focused: document.activeElement === next, queuedFrames: frames.size };
      } finally { window.requestAnimationFrame = originalFrame; window.cancelAnimationFrame = originalCancel; }
    });
    assert.equal(deferredFocus.queuedFrames, 1, "Click and hashchange schedule one navigation focus frame");
    assert.equal(deferredFocus.focused, true, "Deferred focus cannot steal the user's next shortcut");
    await page.getByRole("link", { name: "Next fake task", exact: true }).press("Enter");
    await page.locator('#fake-task-b [aria-expanded="true"]').waitFor();
    await openFixture(`${base}/?view=fte`);
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
    await openFixture(`${base}/?view=fte&director=1&approved=1`);
    await page.getByText("Approved report · read-only", { exact: true }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "School", exact: true }).isDisabled(), true, "Director picker remains locked even when multiple schools are readable");
    assert.equal(await page.getByRole("button", { name: "Save FTE Correction", exact: true }).isDisabled(), true);
    assert.equal(await page.getByPlaceholder("Optional context or correction notes").isDisabled(), true);
    await openFixture(`${base}/?view=fte&single-school=1&approved=1`);
    await page.getByText("Historical reporting week", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save FTE Correction", exact: true }).isEnabled(), true, "Executive approval permissions survive a single-school workspace");
    assert.equal(await page.getByPlaceholder("Optional context or correction notes").isEnabled(), true);
    await openFixture(`${base}/?view=fte-reader`);
    await page.getByText("Historical FTE Explorer", { exact: true }).last().waitFor();
    assert.equal(await page.getByRole("button", { name: /^Correct FTE/ }).count(), 0);

    for (const [zone, expectedDays] of [["America/New_York", 1], ["Asia/Tokyo", 2]] as const) {
      await openFixture(`${base}/?view=updates&tz=${encodeURIComponent(zone)}`);
      await page.getByRole("combobox", { name: "Choose update day" }).click();
      await page.getByRole("option").first().waitFor();
      assert.equal(await page.getByRole("option").count(), expectedDays, "Update days follow the selected family's school, not the AppShell default");
      await page.keyboard.press("Escape");
    }
    await openFixture(`${base}/?view=home`);
    const earlier = page.locator("[data-earlier-announcements]");
    await earlier.waitFor();
    assert.equal(await earlier.getAttribute("open"), null);
    await earlier.locator("summary").press("Enter");
    assert.ok(await earlier.getAttribute("open") !== null);
    await page.getByText("Fake earlier classroom news remains available.", { exact: true }).waitFor();

    await openFixture(`${base}/?view=messages`);
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

    await openFixture(`${base}/?view=children`);
    outcome = "reject";
    await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
    await page.getByText("Fake test denial", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Acknowledge", exact: true }).count(), 1);
    outcome = "success";
    await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Acknowledged" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Acknowledge", exact: true }).count(), 0, "Receipt updates even with router refresh held");

    await openFixture(`${base}/?view=teacher`);
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
    await page.locator("#teacher-daily-report").getByRole("button", { expanded: false }).first().click();
    await page.locator("#teacher-incident").getByRole("button", { expanded: false }).first().click();
    await page.getByLabel("Teacher note for parents", { exact: true }).fill("Fake report for original child");
    await page.getByLabel("Objective incident description", { exact: true }).fill("Fake incident for original child");
    await page.getByLabel("Action taken after incident", { exact: true }).fill("Fake action for original child");
    await page.locator("#photo-child").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("option", { name: /^Fake Child 2/ }).click();
    assert.match(await page.locator("#photo-child").innerText(), /Fake Child/);
    assert.doesNotMatch(await page.locator("#photo-child").innerText(), /Fake Child 2/);
    assert.equal(await page.getByLabel("Teacher note for parents", { exact: true }).inputValue(), "Fake report for original child");
    assert.equal(await page.getByLabel("Objective incident description", { exact: true }).inputValue(), "Fake incident for original child");
    assert.equal(await page.getByLabel("Take or upload photo", { exact: true }).evaluate((element: HTMLInputElement) => element.files?.[0]?.name), "fake-photo.png");
    await page.locator("#photo-child").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("option", { name: /^Fake Child 2/ }).click();
    assert.match(await page.locator("#photo-child").innerText(), /Fake Child 2/);
    for (const label of ["Teacher note for parents", "Objective incident description", "Action taken after incident", "Photo caption for parents"]) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), "");
    assert.equal(await page.getByLabel("Take or upload photo", { exact: true }).evaluate((element: HTMLInputElement) => element.files?.length), 0);

    await page.getByLabel("Photo caption for parents", { exact: true }).fill("Fake caption bound to child two");
    await page.getByLabel("Teacher note for parents", { exact: true }).fill("Fake report bound to child two");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "All visible", exact: true }).click();
    assert.equal(await page.getByLabel("Teacher note for parents", { exact: true }).inputValue(), "Fake report bound to child two");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "All visible", exact: true }).click();
    assert.equal(await page.getByLabel("Teacher note for parents", { exact: true }).inputValue(), "");
    assert.equal(await page.getByLabel("Photo caption for parents", { exact: true }).inputValue(), "Fake caption bound to child two", "Report target changes cannot reassign or erase a separate photo draft");
    await page.locator("#teacher-roster").getByRole("button", { expanded: false }).first().click();
    outcome = "hold";
    await page.getByRole("button", { name: "Check in Fake Child", exact: true }).click();
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>("#teacher-child-photo")?.matches(":disabled"));
    assert.equal(await page.getByLabel("Photo caption for parents", { exact: true }).isDisabled(), true);
    assert.match(await page.locator("#photo-child").innerText(), /Fake Child 2/, "Attendance for another child does not change draft selection");
    assert.equal(writes.length, 6);
    assert.equal(JSON.parse(writes[5].body!).childId, "fake-child");
    assert.ok(releaseHeld);
    (releaseHeld as (() => void) | undefined)?.();
    await page.waitForFunction(() => !document.querySelector<HTMLInputElement>("#teacher-child-photo")?.matches(":disabled"));
    assert.equal(await page.getByLabel("Photo caption for parents", { exact: true }).inputValue(), "Fake caption bound to child two");
    page.once("dialog", (dialog) => dialog.accept());
    await openFixture(`${base}/?view=teacher&large-roster=1`);
    await page.locator("#teacher-daily-report").waitFor();
    const collapsedReport = page.locator("#teacher-daily-report").getByRole("button", { expanded: false }).first();
    if (await collapsedReport.count()) await collapsedReport.click();
    await page.getByRole("button", { name: "All visible", exact: true }).click();
    await page.getByText(/Choose no more than 40 children per report batch/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save daily report", exact: true }).count(), 1, "An oversized batch leaves the initial one-child selection intact");
    const collapsedRoster = page.locator("#teacher-roster").getByRole("button", { expanded: false }).first();
    if (await collapsedRoster.count()) await collapsedRoster.click();
    for (let index = 2; index <= 40; index += 1) await page.getByRole("checkbox", { name: `Include Fake Child ${index} in daily report batch`, exact: true }).check();
    await page.getByRole("checkbox", { name: "Include Fake Child 41 in daily report batch", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "Include Fake Child 41 in daily report batch", exact: true }).isChecked(), false);
    assert.equal(await page.getByRole("button", { name: "Save 40 daily reports", exact: true }).count(), 1);
    assert.equal(writes.length, 6, "Draft switching and batch selection never submit content");
    outcome = "success";
    await page.getByLabel("Report date", { exact: true }).fill("2026-09-09");
    await page.getByLabel("Mood", { exact: true }).fill("Calm");
    await page.getByRole("checkbox", { name: "Send to parent portal", exact: true }).uncheck();
    await page.getByLabel("Teacher note for parents", { exact: true }).fill("Fake staff-only backdated report");
    await page.getByRole("button", { name: "Save 40 daily reports", exact: true }).click();
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>("#daily-report-date")?.matches(":disabled") === false && document.querySelector<HTMLTextAreaElement>("#teacher-note-for-parents")?.value === "");
    assert.equal(await page.getByLabel("Report date", { exact: true }).inputValue(), "2026-09-09");
    assert.equal(await page.getByLabel("Mood", { exact: true }).inputValue(), "Calm");
    assert.equal(await page.getByRole("checkbox", { name: "Send to parent portal", exact: true }).isChecked(), false);
    await page.getByRole("button", { name: "Selected child", exact: true }).click();
    const photoClosed = page.locator("#teacher-photo").getByRole("button", { expanded: false }).first();
    if (await photoClosed.count()) await photoClosed.click();
    await page.locator("#photo-child").click();
    await page.getByRole("option", { name: /^Fake Child 2 / }).click();
    assert.equal(await page.getByLabel("Report date", { exact: true }).inputValue(), "2026-09-09", "Ordinary child changes preserve saved report settings");
    assert.equal(await page.getByRole("checkbox", { name: "Send to parent portal", exact: true }).isChecked(), false);
    const locationClosed = page.locator("#teacher-location").getByRole("button", { expanded: false }).first();
    if (await locationClosed.count()) await locationClosed.click();
    await page.getByRole("combobox", { name: "Move to", exact: true }).click();
    await page.getByRole("option", { name: "Gym", exact: true }).click();
    await page.locator("#photo-child").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("option", { name: /^Fake Child 3 / }).click();
    assert.match(await page.locator("#photo-child").innerText(), /Fake Child 2/);
    assert.match(await page.locator("#teacher-location-target").innerText(), /Gym/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Discard classroom drafts", exact: true }).click();
    assert.match(await page.locator("#teacher-location-target").innerText(), /Playground/);
    assert.equal(writes.length, 7, "Only the explicit fake report save added a request");

    await openFixture(`${base}/?view=team`);
    await page.getByRole("heading", { name: "Team, users, and permissions", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Previous users", exact: true }).first().getAttribute("href"), "/staff?view=permissions&q=Fake&peoplePage=5&sessionPage=3#user-directory");
    assert.equal(await page.getByRole("link", { name: "Previous sessions", exact: true }).first().getAttribute("href"), "/staff?view=permissions&q=Fake&peoplePage=6&sessionPage=2#device-sessions");
    assert.equal(await page.getByText("251–251 of 251 users", { exact: true }).count(), 2);
    assert.equal(await page.getByText("101–101 of 101 sessions", { exact: true }).count(), 2);
    await page.getByText("All 5 role totals", { exact: true }).press("Enter");
    await page.getByText("Show 2 more assignments", { exact: true }).press("Enter");
    assert.equal(await page.getByText("Includes your assigned schools", { exact: false }).count(), 5);
    assert.equal(await page.getByRole("button", { name: /^Revoke / }).count(), 0);
    assert.equal(await page.getByText("Read only", { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const zoom of [1, 2]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale * 100}%`; }, zoom);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Directory ${width}px at ${zoom * 100}% must not overflow`);
        await page.screenshot({ path: path.join(evidenceDirectory, `team-directory-${width}-${zoom * 100}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
    await page.getByLabel("Find a user", { exact: true }).fill("Fake Director");
    await Promise.all([page.waitForURL(/\/staff\?/), page.getByRole("button", { name: "Search", exact: true }).click()]);
    const searched = new URL(page.url());
    assert.equal(searched.pathname, "/staff");
    assert.equal(searched.searchParams.get("view"), "permissions");
    assert.equal(searched.searchParams.get("q"), "Fake Director");
    assert.equal(searched.searchParams.get("sessionPage"), "3");
    assert.equal(searched.searchParams.get("peoplePage"), null);
    assert.equal(searched.hash, "#user-directory");
    await openFixture(`${base}/?view=team&manage=1&current-device=1`);
    await page.getByText("Use Sign out", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^Revoke / }).count(), 0);
    await openFixture(`${base}/?view=team&manage=1`);
    outcome = "abort";
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Revoke Fake classroom tablet", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "could not confirm whether this session ended" }).waitFor();
    assert.equal(writes.length, 8);
    outcome = "invalid-success";
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Revoke Fake classroom tablet", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "could not confirm whether this session ended" }).waitFor();
    assert.equal(await page.getByText("Ended", { exact: true }).count(), 0, "A malformed HTTP 200 must not end the visible session");
    assert.equal(writes.length, 9);
    outcome = "success";
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Revoke Fake classroom tablet", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Device session ended" }).waitFor();
    assert.equal(writes.length, 10);
    const billingWriteBaseline = writes.length;
    await openFixture(`${base}/?view=billing&family=a&director=1`);
    await page.locator("#billing-payment-description").fill("Fake payment for family A only");
    await page.getByRole("tab", { name: "Check payment", exact: true }).click();
    await page.locator("#billing-check-amount").fill("125.00");
    await page.locator("#billing-check-reference").fill("FAKE-A-125");
    await page.locator("#billing-check-notes").fill("Fake payer A notes");
    await page.locator("#billing-workbench-family").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("option", { name: "Fake Family C", exact: true }).click();
    assert.equal(await page.locator("#billing-check-reference").inputValue(), "FAKE-A-125");
    await page.locator("#billing-workbench-family").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("option", { name: "Fake Family C", exact: true }).click();
    assert.match(await page.locator("#billing-workbench-family").innerText(), /Fake Family C/);
    assert.equal(await page.locator("#billing-payment-description").inputValue(), "Tuition payment");
    await page.getByRole("tab", { name: "Check payment", exact: true }).click();
    assert.equal(await page.locator("#billing-check-amount").inputValue(), "");
    assert.equal(await page.locator("#billing-check-reference").inputValue(), "");
    assert.equal(await page.locator("#billing-check-notes").inputValue(), "");
    await page.locator("#billing-check-received-date").fill("2026-09-01T10:00");
    await page.locator("#billing-workbench-school").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("option", { name: /Fake School B/ }).click();
    assert.match(await page.locator("#billing-workbench-family").innerText(), /Fake Family C/);
    await page.locator("#billing-workbench-school").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("option", { name: /Fake School B/ }).click();
    assert.match(await page.locator("#billing-workbench-family").innerText(), /Fake Family B/);
    await page.getByRole("tab", { name: "Check payment", exact: true }).click();
    assert.notEqual(await page.locator("#billing-check-received-date").inputValue(), "2026-09-01T10:00");
    assert.equal(writes.length, billingWriteBaseline, "Confirmed family/school changes discard drafts but never submit them");
    await openFixture(`${base}/?view=billing&family=a&director=1&selectors=1`);
    await page.getByRole("tab", { name: "Check payment", exact: true }).click();
    await page.locator("#billing-check-reference").fill("FAKE-NAV-DRAFT");
    const draftUrl = page.url();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Open family", exact: true }).click();
    assert.equal(page.url(), draftUrl);
    assert.equal(await page.locator("#billing-check-reference").inputValue(), "FAKE-NAV-DRAFT");
    await page.locator("#billing-rate-name").fill("Fake unsaved rate");
    await page.locator("#billing-rate-record").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("option", { name: /^Fake saved rate/ }).click();
    assert.equal(await page.locator("#billing-rate-name").inputValue(), "Fake unsaved rate");
    await page.locator("#billing-rate-record").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("option", { name: /^Fake saved rate/ }).click();
    assert.equal(await page.locator("#billing-rate-name").inputValue(), "Fake saved rate");
    assert.equal(await page.locator("#billing-check-reference").inputValue(), "FAKE-NAV-DRAFT");
    await page.getByRole("button", { name: "More billing tasks", exact: true }).click();
    await page.getByRole("tab", { name: "Edit invoice", exact: true }).click();
    await page.locator("#billing-invoice-details").fill("Fake unsaved invoice note");
    await page.locator("#billing-invoice-editor").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("option", { name: /^FAKE-a-2 / }).click();
    assert.equal(await page.locator("#billing-invoice-details").inputValue(), "Fake unsaved invoice note");
    await page.locator("#billing-invoice-editor").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("option", { name: /^FAKE-a-2 / }).click();
    assert.notEqual(await page.locator("#billing-invoice-details").inputValue(), "Fake unsaved invoice note");
    await page.getByRole("tab", { name: "Check payment", exact: true }).click();
    assert.equal(await page.locator("#billing-check-reference").inputValue(), "FAKE-NAV-DRAFT");
    const acceptNavigation = (dialog: import("playwright").Dialog) => dialog.accept();
    page.on("dialog", acceptNavigation);
    await Promise.all([page.waitForURL(/\/family-detail\?/), page.getByRole("link", { name: "Open family", exact: true }).click()]);
    page.off("dialog", acceptNavigation);
    assert.equal(writes.length, billingWriteBaseline, "Navigation and selector discard confirmations never submit drafts");
    for (const view of ["billing", "terminal", "ledger"]) {
      const selector = view === "billing" ? "#billing-workbench-family" : view === "terminal" ? "#terminal-family" : "#family-ledger-family";
      for (const suffix of ["family=missing", "family=b&center=a"]) {
        await openFixture(`${base}/?view=${view}&${suffix}`);
        await page.getByText("Family selection needed", { exact: true }).waitFor();
        assert.doesNotMatch(await page.locator(selector).innerText(), /Fake Family [AB]/, `${view}: exact missing/mismatch must stay unselected`);
        await page.locator(selector).click();
        await page.getByRole("option", { name: /^Fake Family A/ }).click();
        assert.match(await page.locator(selector).innerText(), /Fake Family A/);
        assert.equal(await page.getByText("Family selection needed", { exact: true }).count(), 0);
      }
      await openFixture(`${base}/?view=${view}&family=a`);
      await page.locator(selector).waitFor();
      await page.getByRole("button", { name: "Navigate to missing", exact: true }).click();
      await page.getByText("Family selection needed", { exact: true }).waitFor();
      assert.doesNotMatch(await page.locator(selector).innerText(), /Fake Family A/);
      await page.getByRole("button", { name: "Navigate to b", exact: true }).click();
      assert.match(await page.locator(selector).innerText(), /Fake Family B/, `${view}: route-key remount must not retain A`);
      assert.equal(await page.getByRole("link", { name: /^(Open family|Family profile)$/ }).count(), 0, "Billing-only paths never offer forbidden profile links");
      if (view === "billing") {
        assert.equal(await page.getByRole("button", { name: "Save child setup", exact: true }).count(), 0);
        await page.locator("#billing-workbench-school").click();
        await page.getByRole("option", { name: /Fake School A/ }).click();
        assert.match(await page.locator(selector).innerText(), /Fake Family A/);
      }
      await page.screenshot({ path: path.join(evidenceDirectory, `billing-target-${view}-390.png`), fullPage: true });
    }
    await openFixture(`${base}/?view=ledger&family=past`);
    await page.getByText("No ledger entries match this family and date range.", { exact: true }).waitFor();
    assert.match(await page.locator("#family-ledger-family").innerText(), /Fake Historical Family/);
    assert.equal(await page.getByText("Fake ledger for a", { exact: true }).count(), 0);
    await openFixture(`${base}/?view=billing&family=a&director=1`);
    await page.getByRole("link", { name: "Open family", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save child setup", exact: true }).count(), 1);
    assert.equal(writes.length, billingWriteBaseline, "All billing target, role, and historical checks perform zero writes");
    for (const child of ["missing-child", "child-b"]) {
      await openFixture(`${base}/?view=billing&family=a&director=1&child=${child}`);
      await page.getByText("Child selection needed", { exact: true }).waitFor();
      assert.doesNotMatch(await page.locator("#billing-assignment-child").innerText(), /Fake Child/);
      assert.equal(await page.getByRole("button", { name: "Save child setup", exact: true }).isDisabled(), true);
      await page.locator("#billing-assignment-child").click();
      await page.getByRole("option", { name: "Fake Child A", exact: true }).click();
      assert.equal(await page.getByText("Child selection needed", { exact: true }).count(), 0);
    }
    await page.locator("#billing-child-start-date").fill("2026-09-15");
    await page.locator("#billing-assignment-child").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("option", { name: "Fake Child A Two", exact: true }).click();
    assert.doesNotMatch(await page.locator("#billing-assignment-child").innerText(), /Two/);
    assert.equal(await page.locator("#billing-child-start-date").inputValue(), "2026-09-15");
    await page.locator("#billing-assignment-child").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("option", { name: "Fake Child A Two", exact: true }).click();
    assert.match(await page.locator("#billing-assignment-child").innerText(), /Two/);
    assert.equal(await page.locator("#billing-child-start-date").inputValue(), "");
    outcome = "hold";
    releaseHeld = undefined;
    await page.getByRole("button", { name: "Save child setup", exact: true }).click();
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>("#billing-assignment-child")?.disabled);
    assert.equal(await page.locator("#billing-workbench-family").isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Select Fake Child A for recurring tuition setup", exact: true }).isDisabled(), true);
    assert.equal(await page.locator('#billing-workbench fieldset[aria-busy="true"]').evaluate((fieldset) => [...fieldset.querySelectorAll("input,button,select,textarea")].every((control) => control.matches(":disabled"))), true, "The entire mounted billing form locks, including every invoice, cohort, and plan selector");
    assert.ok(releaseHeld);
    outcome = "success";
    (releaseHeld as (() => void) | undefined)?.();
    await page.getByRole("status").filter({ hasText: "Program, classroom, and care schedule saved" }).waitFor();
    assert.equal(writes.length, billingWriteBaseline + 1, "Only the explicit mocked child-setup save added a request");
    await openFixture(`${base}/?view=terminal&family=a&request-boundary=1`);
    await page.getByRole("combobox", { name: "School card reader", exact: true }).waitFor();
    await page.locator("#terminal-payment-target").click();
    await page.getByRole("option", { name: "Custom family account payment", exact: true }).click();
    holdReaderQuotes = true;
    const firstQuote = page.waitForRequest((request) => request.method() === "GET" && request.url().includes("/api/billing/terminal-payment?") && new URL(request.url()).searchParams.get("amountCents") === "100");
    await page.locator("#terminal-custom-amount").pressSequentially("1");
    await firstQuote;
    assert.equal(await page.locator("#terminal-custom-amount").isEnabled(), true, "A slow read-only quote never locks typing after the first digit");
    const finalQuote = page.waitForRequest((request) => request.method() === "GET" && request.url().includes("/api/billing/terminal-payment?") && new URL(request.url()).searchParams.get("amountCents") === "12500");
    await page.locator("#terminal-custom-amount").pressSequentially("25.00", { delay: 30 });
    await finalQuote;
    assert.equal(await page.locator("#terminal-custom-amount").inputValue(), "125.00");
    assert.equal(await page.locator("#terminal-family").isEnabled(), true);
    holdReaderQuotes = false;
    releaseReaderQuotes.splice(0).forEach((release) => release());
    await page.getByRole("combobox", { name: "School card reader", exact: true }).waitFor();
    assert.equal(writes.length, billingWriteBaseline + 1, "Slow quote recovery never submits a payment");
    for (const receipt of ["invalid-success", "success", "status-http", "status-malformed"] as const) {
      terminalPollFailure = receipt === "status-http" ? "http" : receipt === "status-malformed" ? "malformed" : null;
      await openFixture(`${base}/?view=terminal&family=a&request-boundary=1`);
      await page.getByRole("combobox", { name: "School card reader", exact: true }).waitFor();
      await page.locator("#terminal-payment-target").click();
      await page.getByRole("option", { name: "Custom family account payment", exact: true }).click();
      await page.locator("#terminal-custom-amount").fill("125.00");
      await page.getByRole("checkbox", { name: /The parent is present/ }).check();
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].some((button) => button.textContent?.trim() === "Charge $125.00" && !button.disabled));
      outcome = "hold";
      releaseHeld = undefined;
      const requestStarted = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/billing/terminal-payment"));
      await page.getByRole("button", { name: "Charge $125.00", exact: true }).click();
      const submittedRequest = await requestStarted;
      assert.equal(submittedRequest.postDataJSON().familyId, "a");
      assert.equal(submittedRequest.postDataJSON().billingAccountId, "account-a");
      assert.equal(submittedRequest.postDataJSON().amountCents, 12500);
      assert.equal(await page.locator("#terminal-family").isDisabled(), true);
      assert.equal(await page.locator("#terminal-payment-target").isDisabled(), true);
      assert.equal(await page.locator("#terminal-custom-amount").isDisabled(), true);
      assert.equal(await page.getByRole("combobox", { name: "School card reader", exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole("checkbox", { name: /The parent is present/ }).isDisabled(), true);
      assert.match(await page.locator("#terminal-family").innerText(), /Fake Family A/);
      assert.ok(releaseHeld);
      outcome = receipt === "invalid-success" ? "invalid-success" : "success";
      (releaseHeld as (() => void) | undefined)?.();
      if (receipt === "invalid-success") {
        await page.getByText(/The payment outcome could not be confirmed/).waitFor();
        assert.equal(await page.locator("#terminal-family").isDisabled(), true);
        await page.getByText("Reader Settings", { exact: true }).click();
        assert.equal(await page.getByRole("button", { name: "Register reader", exact: true }).isDisabled(), true);
      } else if (receipt === "success") {
        await page.getByText("The in-person card payment was approved and recorded.", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Charge $125.00", exact: true }).isDisabled(), true, "A successful charge cannot be submitted again from the same receipt");
      } else {
        await page.getByText(/The payment status could not be confirmed/).waitFor();
        assert.equal(await page.locator("#terminal-family").isDisabled(), true);
        assert.equal(await page.locator("#terminal-payment-target").isDisabled(), true);
        assert.equal(await page.locator("#terminal-custom-amount").isDisabled(), true);
        assert.equal(await page.getByRole("combobox", { name: "School card reader", exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole("checkbox", { name: /The parent is present/ }).isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: "Charge $125.00", exact: true }).isDisabled(), true);
      }
    }
    const beforeDocuments = writes.length;
    await openFixture(`${base}/?view=home&document-case=approved&attention-case=hidden`);
    await page.locator("#parent-home-attention").getByText("12 items to review", { exact: true }).waitFor();
    await page.getByRole("link", { name: /5 incident reports to review/ }).waitFor();
    await page.getByRole("link", { name: /Upcoming payment.*FAKE-OLDER-OPEN/ }).waitFor();
    assert.equal(await page.getByText("You’re all caught up", { exact: true }).count(), 0);
    await openFixture(`${base}/?view=payments&document-case=approved&attention-case=hidden`);
    await page.getByText(/7 open invoices on this account; 20 records shown/).waitFor();
    assert.ok(await page.getByText("FAKE-OLDER-OPEN", { exact: true }).count());
    await openFixture(`${base}/?view=children&document-case=approved&attention-case=hidden`);
    await page.locator('#incidents [data-slot="card-content"] > div').first().getByText("Fake older report still needs acknowledgment", { exact: false }).waitFor();
    assert.equal(await page.locator("#incidents").getByRole("button", { name: "Acknowledge", exact: true }).count(), 1);
    await openFixture(`${base}/?view=home&document-case=many-required&multi-child=1`);
    await page.locator("#today article").first().waitFor();
    assert.equal(await page.locator("#today article").count(), 3);
    const actionsBox = await page.locator('[data-parent-home-actions="true"]').boundingBox();
    const childrenBox = await page.locator("#today").boundingBox();
    assert.ok(actionsBox && childrenBox && actionsBox.y < childrenBox.y, "Everyday shortcuts precede the unbounded sibling list");
    const requiredLink = page.getByRole("link", { name: /25 documents to review/ });
    assert.equal(new URL((await requiredLink.getAttribute("href"))!, base).searchParams.get("documentId"), "fake-required-1");
    for (const state of ["submitted", "approved"]) {
      await openFixture(`${base}/?view=documents&document-case=${state}&documentId=fake-document`);
      await page.getByText("No documents need your action.", { exact: false }).waitFor();
      const target = page.locator('[data-parent-document="fake-document"]');
      assert.equal(await target.getAttribute("open"), "");
      if (state === "submitted") {
        await target.getByText("Awaiting school review", { exact: true }).waitFor();
        assert.equal(await target.getByLabel("Type your full name", { exact: true }).isVisible(), false);
        await target.getByText("Replace submission (optional)", { exact: true }).click();
        assert.equal(await target.getByLabel("Type your full name", { exact: true }).isVisible(), true);
      } else {
        assert.equal(await target.locator("input,textarea,button").count(), 0, "Approved legacy signature markers cannot reopen submission controls");
      }
    }
    await openFixture(`${base}/?view=documents&document-case=history`);
    assert.match(await page.locator("[data-parent-document] > summary").first().innerText(), /Fake required form/);
    await page.getByText("1 document needs your action.", { exact: false }).waitFor();
    assert.equal(new URL((await page.getByRole("link", { name: "Next documents", exact: true }).getAttribute("href"))!, base).searchParams.get("documentsPage"), "2");
    await openFixture(`${base}/?view=documents&document-case=many-required&documentsPage=2`);
    await page.getByText("25 documents need your action.", { exact: false }).waitFor();
    assert.equal(await page.locator("[data-parent-document]").count(), 5);
    assert.match(await page.locator("[data-parent-document] > summary").first().innerText(), /Fake required form 21/);
    await openFixture(`${base}/?view=documents&document-case=many-required&documentId=fake-required-25`);
    assert.equal(await page.locator('[data-parent-document="fake-required-25"]').getAttribute("open"), "");
    await openFixture(`${base}/?view=documents&document-case=many-required&documentId=outside`);
    await page.getByText("Document not available", { exact: true }).waitFor();
    assert.equal(await page.locator("details[data-parent-document][open]").count(), 0);
    await openFixture(`${base}/?view=documents&document-case=many-required&documentId=fake-required-1`);
    const signature = page.locator("#parent-document-signature-fake-required-1");
    await signature.fill("Fake Guardian");
    await page.locator('[data-parent-document="fake-required-1"]').getByRole("checkbox").check();
    const documentUrl = page.url();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Next documents", exact: true }).click();
    assert.equal(page.url(), documentUrl);
    assert.equal(await signature.inputValue(), "Fake Guardian");
    outcome = "invalid-success";
    await page.getByRole("button", { name: "Sign and Submit", exact: true }).first().click();
    await page.getByRole("alert").filter({ hasText: "could not confirm this document submission" }).waitFor();
    assert.equal(await signature.inputValue(), "Fake Guardian");
    outcome = "success";
    await page.getByRole("button", { name: "Sign and Submit", exact: true }).first().click();
    await page.getByRole("status").filter({ hasText: "Document submitted for director review" }).waitFor();
    assert.equal(await signature.inputValue(), "");
    await page.getByText("24 documents need your action.", { exact: false }).waitFor();
    for (const status of ["SUBMITTED", "APPROVED", "REJECTED"]) {
      await page.evaluate((status) => window.dispatchEvent(new CustomEvent("fake-parent-server-refresh", { detail: { id: "fake-required-1", status } })), status);
      const target = page.locator('[data-parent-document="fake-required-1"]');
      await target.getByText(status === "SUBMITTED" ? "Awaiting school review" : status === "APPROVED" ? "Complete" : "Changes requested", { exact: true }).waitFor();
      await page.getByText(`${status === "REJECTED" ? 25 : 24} documents need your action.`, { exact: false }).waitFor();
      if (status === "APPROVED") assert.equal(await target.locator("input,textarea,button").count(), 0, "Authoritative approval replaces optimistic submission state");
      if (status === "REJECTED") assert.equal(await target.getByLabel("Type your full name", { exact: true }).isVisible(), true, "A new school rejection restores the required form");
    }
    assert.equal(writes.length, beforeDocuments + 2, "Only two explicit fake document submissions were intercepted");
    await page.screenshot({ path: path.join(evidenceDirectory, "parent-documents-confirmed-submit-390.png"), fullPage: true });
    await openFixture(`${base}/?view=teacher`);
    let profileDialogs = 0;
    const rejectProfileExit = async (dialog: import("playwright").Dialog) => { profileDialogs++; await dialog.dismiss(); };
    page.on("dialog", rejectProfileExit);
    await page.getByRole("link", { name: "Leave fake teacher" }).click();
    await page.waitForURL("**/?view=home");
    assert.equal(profileDialogs, 0, "An untouched profile starts clean");
    await openFixture(`${base}/?view=teacher`);
    const profileCard = page.locator("#teacher-profile-setup");
    await profileCard.waitFor();
    if (await profileCard.getByRole("button", { expanded: false }).count()) await profileCard.getByRole("button", { expanded: false }).first().click();
    await page.getByLabel("Full name", { exact: true }).fill("");
    assert.equal(await profileCard.getByText("Ready", { exact: true }).count(), 1, "Readiness describes saved data, not an unsaved input");
    await page.getByLabel("Full name", { exact: true }).fill("  Fake Teacher Confirmed  ");
    await page.getByLabel("Staff kiosk code", { exact: true }).fill("1234");
    await page.getByRole("link", { name: "Leave fake teacher" }).click();
    assert.equal(profileDialogs, 1); assert.match(page.url(), /view=teacher/);
    const beforeProfileWrites = writes.length;
    for (const invalid of ["invalid-success", "wrong-center"] as const) {
      outcome = invalid === "invalid-success" ? "invalid-success" : "success"; wrongProfileTarget = invalid === "wrong-center";
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await page.getByText(/could not confirm whether your profile was saved/).waitFor();
      await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('#teacher-profile-setup button[type="submit"]')?.disabled === false);
      assert.equal(await page.getByLabel("Full name", { exact: true }).inputValue(), "  Fake Teacher Confirmed  ");
      assert.equal(await page.getByLabel("Staff kiosk code", { exact: true }).inputValue(), "1234");
      assert.equal(await page.evaluate(() => (window as unknown as { __refreshes?: number }).__refreshes ?? 0), 0);
    }
    wrongProfileTarget = false; outcome = "hold"; releaseHeld = undefined;
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await page.getByRole("button", { name: "Save profile", exact: true }).evaluate((button: HTMLButtonElement) => { if (!button.disabled) throw new Error("Pending profile button was not locked"); });
    for (const input of await profileCard.locator("input").all()) assert.equal(await input.isDisabled(), true, "Every pending profile field remains locked");
    assert.equal(await page.locator("#teacher-profile-classroom").isDisabled(), true);
    for (let attempt = 0; !releaseHeld && attempt < 30; attempt++) await page.waitForTimeout(25);
    releaseHeldResponse();
    await page.getByText("Teacher profile setup saved.", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Full name", { exact: true }).inputValue(), "Fake Teacher Confirmed");
    assert.equal(await page.getByLabel("Staff kiosk code", { exact: true }).inputValue(), "");
    assert.equal(await page.evaluate(() => (window as unknown as { __refreshes?: number }).__refreshes ?? 0), 1);
    assert.equal(writes.length, beforeProfileWrites + 3, "Exactly one intercepted request per explicit profile save");
    assert.equal(await profileCard.getByText("Unsaved changes", { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(evidenceDirectory, "teacher-profile-confirmed-390.png"), fullPage: true });
    await page.getByRole("link", { name: "Leave fake teacher" }).click(); await page.waitForURL("**/?view=home");
    assert.equal(profileDialogs, 1, "An exact successful receipt clears only the profile draft guard");
    page.off("dialog", rejectProfileExit);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ["exact historical school/week", "saved zero retained", "uncertain save preserves draft", "no automatic retry", "discard cancel/confirm", "approved director locked", "auditor read-only", "family school timezone", "earlier announcements keyboard disclosure", "reply context preserves draft and attachment", "acknowledgment reject/success with refresh held", "teacher profile failure retains inputs", "teacher photo failure retains selection and caption", "teacher recipient discard guards", "attendance never retargets drafts", "pending controls locked", "report batches never silently truncate", "staff-only backdate settings survive save and child changes", "destination-only location draft guarded", "directory and session totals and paging", "directory canonical search and role disclosure", "read-only and current-device explanations", "session recovery and success announcement", "billing exact family and school", "billing route-key state refresh", "historical ledger without activity", "billing-only and enrollment permissions", "child exact targeting and discard guards", "confirmed context change clears financial drafts", "date-only billing draft guard", "pending reader target and confirmation lock", "unknown terminal result stays locked", "successful terminal charge cannot repeat"], interceptedWrites: writes.length }));
  } finally { await browser.close(); await new Promise<void>((done) => server.close(() => done())); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
