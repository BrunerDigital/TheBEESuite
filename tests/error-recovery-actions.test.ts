import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("route error actions use the Next.js retry callback that refetches failed content", () => {
  for (const path of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
    const errorBoundary = source(path);
    assert.match(errorBoundary, /unstable_retry: \(\) => void/);
    assert.match(errorBoundary, /onClick=\{unstable_retry\}/);
    assert.match(errorBoundary, /window\.location\.reload\(\)/);
    assert.doesNotMatch(errorBoundary, /\breset\b/);
  }
});

test("parent load failures receive one guarded full-document recovery", () => {
  const errorBoundary = source("src/app/error.tsx");
  assert.match(errorBoundary, /\/parent-portal/);
  assert.match(errorBoundary, /load failed\|network error\|failed to fetch/i);
  assert.match(errorBoundary, /sessionStorage\.getItem\(PARENT_LOAD_RECOVERY_KEY\)/);
  assert.match(errorBoundary, /PARENT_LOAD_RECOVERY_WINDOW_MS = 60_000/);
  assert.match(errorBoundary, /Reload this page/);
});
