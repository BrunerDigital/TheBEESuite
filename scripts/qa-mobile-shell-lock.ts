import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { assertNonProductionBaseUrl } from "./qa-standards";

const base = assertNonProductionBaseUrl(process.argv[2] ?? "http://127.0.0.1:3216");

async function main() {
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
  const browser = await engine.launch();
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      for (const view of ["parent", "teacher", "director"]) for (const textScale of [1, 2]) {
        const page = await browser.newPage({ viewport, serviceWorkers: "block" });
        try {
          const scenario = view === "parent" ? "&screen=home&scenario=quiet-home" : "";
          await page.goto(`${base}/device-preview?view=${view}${scenario}`, { waitUntil: "networkidle" });
          await page.locator('html[data-device-preview-hydrated="true"]').waitFor();
          await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale * 100}%`; }, textScale);
          const before = await page.evaluate(() => {
            const main = document.querySelector<HTMLElement>("#workspace-main")!;
            const header = document.querySelector<HTMLElement>(".app-header")!;
            const nav = document.querySelector<HTMLElement>(".app-bottom-navigation")!;
            const links = [...nav.querySelectorAll<HTMLElement>("a,button")];
            return {
              documentHeight: document.documentElement.scrollHeight,
              mainHeight: main.clientHeight,
              contentHeight: main.scrollHeight,
              headerTop: header.getBoundingClientRect().top,
              headerBottom: header.getBoundingClientRect().bottom,
              navTop: nav.getBoundingClientRect().top,
              navBottom: nav.getBoundingClientRect().bottom,
              itemTops: links.map((link) => Math.round(link.getBoundingClientRect().top)),
            };
          });
          assert.ok(before.documentHeight <= viewport.height + 1, `${name} ${view} ${textScale}: document must not scroll`);
          assert.ok(before.headerBottom <= before.navTop, `${name} ${view}: bars must leave a content area`);
          assert.ok(before.itemTops.every((top) => top === before.itemTops[0]), `${name} ${view}: navigation must remain on one row`);
          await page.locator("#workspace-main").evaluate((main) => { main.scrollTop = 500; });
          const after = await page.evaluate(() => ({
            headerTop: document.querySelector(".app-header")!.getBoundingClientRect().top,
            navTop: document.querySelector(".app-bottom-navigation")!.getBoundingClientRect().top,
            navBottom: document.querySelector(".app-bottom-navigation")!.getBoundingClientRect().bottom,
            mainScrollTop: document.querySelector("#workspace-main")!.scrollTop,
          }));
          assert.equal(after.headerTop, before.headerTop, `${name} ${view}: header moved`);
          assert.equal(after.navTop, before.navTop, `${name} ${view}: navigation moved`);
          assert.equal(after.navBottom, before.navBottom, `${name} ${view}: navigation changed height`);
          assert.ok(Math.abs(after.navBottom - viewport.height) < 1, `${name} ${view}: navigation must meet viewport bottom`);
          if (before.contentHeight > before.mainHeight + 1) assert.ok(after.mainScrollTop > 0, `${name} ${view}: content must scroll`);
          if (name === "chromium" && view === "parent" && viewport.width === 390 && textScale === 1) {
            assert.equal(before.contentHeight, before.mainHeight, "Quiet parent home should fit a standard phone without scrolling");
          }
          console.log(JSON.stringify({ name, view, viewport, textScale, ...before, mainScrollTop: after.mainScrollTop }));
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
