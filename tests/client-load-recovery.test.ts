import assert from "node:assert/strict";
import test from "node:test";
import { recoverClientAssetsAndReload } from "@/lib/client-load-recovery";

test("offline recovery preserves caches and retry budget; online recovery is throttled and scoped", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const deleted: string[] = []; let reloads = 0; let timestamp = "0";
  const navigatorMock = { onLine: false };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigatorMock });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    sessionStorage: { getItem: () => timestamp, setItem: (_key: string, value: string) => { timestamp = value; } },
    caches: { keys: async () => ["bee-suite-app-shell-v4", "bee-suite-offline-work", "another-app"], delete: async (key: string) => { deleted.push(key); return true; } },
    location: { reload: () => { reloads++; } },
  } });
  try {
    assert.equal(await recoverClientAssetsAndReload(), false);
    assert.equal(timestamp, "0"); assert.equal(reloads, 0); assert.deepEqual(deleted, []);
    navigatorMock.onLine = true;
    assert.equal(await recoverClientAssetsAndReload(), true);
    assert.deepEqual(deleted, ["bee-suite-app-shell-v4"]); assert.equal(reloads, 1);
    assert.equal(await recoverClientAssetsAndReload(), false); assert.equal(reloads, 1);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else Reflect.deleteProperty(globalThis, "window");
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else Reflect.deleteProperty(globalThis, "navigator");
  }
});
