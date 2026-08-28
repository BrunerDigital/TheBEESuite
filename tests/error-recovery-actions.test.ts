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

test("client asset failures and parent network failures receive one guarded full-document recovery", () => {
  const recovery = source("src/lib/client-load-recovery.ts");
  assert.match(recovery, /\/parent-portal/);
  assert.match(recovery, /load failed\|network error\|failed to fetch/i);
  assert.match(recovery, /ChunkLoadError/);
  assert.match(recovery, /failed to load chunk\|loading chunk/);
  assert.match(recovery, /sessionStorage\.getItem\(CLIENT_LOAD_RECOVERY_KEY\)/);
  assert.match(recovery, /CLIENT_LOAD_RECOVERY_WINDOW_MS = 60_000/);
  assert.match(recovery, /registration\.update/);
  assert.match(recovery, /window\.caches\.delete/);
  for (const path of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
    const errorBoundary = source(path);
    assert.match(errorBoundary, /recoverClientAssetsAndReload/);
    assert.match(errorBoundary, /Reload this page/);
  }
});

test("service worker never substitutes the app launcher for authenticated routes", () => {
  const serviceWorker = source("public/sw.js");
  assert.match(serviceWorker, /bee-suite-app-shell-v4/);
  assert.match(serviceWorker, /cache\.addAll\(APP_SHELL_URLS\)/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll\(APP_SHELL_URLS\)[\s\S]{0,80}\.catch/);
  assert.match(serviceWorker, /url\.pathname === "\/app" \|\| url\.pathname === "\/app\/"/);
  assert.match(serviceWorker, /status: 503/);
  assert.doesNotMatch(serviceWorker, /fetch\(request\)\.catch\(\(\) => caches\.match\("\/app"\)\)/);
});

test("service worker controller changes can recover future releases without reload loops", () => {
  const pwaManager = source("src/components/pwa-install-manager.tsx");
  assert.match(pwaManager, /const reloadWindowMs = 60_000/);
  assert.match(pwaManager, /Date\.now\(\) - lastReloadAt < reloadWindowMs/);
  assert.match(pwaManager, /sessionStorage\.setItem\(reloadKey, String\(Date\.now\(\)\)\)/);
  assert.doesNotMatch(pwaManager, /alreadyReloaded === "1"/);
});
