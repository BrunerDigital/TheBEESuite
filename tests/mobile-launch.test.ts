import assert from "node:assert/strict";
import test from "node:test";
import { launchApps, verifiedStoreUrl } from "../src/lib/mobile-launch";

test("download links fail closed without verified Apple listing evidence", () => {
  const app = launchApps[0];
  for (const url of [null, "https://example.com/id123", "http://apps.apple.com/us/app/id123", "https://apps.apple.com.evil.test/us/app/id123", "https://apps.apple.com/us/app/unknown"]) {
    assert.equal(verifiedStoreUrl({ ...app, url, verifiedAt: "2026-09-14" }), null);
  }
  assert.equal(verifiedStoreUrl({ ...app, url: "https://apps.apple.com/us/app/id123", verifiedAt: null }), null);
  assert.equal(verifiedStoreUrl({ ...app, url: "https://apps.apple.com/us/app/id123", verifiedAt: "2026-09-14" }), "https://apps.apple.com/us/app/id123");
});
