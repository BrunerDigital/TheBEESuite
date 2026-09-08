import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native wrappers suppress browser-install and service-worker setup", async () => {
  const source = await readFile(new URL("../src/components/pwa-install-manager.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(isNativeAppRuntime\(\)\) return;[\s\S]*navigator\.serviceWorker\.register/);
  assert.match(source, /if \(isNative \|\| !isReady/);
});

test("native parent settings do not offer browser push enrollment", async () => {
  const source = await readFile(new URL("../src/components/web-push-control.tsx", import.meta.url), "utf8");
  assert.match(source, /const effectiveState: PushState = isNative \? "native" : state/);
  assert.match(source, /Native push alerts are not included in this version/);
  assert.doesNotMatch(source, /inside the Parent Portal/);
});

test("native parent onboarding hides home-screen installation instructions", async () => {
  const source = await readFile(new URL("../src/components/parent-portal-setup-form.tsx", import.meta.url), "utf8");
  assert.match(source, /const isNative = useNativeAppRuntime\(\)/);
  assert.match(source, /!isNative \? <section[\s\S]*Add to Your Home Screen/);
});
