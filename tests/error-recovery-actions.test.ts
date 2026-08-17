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
    assert.doesNotMatch(errorBoundary, /\breset\b/);
  }
});
