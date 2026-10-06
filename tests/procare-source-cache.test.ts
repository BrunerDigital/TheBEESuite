import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { makeStagedSourceManifest } from "../src/lib/procare-staged-source";
import { IMPORT_COUNTER_CHECKPOINT, IMPORT_COUNTER_KEYS, importCounterDelta, recoveredImportCounters, type ImportCounters } from "../src/lib/procare-import-counters";
import { expiredImportStagingDay } from "../src/lib/procare-staging-cleanup";

test("verified source pages bound resume downloads and cleanup preserves original backups", async () => {
  const objects = new Map<string, Buffer>();
  const downloaded: string[] = [];
  const scope = { userId: "synthetic-reviewer", tenantId: "synthetic-tenant", centerId: "synthetic-school" };
  const source = Buffer.alloc(20 * 1024 * 1024, "a");
  const descriptors = [20, 20, 10].map((mb, index) => {
    const bytes = source.subarray(0, mb * 1024 * 1024);
    return { name: "synthetic-report-" + index + ".csv", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const manifest = makeStagedSourceManifest(scope, descriptors);
  manifest.files.forEach(file => objects.set(file.path, source.subarray(0, file.size)));
  const store = {
    async info(key: string) { const bytes = objects.get(key); return { data: bytes ? { size: bytes.length } : null, error: bytes ? null : new Error("missing") }; },
    async copy(from: string, to: string) { const bytes = objects.get(from); if (!bytes) return { error: new Error("missing") }; objects.set(to, bytes); return { error: null }; },
    async upload(key: string, bytes: Buffer) { objects.set(key, bytes); return { error: null }; },
    async download(key: string) { downloaded.push(key); const bytes = objects.get(key); return { data: bytes ? new Blob([new Uint8Array(bytes)]) : null, error: bytes ? null : new Error("missing") }; },
    async remove(keys: string[]) { for (const key of keys) objects.delete(key); return { error: null }; },
    async list(prefix: string, options: { offset?: number; limit: number }) {
      const children = new Map<string, { name: string; id: string | null }>();
      for (const key of objects.keys()) {
        if (!key.startsWith(prefix + "/")) continue;
        const relative = key.slice(prefix.length + 1); const name = relative.split("/")[0];
        children.set(name, { name, id: relative.includes("/") ? null : key });
      }
      return { data: [...children.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(options.offset || 0, (options.offset || 0) + options.limit), error: null };
    },
  };
  const globals = globalThis as typeof globalThis & { __beeCacheStore?: typeof store };
  globals.__beeCacheStore = store;
  const directory = await mkdtemp(path.join(tmpdir(), "bee-cache-test-"));
  const filename = path.join(directory, "cache.cjs");
  const compiled = await build({ stdin: { contents: 'export * from "./src/lib/procare-source-cache"; export * from "./src/lib/procare-staging-cleanup";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "private-test-storage", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/supabase-storage$/ }, args => ({ path: args.path, namespace: "private-test-storage" }));
      builder.onLoad({ filter: /.*/, namespace: "private-test-storage" }, () => ({ contents: 'export const ASSET_HUB_BUCKET="synthetic-private"; export async function requireAssetHubBucket(){}; export function getSupabaseStorageClient(){return {storage:{from(){return globalThis.__beeCacheStore}}}}', loader: "js" }));
    } }] });
  await writeFile(filename, compiled.outputFiles[0].contents);
  const server = createRequire(import.meta.url)(filename);
  try {
    const parsedRows = [["Account ID", "Child ID", "Family Name"], ...Array.from({ length: 1000 }, (_, index) => ["family-" + index, "child-" + index, "Synthetic Family " + index])];
    const sourceSha256 = createHash("sha256").update("original normalized source").digest("hex");
    let linkedBeforeCopy = false;
    const payload = { text: "original normalized source", parsedRows, filename: "synthetic reports", sourceType: "csv_files", relationshipEvidence: [] };
    const prepared = await server.persistVerifiedImportSource("batch-1", scope, manifest, payload, sourceSha256, null, async (archive: { files: Array<{ path: string }> }) => {
      assert.ok(archive.files.every(file => !objects.has(file.path)));
      linkedBeforeCopy = true;
    });
    assert.equal(linkedBeforeCopy, true);
    const beforeRejectedPreparation = objects.size;
    await assert.rejects(server.persistVerifiedImportSource("unlinked-batch", scope, manifest, payload, sourceSha256, null, async () => { throw new Error("Database unavailable"); }), /Database unavailable/);
    assert.equal(objects.size, beforeRejectedPreparation, "A failed database link creates no orphaned original backup");
    const page = await server.readVerifiedImportSource(prepared.cache, scope, "batch-1", { startRow: 21, count: 20 });
    assert.equal(downloaded.length, 2, "One metadata object and one row page, instead of three full original reports");
    assert.deepEqual(page.parsedRows[21], parsedRows[21]); assert.deepEqual(page.parsedRows[40], parsedRows[40]);
    assert.equal(page.verifiedSourceSha256, sourceSha256);
    assert.ok(downloaded.every(key => key.startsWith("school-import-cache/")));
    assert.ok(downloaded.reduce((sum, key) => sum + objects.get(key)!.length, 0) < 50_000, "A 50 MB package resume downloads less than 50 KB in this 1,000-row case");
    downloaded.length = 0;
    const interrupted = await server.readVerifiedImportSource(prepared.cache, scope, "batch-1", { startRow: 18, count: 20 });
    assert.equal(downloaded.length, 3, "An interruption crossing a page boundary fetches exactly two row pages");
    assert.deepEqual(interrupted.parsedRows[37], parsedRows[37]);
    const beforeScopeCheck = downloaded.length;
    await assert.rejects(server.readVerifiedImportSource(prepared.cache, { ...scope, centerId: "other-school" }, "batch-1"), /scope is invalid/);
    assert.equal(downloaded.length, beforeScopeCheck);
    const originalCache = objects.get(prepared.cache.path)!;
    objects.set(prepared.cache.path, Buffer.alloc(originalCache.length, "x"));
    await assert.rejects(server.readVerifiedImportSource(prepared.cache, scope, "batch-1"), /integrity check failed/);
    objects.set(prepared.cache.path, originalCache);
    await server.removeConsumedImportStaging(manifest);
    assert.ok(manifest.files.every(file => !objects.has(file.path)));
    assert.ok(prepared.archiveManifest.files.every((file: { path: string }) => objects.has(file.path)), "Linked original backups survive consumed staging removal");
    const full = await server.readVerifiedImportSource(prepared.cache, scope, "batch-1");
    assert.deepEqual(full.parsedRows, parsedRows, "A new full review can reuse the prepared data after original staging was consumed");
    objects.set("school-imports/2020-01-01/tenant/school/user/abandoned", Buffer.from("temporary"));
    objects.set("school-import-cache/2020-01-01/tenant/school/user/expired.gz", Buffer.from("temporary"));
    objects.set("school-import-archives/2020-01-01/tenant/school/user/original", Buffer.from("backup"));
    objects.set("corporate-documents/policy.pdf", Buffer.from("unrelated"));
    assert.equal((await server.cleanupExpiredImportStaging(true)).temporaryObjects, 2);
    assert.ok(objects.has("school-imports/2020-01-01/tenant/school/user/abandoned"));
    assert.equal((await server.cleanupExpiredImportStaging(false)).removed, 2);
    assert.ok(objects.has("school-import-archives/2020-01-01/tenant/school/user/original"));
    assert.ok(objects.has("corporate-documents/policy.pdf"));
    assert.ok(objects.has(prepared.cache.path), "Current resumable cache remains available");
  } finally {
    delete globals.__beeCacheStore;
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
});

test("counter recovery includes checkpoints saved before a lost response exactly once", () => {
  const zero = Object.fromEntries(IMPORT_COUNTER_KEYS.map(key => [key, 0])) as ImportCounters;
  const after = { ...zero, createdFamilies: 1, createdChildren: 2, invoiceRows: 1, ledgerRows: 1 };
  const rawData = { [IMPORT_COUNTER_CHECKPOINT]: JSON.stringify({ version: 1, counters: importCounterDelta(zero, after) }) };
  const lost = recoveredImportCounters({}, [{ rawData }]);
  assert.deepEqual(lost.counters, after);
  const retried = recoveredImportCounters({ ...lost.counters, checkpointCounters: lost.checkpointCounters }, [{ rawData }]);
  assert.deepEqual(retried.counters, after, "Retry does not count the same row twice");
  const legacy = recoveredImportCounters({ createdFamilies: 5 }, [{ rawData }]);
  assert.equal(legacy.counters.createdFamilies, 6, "Existing saved counters remain intact");
  const invalid = recoveredImportCounters({}, [{ rawData: { [IMPORT_COUNTER_CHECKPOINT]: JSON.stringify({ version: 1, counters: { ...zero, createdFamilies: -100 } }) } }]);
  assert.equal(invalid.counters.createdFamilies, 0);
});

test("temporary retention ignores archives, malformed dates, and current uploads", () => {
  assert.equal(expiredImportStagingDay("2020-01-01"), true);
  assert.equal(expiredImportStagingDay(new Date().toISOString().slice(0, 10)), false);
  assert.equal(expiredImportStagingDay("2026-02-30"), false);
  assert.equal(expiredImportStagingDay("archives"), false);
});
