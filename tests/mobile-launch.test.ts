import assert from "node:assert/strict";
import test from "node:test";
import { launchApps, verifiedStoreUrl } from "../src/lib/mobile-launch";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReadinessSnapshot } from "../scripts/mobile-launch-readiness";

test("download links fail closed without verified Apple listing evidence", () => {
  const app = launchApps[0];
  for (const url of [null, "https://example.com/id123", "http://apps.apple.com/us/app/id123", "https://apps.apple.com.evil.test/us/app/id123", "https://apps.apple.com/us/app/unknown"]) {
    assert.equal(verifiedStoreUrl({ ...app, url, verifiedAt: "2026-09-14" }), null);
  }
  assert.equal(verifiedStoreUrl({ ...app, url: "https://apps.apple.com/us/app/id123", verifiedAt: null }), null);
  assert.equal(verifiedStoreUrl({ ...app, url: "https://apps.apple.com/us/app/id123", verifiedAt: "2026-09-14" }), "https://apps.apple.com/us/app/id123");
});

test("directory refresh creates distinct snapshots and preserves the maintained tracker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bee-launch-snapshot-"));
  try {
    const maintained = join(directory, "school-readiness.csv");
    await writeFile(maintained, "School,Status\nDemo,Parent Pilot\n");
    const now = new Date("2026-09-14T15:00:00Z");
    const first = await writeReadinessSnapshot(directory, "School\nOld name\n", now);
    const second = await writeReadinessSnapshot(directory, "School\nRenamed school\nNew school\n", now);
    assert.notEqual(first, second);
    assert.equal(await readFile(first, "utf8"), "School\nOld name\n");
    assert.equal(await readFile(second, "utf8"), "School\nRenamed school\nNew school\n");
    assert.equal(await readFile(maintained, "utf8"), "School,Status\nDemo,Parent Pilot\n");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
