import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workspace focus clearance accounts for the measured header and scalable bottom nav", () => {
  const css = readFileSync("src/app/product-ui.css", "utf8");
  assert.match(css, /\.dashboard-workspace :where\(a, button, input, select, textarea, summary, \[tabindex\]\)\s*\{\s*scroll-margin-block: calc\(var\(--bee-app-header-height, 4rem\) \+ 1rem\) calc\(7rem \+ env\(safe-area-inset-bottom\)\)/);
});

test("announcement preview has one display mode so line clamping can work", () => {
  const parent = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const preview = parent.match(/<span className="([^"]*line-clamp-4[^"]*)"/);
  assert.ok(preview);
  assert.ok(!preview[1].split(/\s+/).includes("block"));
  assert.ok(preview[1].includes("group-open:hidden"));
});

test("shared collapsed card headers wrap instead of clipping action controls", () => {
  const card = readFileSync("src/components/workspace-preferences.tsx", "utf8");
  assert.match(card, /CardHeader className=\{cn\("min-w-0 grid-cols-\[minmax\(0,1fr\)\]"/);
  assert.match(card, /collapsed \? "flex-wrap items-center justify-between"/);
  assert.match(card, /collapsed && "flex-1 basis-40"/);
});

test("KPI links share tile height with their reorder controls instead of overlapping the next tile", () => {
  const css = readFileSync("src/app/product-ui.css", "utf8");
  assert.match(css, /\.honeycomb-kpi-item\s*\{\s*display: flex;\s*flex-direction: column/);
  assert.match(css, /\.honeycomb-kpi-link\s*\{\s*flex: 1;\s*height: auto/);
});
