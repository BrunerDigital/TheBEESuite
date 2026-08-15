import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("installed portals refresh their framework code before using a cached fallback", () => {
  const serviceWorker = readFileSync("public/sw.js", "utf8");

  assert.match(serviceWorker, /bee-suite-app-shell-v2/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
  const networkRead = serviceWorker.indexOf("const response = await fetch(request)");
  const cacheFallback = serviceWorker.indexOf("const cached = await cache.match(request)");
  assert.ok(networkRead > -1 && cacheFallback > networkRead, "framework assets must use network before cache fallback");
});

test("an updated service worker reloads an open portal once to restore interactivity", () => {
  const installManager = readFileSync("src/components/pwa-install-manager.tsx", "utf8");

  assert.match(installManager, /addEventListener\("controllerchange", handleControllerChange\)/);
  assert.match(installManager, /sessionStorage\.getItem\(reloadKey\)/);
  assert.match(installManager, /if \(alreadyReloaded === "1"\) return/);
  assert.match(installManager, /window\.location\.reload\(\)/);
  assert.match(installManager, /registration\.update\(\)/);
  assert.match(installManager, /removeEventListener\("controllerchange", handleControllerChange\)/);
  assert.doesNotMatch(installManager, /window\.location\.(?:replace|assign)\([^)]*controller/);
});

test("install recovery retains the current authenticated route and includes iOS guidance", () => {
  const installManager = readFileSync("src/components/pwa-install-manager.tsx", "utf8");

  assert.match(installManager, /window\.location\.reload\(\)/);
  assert.match(installManager, /In Safari, tap Share, then choose Add to Home Screen/);
  assert.match(installManager, /navigatorWithStandalone\.standalone === true/);
  assert.match(installManager, /beforeinstallprompt/);
});
