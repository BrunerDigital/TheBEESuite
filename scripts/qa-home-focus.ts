import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";
import { homeFocusFilters } from "./qa-home-focus-options";

const argument = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] || fallback;
};
const base = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:3210"));
const output = resolve(argument("--output-dir", "output/playwright/home-focus"));
const engine = argument("--browser", "chromium");
const filters = homeFocusFilters(process.argv.slice(2));

async function main() {
  assert.ok(["chromium", "webkit"].includes(engine));
  const browser = await (engine === "webkit" ? webkit : chromium).launch();
  const results = [];
  await mkdir(output, { recursive: true });
  try {
    for (const width of [390, 1024]) for (const zoom of [1, 2]) for (const role of ["parent", "teacher", "director", "executive"]) {
      if ((filters.role && filters.role !== role) || (filters.width && Number(filters.width) !== width) || (filters.zoom && Number(filters.zoom) !== zoom)) continue;
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      const unsafe: string[] = [], errors: string[] = [], findings: unknown[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== "GET" || url.origin !== new URL(base).origin || url.pathname.startsWith("/api/")) {
          unsafe.push(`${request.method()} ${url.pathname}`);
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(`${base}/device-preview?view=${role}&scenario=long-content`, { waitUntil: "networkidle", timeout: 60000 });
      await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.evaluate((zoom) => { document.documentElement.style.fontSize = `${zoom * 100}%`; }, zoom);
      // Windows WebKit only Tabs through a subset of controls, even with Alt.
      // Keep its geometry/scroll checks explicit as programmatic focus, not a
      // claim about Safari/macOS full-keyboard navigation or a physical device.
      const webkitTargets = [];
      if (engine === "webkit") {
        for (const target of await page.locator('main :is(a[href], button, input, select, textarea, summary, [tabindex]):visible').all()) {
          if (await target.evaluate((element) => (element as HTMLElement).tabIndex >= 0 && !element.matches(":disabled"))) webkitTargets.push(target);
        }
      }
      const counts: Record<string, number> = {};
      for (const key of ["Tab", "Shift+Tab"]) {
        const visited = new Set<number>();
        let closedCycle = false;
        counts[key] = 0;
        for (let step = 0; step < 180; step++) {
          if (engine === "webkit") {
            const targets = key === "Tab" ? webkitTargets : [...webkitTargets].reverse();
            await targets[step % targets.length].focus();
          } else await page.keyboard.press(key);
          // Dismiss transient, keyboard-dismissible tooltips before inspecting the
          // focused control; their decorative arrows are not fixed navigation.
          await page.keyboard.press("Escape");
          await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
          const focus = await page.evaluate(() => {
            const element = document.activeElement;
            if (!(element instanceof HTMLElement) || element === document.body) return null;
            // Tooltips add DOM siblings on focus; DOM-order indexes are not stable identities.
            const state = window as typeof window & { __qaFocus?: { ids: WeakMap<Element, number>; next: number } };
            state.__qaFocus ??= { ids: new WeakMap(), next: 0 };
            if (!state.__qaFocus.ids.has(element)) state.__qaFocus.ids.set(element, state.__qaFocus.next++);
            const index = state.__qaFocus.ids.get(element)!;
            if (!element.closest("main")) return { index, inMain: false };
            const box = element.getBoundingClientRect();
            const header = document.querySelector(".app-header")?.getBoundingClientRect();
            const nav = [...document.querySelectorAll("nav")].map((node) => ({ node, box: node.getBoundingClientRect() }))
              .find(({ node, box }) => getComputedStyle(node).position === "fixed" && box.height > 0 && box.bottom >= innerHeight - 1)?.box;
            const safeTop = Math.max(0, header?.bottom ?? 0), safeBottom = Math.min(innerHeight, nav?.top ?? innerHeight);
            // Large linked cards/disclosures may extend outside the safe view when
            // their scroll margins are included. Inspect their visible intersection.
            // Ordinary controls (up to half the safe viewport) must fit completely.
            const oversized = box.height > (safeBottom - safeTop) / 2;
            const top = oversized ? Math.max(box.top, safeTop) : box.top;
            const bottom = oversized ? Math.min(box.bottom, safeBottom) : box.bottom;
            const enoughVisible = oversized ? bottom - top >= (safeBottom - safeTop) / 2 : bottom > top;
            const inBounds = top >= safeTop - 1 && bottom <= safeBottom + 1 && enoughVisible && box.left >= -1 && box.right <= innerWidth + 1;
            const points = [0.2, 0.5, 0.8].flatMap((x) => [0.2, 0.5, 0.8].map((y) => ({ x: box.left + box.width * x, y: top + (bottom - top) * y })));
            const obstructions = points.flatMap(({ x, y }) => {
              const hit = document.elementFromPoint(x, y);
              return element === hit || element.contains(hit) || (element instanceof HTMLInputElement && [...(element.labels ?? [])].some((label) => label === hit || label.contains(hit))) ? [] : [{ tag: hit?.tagName, slot: hit?.getAttribute("data-slot"), className: hit?.getAttribute("class")?.slice(0, 100) }];
            });
            return { index, inMain: true, visible: inBounds && !obstructions.length, label: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90), box: { x: box.x, y: box.y, width: box.width, height: box.height }, safeTop, safeBottom, oversized, obstructions };
          });
          if (!focus) continue;
          if (visited.has(focus.index)) { closedCycle = true; break; }
          visited.add(focus.index);
          if (focus.inMain) {
            counts[key]++;
            if (!focus.visible) {
              findings.push({ key, ...focus });
              if (findings.length <= 4) await page.screenshot({ path: resolve(output, `${engine}-${role}-${width}-${zoom}-failure-${findings.length}.png`), caret: "initial" });
            }
          }
        }
        assert.ok(closedCycle && counts[key] >= 10, `${role}: completed a real ${key} focus cycle (${counts[key]} main controls, ${visited.size} total)`);
      }
      assert.equal(counts.Tab, counts["Shift+Tab"], "Both directions visit every main control");
      if (role === "parent") {
        const summary = page.locator("#parent-home-announcements summary");
        const preview = summary.locator(".line-clamp-4");
        const collapsed = await preview.evaluate((element) => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }));
        if (collapsed.height > collapsed.lineHeight * 4 + 1) findings.push({ announcementPreview: collapsed });
        await summary.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(output, `${engine}-parent-${width}-${zoom}-announcement.png`), caret: "initial" });
        await summary.press("Enter");
        assert.equal(await page.locator("#parent-home-announcements details").getAttribute("open"), "");
        assert.equal(await preview.isVisible(), false);
        assert.ok(await page.locator("#parent-home-announcements details > p").isVisible(), "The full announcement remains available");
        await summary.press("Enter");
        assert.ok(await preview.isVisible());
      }
      if (["director", "executive"].includes(role)) {
        const expand = page.locator("#dashboard-ai-daily-summary button[aria-expanded]");
        await expand.focus();
        await page.screenshot({ path: resolve(output, `${engine}-${role}-${width}-${zoom}-expand.png`), caret: "initial" });
        await expand.press("Enter");
        assert.equal(await expand.getAttribute("aria-expanded"), "true");
        await expand.press("Enter");
        assert.equal(await expand.getAttribute("aria-expanded"), "false");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, "No horizontal overflow");
      results.push({ role, width, zoom, focusMode: engine === "webkit" ? "programmatic-forward-and-reverse" : "keyboard-Tab-and-Shift-Tab", counts, findings, unsafeRequests: unsafe, pageErrors: errors });
      console.log(JSON.stringify({ engine, role, width, zoom, counts, findings: findings.length, unsafeRequests: unsafe.length, pageErrors: errors.length }));
      await context.close();
    }
    assert.ok(results.length > 0, "A passing focus audit must execute at least one case");
    await writeFile(resolve(output, `${engine}-results.json`), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
    assert.ok(results.every((row) => !row.findings.length && !row.unsafeRequests.length && !row.pageErrors.length), "Review focus and disclosure failures in the browser report");
  } finally { await browser.close(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
