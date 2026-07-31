import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const browserIconPath = path.join(root, "public", "brand", "the-bee-suite", "browser-icon.png");

test("browser and install surfaces use the canonical BEE Suite icon", () => {
  assert.equal(existsSync(browserIconPath), true);
  assert.ok(readFileSync(browserIconPath).byteLength > 1_000);

  const layout = readFileSync(path.join(root, "src", "app", "layout.tsx"), "utf8");
  const manifest = readFileSync(path.join(root, "src", "app", "manifest.ts"), "utf8");
  const storeApps = readFileSync(path.join(root, "src", "lib", "app-store-apps.ts"), "utf8");
  const serviceWorker = readFileSync(path.join(root, "public", "sw.js"), "utf8");

  for (const source of [layout, manifest, storeApps, serviceWorker]) {
    assert.match(source, /\/brand\/the-bee-suite\/browser-icon\.png/);
  }
  assert.doesNotMatch(layout, /shortcut:\s*\[\{\s*url:\s*"\/favicon\.ico"/);

  for (const filename of ["favicon.ico", "icon.png", "apple-icon.png"]) {
    assert.equal(
      existsSync(path.join(root, "src", "app", filename)),
      false,
      `${filename} must not create a competing App Router icon tag`,
    );
  }
});
