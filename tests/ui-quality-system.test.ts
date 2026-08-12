import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function sourceFiles(path: string): string[] {
  return readdirSync(join(repositoryRoot, path), { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory()
      ? sourceFiles(child)
      : entry.isFile() && child.endsWith(".tsx")
        ? [child]
        : [];
  });
}

test("the restrained product layer is authoritative across legacy screen styles", () => {
  const layout = source("src/app/layout.tsx");
  const css = source("src/app/product-ui.css");
  const globalIndex = layout.indexOf('import "./globals.css"');
  const productIndex = layout.indexOf('import "./product-ui.css"');

  assert.ok(globalIndex >= 0);
  assert.ok(productIndex > globalIndex);
  assert.match(layout, /const collectVercelTelemetry = process\.env\.NODE_ENV === "production"/);
  assert.match(layout, /collectVercelTelemetry \? <Analytics \/> : null/);
  assert.match(layout, /collectVercelTelemetry \? <SpeedInsights \/> : null/);
  assert.match(css, /body \{[\s\S]*background-image: none/);
  assert.match(css, /\.app-sidebar[\s\S]*backdrop-filter: none/);
  assert.match(css, /\.app-header[\s\S]*backdrop-filter: none/);
  assert.match(css, /\.glass-panel,[\s\S]*background-image: none;[\s\S]*backdrop-filter: none/);
  assert.match(css, /\.honeycomb-kpi-card[\s\S]*clip-path: none;[\s\S]*filter: none/);
  assert.match(css, /\.readiness-hex[\s\S]*clip-path: none;[\s\S]*transform: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
});

test("decorative Honeyglass styling is opt-in and the shared loader is calm", () => {
  const flags = source("src/lib/honeyglass.ts");
  const loader = source("src/app/loading.tsx");
  const card = source("src/components/ui/card.tsx");

  assert.match(flags, /NEXT_PUBLIC_HONEYGLASS_UI_ENABLED === "true"/);
  assert.doesNotMatch(flags, /NEXT_PUBLIC_HONEYGLASS_UI_ENABLED !== "false"/);
  assert.doesNotMatch(loader, /bee-route-loader__glow/);
  assert.doesNotMatch(loader, /bee-route-loader__trail/);
  assert.doesNotMatch(loader, /shadow-2xl|uppercase tracking/);
  assert.match(card, /as: Title = "div"/);
  assert.match(card, /as\?: "h1" \| "h2" \| "h3" \| "h4" \| "div"/);
});

test("decorative sparkle iconography is absent from product screens", () => {
  const screens = [
    "src/components/dashboard.tsx",
    "src/components/data-readiness-center.tsx",
    "src/components/live-ops-pages.tsx",
    "src/components/tenant-controls-panel.tsx",
    "src/components/crm/crm-workspace.tsx",
  ];

  for (const screen of screens) assert.doesNotMatch(source(screen), /\bSparkles\b/, screen);
});

test("every CardTitle call site declares whether it is a document heading", () => {
  const implicitTitles = sourceFiles("src")
    .flatMap((path) => {
      const contents = source(path);
      return [...contents.matchAll(/<CardTitle\b(?![^>]*\bas=)[^>]*>/g)].map(
        (match) => `${path}:${contents.slice(0, match.index).split("\n").length}`,
      );
    });

  assert.deepEqual(
    implicitTitles,
    [],
    `CardTitle must explicitly use as="h2"/"h3" for headings or as="div" for display values:\n${implicitTitles.join("\n")}`,
  );
});

test("device preview has runtime and browser-level mutation guards", () => {
  const page = source("src/app/device-preview/page.tsx");
  const guard = source("src/components/device-preview-guard.tsx");
  const qa = source("scripts/qa-device-preview.ts");
  const responsiveQa = source("scripts/qa-responsive.ts");
  const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

  assert.match(page, /process\.env\.NODE_ENV !== "development"/);
  assert.match(page, /<DevicePreviewGuard>/);
  assert.match(guard, /method !== "GET"/);
  assert.match(guard, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(guard, /onSubmitCapture=\{preventSubmit\}/);
  assert.match(guard, /onClickCapture=\{trapNavigation\}/);
  assert.match(guard, /devicePreviewHydrated = "true"/);
  assert.match(qa, /requestProblems/);
  assert.match(qa, /escapingLinks/);
  assert.match(qa, /unnamedInteractiveElements/);
  assert.match(qa, /headingLevelProblems/);
  assert.match(qa, /QA_TARGET_VIEWPORTS/);
  assert.match(qa, /Unknown preview route filter/);
  assert.match(qa, /results\.length > 0 && results\.every/);
  assert.doesNotMatch(qa, /element\.getAttribute\("placeholder"\)/);
  assert.doesNotMatch(qa, /element\.getAttribute\("name"\),/);
  assert.match(responsiveQa, /Boolean\(response && response\.ok\(\)\)/);
  assert.match(responsiveQa, /results\.length > 0 && results\.every/);
  assert.match(responsiveQa, /headingLevelProblems/);
  assert.match(responsiveQa, /method !== "GET" \|\| url\.origin !== baseOrigin \|\| url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(qa, /data-device-preview-hydrated/);
  assert.equal(pkg.scripts["qa:ui-preview"], "tsx scripts/qa-device-preview.ts");
  assert.equal(pkg.scripts["qa:responsive"], "tsx scripts/qa-responsive.ts");
});
