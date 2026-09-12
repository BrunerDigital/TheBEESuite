import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

function arg(name: string, fallback: string) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] || fallback; }
const base = assertNonProductionBaseUrl(arg("--base-url", "http://localhost:3224"));
const engine = arg("--browser", "chromium");
assert.ok(["chromium", "webkit"].includes(engine));
const baseline = process.argv.includes("--baseline");
const roles = arg("--roles", "director,assistant-director,executive,regional,billing,auditor,teacher,parent").split(",");
const scenario = arg("--scenario", "long-content");
const widths = arg("--widths", "320,390").split(",").map(Number);
assert.ok(widths.length > 0 && widths.every(width => [320, 390, 768].includes(width)), "Unsupported navigation viewport");
const output = resolve(arg("--output-dir", `output/playwright/mobile-school-navigation-${engine}`));

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const role of roles) for (const width of widths) for (const zoom of [100, 200]) {
      const height = width === 320 ? 568 : width === 768 ? 1024 : 844;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const unsafe: string[] = [], errors: string[] = [], failures: string[] = [];
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) { unsafe.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(); page.on("pageerror", () => errors.push("Client exception"));
      const check = (condition: boolean, label: string) => { if (!condition) failures.push(label); };
      const shot = (suffix: string) => page.screenshot({ path: resolve(output, `${role}-${width}-${zoom}-${suffix}.png`) });
      const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      try {
        await page.goto(`${base}/device-preview?view=${role}&scenario=${scenario}`, { waitUntil: "networkidle" });
        await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        await page.evaluate(zoom => { document.documentElement.style.fontSize = `${zoom}%`; }, zoom); await settle();
        if (role === "assistant-director") check(await page.locator('.bee-app-frame[data-role="ASSISTANT_DIRECTOR"]').count() === 1, "Exact assistant-director fixture");
        const shell = await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>(".app-header")!, nav = document.querySelector<HTMLElement>(".app-bottom-navigation")!, main = document.querySelector<HTMLElement>("#workspace-main")!;
          const controls = [...nav.querySelectorAll<HTMLElement>(":scope > div > a, :scope > div > button")];
          const scope = header.querySelector<HTMLElement>(":scope > div.border-t");
          return { headerHeight: header.getBoundingClientRect().height, headerPosition: getComputedStyle(header).position, navHeight: nav.getBoundingClientRect().height,
            navRows: new Set(controls.map(el => Math.round(el.getBoundingClientRect().top))).size,
            controls: controls.map(el => ({ label: el.textContent?.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
            overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
            scopeClipped: scope ? [...scope.querySelectorAll<HTMLElement>("span")].filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).length : 0,
            headingOverflow: Math.max(0, ...[...main.querySelectorAll<HTMLElement>("h1")].map(el => el.scrollWidth - el.clientWidth)),
            mainWidth: main.getBoundingClientRect().width };
        });
        check(shell.overflow === 0, "Document horizontal reflow"); check(shell.rootFont === 16 * zoom / 100, "Actual text enlargement");
        check(shell.headingOverflow <= 1, "Complete page title wraps inside its content width");
        check(shell.controls.every(item => item.width >= 44 && item.height >= 44), "All navigation touch targets >=44px");
        check(shell.navRows <= (zoom === 200 ? 2 : 1), "Navigation uses no more than two enlarged-text rows");
        check(shell.scopeClipped === 0, "School/classroom context readable without truncation");
        if (scenario === "school-context") {
          check(await page.locator(".app-header-scope").getByText("Sunshine Group · Carmel, IN", { exact: true }).isVisible(), "Selected school retains company and city context");
        }
        if (height <= 640) check(shell.headerPosition !== "sticky", "Short phone header stays in document flow");
        check(shell.navHeight < height * 0.3, "Fixed navigation leaves usable content space");
        await shot("home");
        let more: Record<string, unknown> | null = null, drawer: Record<string, unknown> | null = null;
        const moreButton = page.getByRole("button", { name: "Open more navigation", exact: true });
        if (await moreButton.count()) {
          await moreButton.click(); const sheet = page.getByRole("dialog", { name: "More", exact: true }); await sheet.waitFor(); await settle();
          more = await sheet.evaluate(el => {
            const box = el.getBoundingClientRect(), close = el.querySelector<HTMLElement>('[data-slot="sheet-close"]')!.getBoundingClientRect();
            const links = [...el.querySelectorAll<HTMLElement>("a")], first = links[0].getBoundingClientRect();
            return { width: box.width, height: box.height, linkCount: links.length,
              internalOverflow: Math.max(0, el.scrollWidth - el.clientWidth, ...links.map(link => link.scrollWidth - link.clientWidth)),
              outside: Math.max(0, ...links.map(link => { const r = link.getBoundingClientRect(); return Math.max(box.left - r.left, r.right - box.right); })),
              closeOverlap: first.top < close.bottom && first.right > close.left && first.bottom > close.top,
              minTarget: Math.min(...links.map(link => link.getBoundingClientRect().height)) };
          });
          check(Number(more.internalOverflow) <= 1 && Number(more.outside) <= 1, "More links fit inside sheet");
          check(!more.closeOverlap, "More close control does not overlap first link");
          check(Number(more.minTarget) >= 44, "More link touch targets");
          const last = sheet.getByRole("link").last(); await last.focus(); await last.scrollIntoViewIfNeeded();
          check(await last.evaluate(el => document.activeElement === el), "Last More destination keyboard reachable");
          await sheet.getByRole("link").first().scrollIntoViewIfNeeded(); await shot("more");
          await page.keyboard.press("Escape"); await sheet.waitFor({ state: "hidden" }); await settle();
          check(await moreButton.evaluate(el => document.activeElement === el), "More dismissal restores trigger focus");
        }
        const drawerButton = page.getByRole("button", { name: "Open navigation", exact: true });
        if (await drawerButton.count()) {
          await drawerButton.click(); const sheet = page.getByRole("dialog", { name: "Navigation", exact: true }); await sheet.waitFor(); await settle();
          drawer = await sheet.evaluate(el => {
            const nav = el.querySelector<HTMLElement>('nav[aria-label="Workspace navigation"]')!, first = nav.querySelector<HTMLElement>("a")!;
            const view = el.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!, v = view.getBoundingClientRect(), r = first.getBoundingClientRect();
            return { width: el.getBoundingClientRect().width, viewHeight: v.height, firstVisible: r.top >= v.top - 1 && r.bottom <= v.bottom + 1,
              overflow: Math.max(0, el.scrollWidth - el.clientWidth, ...[...nav.querySelectorAll<HTMLElement>("a,summary")].map(item => item.scrollWidth - item.clientWidth)) };
          });
          check(drawer.firstVisible === true, "First authorized drawer destination immediately visible");
          check(Number(drawer.overflow) <= 1, "Drawer names and neighborhoods reflow");
          await shot("drawer");
          for (const summary of await sheet.locator("details > summary").all()) {
            if (!await summary.evaluate(el => el.parentElement?.hasAttribute("open"))) { await summary.focus(); await page.keyboard.press("Enter"); }
          }
          const last = sheet.locator('nav[aria-label="Workspace navigation"] a').last(); await last.focus(); await last.scrollIntoViewIfNeeded();
          check(await last.evaluate(el => document.activeElement === el), "Last authorized drawer destination keyboard reachable");
          // The focused destination may own a tooltip; Escape closes the topmost
          // popup first, then the drawer. Both actions must remain keyboard-only.
          await page.keyboard.press("Escape"); await settle();
          if (await sheet.isVisible()) { await page.keyboard.press("Escape"); }
          await sheet.waitFor({ state: "hidden" }); await settle();
          check(await drawerButton.evaluate(el => document.activeElement === el), "Drawer dismissal restores trigger focus");
          await drawerButton.click(); await sheet.waitFor(); await settle();
          const firstLink = sheet.locator('nav[aria-label="Workspace navigation"] a').first();
          const nextUrl = new URL((await firstLink.getAttribute("href"))!, base).href;
          await firstLink.click(); await page.waitForURL(nextUrl); await page.waitForLoadState("networkidle");
          await sheet.waitFor({ state: "hidden" });
          await drawerButton.click(); await sheet.waitFor(); await settle();
          const scopeLink = sheet.locator("a.app-scope-context-mobile");
          if (await scopeLink.count()) { await scopeLink.click(); await sheet.waitFor({ state: "hidden" }); }
          else { await sheet.getByRole("button", { name: "Close", exact: true }).click(); await sheet.waitFor({ state: "hidden" }); }
        }
        check(unsafe.length === 0 && errors.length === 0, "No API/write/off-origin attempts or client errors");
        results.push({ role, width, height, zoom, shell, more, drawer, failures, unsafe, errors, passed: failures.length === 0 });
      } catch (error) {
        await shot("failure").catch(() => undefined); throw error;
      } finally { await context.close(); }
    }
    const passed = results.every(result => result.passed);
    await writeFile(resolve(output, "results.json"), JSON.stringify({ engine, baseline, passed, cases: results }, null, 2));
    console.log(JSON.stringify({ engine, baseline, passed, cases: results.length, failed: results.filter(result => !result.passed).map(({ role, width, zoom, failures }) => ({ role, width, zoom, failures })) }));
    if (!baseline) assert.ok(passed, "Mobile school navigation checks failed");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
