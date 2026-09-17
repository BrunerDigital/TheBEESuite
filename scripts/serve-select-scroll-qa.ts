import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { execFileSync } from "node:child_process";

async function main() {
  const bundle = await build({ entryPoints: ["tests/fixtures/select-scroll.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
  const baselineSource = execFileSync("git", ["show", "d426ed31:src/components/ui/select.tsx"], { encoding: "utf8" });
  const baseline = await build({ entryPoints: ["tests/fixtures/select-scroll.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "baseline-select", setup(builder) {
      builder.onLoad({ filter: /[\\/]components[\\/]ui[\\/]select\.tsx$/ }, () => ({ contents: baselineSource, loader: "tsx", resolveDir: path.resolve("src/components/ui") }));
    } }] });
  const from = path.resolve("src/app/globals.css");
  const css = (await postcss([tailwindcss()]).process(await readFile(from, "utf8"), { from })).css;
  createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents); return; }
    if (req.url === "/baseline.js") { res.setHeader("Content-Type", "text/javascript"); res.end(baseline.outputFiles[0].contents); return; }
    if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    if (req.method !== "GET") { res.writeHead(405).end(); return; }
    res.setHeader("Content-Type", "text/html");
    const script = req.url?.startsWith("/baseline") ? "/baseline.js" : "/fixture.js";
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="${script}"></script></body></html>`);
  }).listen(4317, "127.0.0.1", () => console.log("Synthetic select QA: http://127.0.0.1:4317"));
}
void main();
