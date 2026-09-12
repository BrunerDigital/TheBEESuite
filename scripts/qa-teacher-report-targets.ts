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
  const evidenceDirectory = path.resolve(`output/playwright/teacher-report-targets-${browserEngine}`);
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
  const context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce" });
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || request.method() !== "GET" || url.pathname.startsWith("/api/")) {
      blocked.push(request.method() + " " + url.pathname); return route.abort();
    }
    return route.continue();
  });
  const settle = async (page: import("playwright").Page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  };
  const open = async (width: number, zoom: number, count: number, extra = "") => {
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on("pageerror", () => errors.push("Client exception"));
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.goto(base + "/?view=teacher&teacher-layout-only=1&teacher-count=" + count + extra, { waitUntil: "networkidle" });
    await page.locator('html[data-fixture-ready="true"]').waitFor();
    const toggle = page.getByRole("button", { name: "Expand Daily Report", exact: true }); if (await toggle.count()) await toggle.click();
    await page.evaluate(zoom => { document.documentElement.style.fontSize = zoom + "%"; }, zoom); await settle(page);
    assert.ok(await page.evaluate(() => document.fonts.check("16px FixtureGeist") && getComputedStyle(document.body).fontFamily.includes("FixtureGeist")));
    return page;
  };
  const measure = async (page: import("playwright").Page) => {
    const geometry = await page.locator("#teacher-quick-log").evaluate(root => {
      const box = root.getBoundingClientRect(), picker = root.querySelector("#daily-report-child")!;
      const text = picker.querySelector('[data-slot="select-value"]')!, bounds = text.getBoundingClientRect(), range = document.createRange();range.selectNodeContents(text);
      return { height: box.height, pageOverflow: Math.max(0, document.documentElement.scrollWidth-innerWidth), internalOverflow: root.scrollWidth-root.clientWidth,
        font: getComputedStyle(document.documentElement).fontSize, selectedText: text.textContent, textOverflow: text.scrollWidth-text.clientWidth,
        clippedText: [...range.getClientRects()].some(r => r.width > 0 && (r.left < bounds.left-1 || r.right > bounds.right+1)),
        controls: [...root.querySelectorAll("button,summary")].map(el => { const r=el.getBoundingClientRect();return { label: el.textContent?.trim(), width:r.width,height:r.height,within:r.left>=box.left&&r.right<=box.right }; }) };
    });
    assert.equal(geometry.pageOverflow, 0); assert.equal(geometry.internalOverflow, 0); assert.equal(geometry.clippedText, false); assert.equal(geometry.textOverflow, 0);
    assert.ok(geometry.controls.every(c => c.width>=44&&c.height>=44&&c.within), JSON.stringify(geometry));
    assert.equal(await page.getByRole("combobox", { name: "Report targets", exact: true }).count(), 1);
    return geometry;
  };
    for (const width of [320,390]) for (const zoom of [100,200]) for (const count of [0,1,8,9,40,42]) {
      const page = await open(width, zoom, count);
      try {
        const targets = page.locator("#teacher-quick-log");
        if (count) await targets.getByRole("button", { name:"All visible",exact:true }).click();
        const selected = count>40 ? 1 : count;
        await page.getByText(selected+" of "+count+" selected · max 40",{exact:true}).waitFor();
        if (count>40) await page.getByText(/Choose no more than 40 children per report batch/).waitFor();
        if (!count) {
          await page.getByText("No children are on your roster. Ask your school office to confirm your classroom.",{exact:true}).waitFor();
          assert.ok(await page.getByRole("combobox",{name:"Report targets",exact:true}).isDisabled());
        }
        const geometry = await measure(page);
        assert.equal(geometry.controls.length,selected>1?4:3);
        if(selected>1){
          assert.equal(geometry.selectedText,selected+" children selected");
          const details=targets.locator('[data-report-recipients]'),summary=details.locator('summary');
          assert.equal(await details.evaluate(el=>(el as HTMLDetailsElement).open),false);
          await summary.press('Enter');await details.getByRole('list',{name:'Selected report recipients'}).waitFor();
          assert.equal(await details.getByRole('listitem').count(),selected,"Every selected child is inspectable, including all40");
          const listFit=await details.getByRole('listitem').evaluateAll(items=>items.every(el=>{const r=el.getBoundingClientRect();return el.scrollWidth===el.clientWidth&&r.left>=0&&r.right<=innerWidth;}));assert.ok(listFit);
          assert.equal(await details.locator('button,input,select,[role="combobox"]').count(),0,"Recipient review cannot retarget individual tasks");
          await summary.press('Enter');assert.equal(await details.evaluate(el=>(el as HTMLDetailsElement).open),false);
        }
        assert.equal(geometry.font,zoom===100?"16px":"32px");
        await targets.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidenceDirectory,width+"-"+zoom+"-"+count+"-targets.png")});
        results.push({width,zoom,roster:count,selected,...geometry});
      } finally { await page.close(); }
    }
    for (const width of [320,390]) for (const zoom of [100,200]) {
      const page = await open(width,zoom,2,"&teacher-long-names=1");
      try {
        const picker=page.getByRole("combobox",{name:"Report targets",exact:true});
        assert.equal((await measure(page)).selectedText,"Fake Child 1 Alexandra Gabriella Montgomery-Santiago");
        await picker.click();const option=page.getByRole("option",{name:"Fake Child 2 Alexandra Gabriella Montgomery-Santiago · Preschool",exact:true});await option.waitFor();
        const fit=await option.evaluate(el=>{const r=el.getBoundingClientRect();return {overflow:el.scrollWidth-el.clientWidth,width:r.width,height:r.height,within:r.left>=0&&r.right<=innerWidth};});
        assert.equal(fit.overflow,0);assert.ok(fit.width>=44&&fit.height>=44&&fit.within);
        await page.screenshot({path:path.join(evidenceDirectory,width+"-"+zoom+"-long-options.png")});
        await option.click();await settle(page);assert.equal((await measure(page)).selectedText,"Fake Child 2 Alexandra Gabriella Montgomery-Santiago");
        results.push({width,zoom,longNames:"complete in picker and options"});
      } finally {await page.close();}
    }
    const page = await open(390,100,2,"&teacher-present=0");
    try {
      await page.getByRole("button",{name:"Present children",exact:true}).click();await page.getByText(/No children are currently marked present/).waitFor();
      await page.getByText("1 of 2 selected · max 40",{exact:true}).waitFor();
      const photo=page.getByRole("button",{name:"Expand Photo",exact:true});if(await photo.count())await photo.click();
      await page.getByLabel("Photo caption for parents",{exact:true}).fill("Fake photo still belongs to child one");
      await page.locator("#daily-report-child").click();await page.getByRole("option",{name:"Fake Child 2 · Preschool",exact:true}).click();
      assert.equal(await page.getByLabel("Photo caption for parents",{exact:true}).inputValue(),"Fake photo still belongs to child one");
      assert.equal((await page.locator("#photo-child").innerText()).includes("Fake Child 2"),false);
      await page.getByRole("button",{name:"All visible",exact:true}).click();
      const recipients=page.locator('[data-report-recipients]');await recipients.locator('summary').press('Enter');
      await recipients.getByRole('listitem').filter({hasText:'Fake Child 2'}).click();
      assert.equal(await page.getByLabel("Photo caption for parents",{exact:true}).inputValue(),"Fake photo still belongs to child one");
      assert.equal((await page.locator("#photo-child").innerText()).includes("Fake Child 2"),false);
      await page.getByText("2 of 2 selected · max 40",{exact:true}).waitFor();
      assert.equal(await page.locator('#teacher-quick-log').getByRole('button',{name:'Selected child',exact:true}).count(),0);
      results.push({noPresent:"selection retained",reportPicker:"separate photo retained",recipientReview:"all names inspectable without changing photo draft or individual target"});
    } finally {await page.close();}
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
    await writeFile(path.join(evidenceDirectory,"results.json"),JSON.stringify({engine:browserEngine,passed:true,cases:results.length,results,errors,blocked,writes:0},null,2));
    console.log(JSON.stringify({engine:browserEngine,passed:true,cases:results.length,writes:0}));
  });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
