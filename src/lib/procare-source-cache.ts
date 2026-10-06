import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { ASSET_HUB_BUCKET, getSupabaseStorageClient, requireAssetHubBucket } from "@/lib/supabase-storage";
import { type StagedSourceManifest, type StagedSourceScope } from "@/lib/procare-staged-source";
import { MAX_PROCARE_EXPANDED_BYTES, MAX_PROCARE_STAGED_BYTES } from "@/lib/procare-upload-limits";

export type VerifiedSourceCache = { path: string; size: number; sha256: string };
export type RelationshipEvidence = Array<[string, { guardians: string[]; emergency: string[]; pickup: string[] }]>;
export function stagedDescriptorsMatch(first: StagedSourceManifest, second: StagedSourceManifest) {
  return first.userId === second.userId && first.tenantId === second.tenantId && first.centerId === second.centerId
    && JSON.stringify(first.files.map(({ name, size, sha256 }) => ({ name, size, sha256 }))) === JSON.stringify(second.files.map(({ name, size, sha256 }) => ({ name, size, sha256 })));
}
function scopedPrefix(root: string, day: string, scope: StagedSourceScope) {
  return `${root}/${day}/${encodeURIComponent(scope.tenantId)}/${encodeURIComponent(scope.centerId)}/${encodeURIComponent(scope.userId)}/`;
}

export async function persistVerifiedImportSource(batchId: string, scope: StagedSourceScope, manifest: StagedSourceManifest, payload: { text: string; parsedRows: string[][]; relationshipEvidence: RelationshipEvidence; filename: string; sourceType: string; datasetCoverage?: unknown }, sourceSha256: string, priorArchive?: StagedSourceManifest | null, linkArchive?: (manifest: StagedSourceManifest) => Promise<void>) {
  await requireAssetHubBucket();
  const bucket = getSupabaseStorageClient().storage.from(ASSET_HUB_BUCKET);
  const day = new Date().toISOString().slice(0, 10);
  const archivePrefix = scopedPrefix("school-import-archives", day, scope) + encodeURIComponent(batchId) + "/";
  const reuseArchive = priorArchive && stagedDescriptorsMatch(priorArchive, manifest) && priorArchive.files.every(file => /^\d{4}-\d{2}-\d{2}$/.test(file.path.split("/")[1]) && file.path.startsWith(scopedPrefix("school-import-archives", file.path.split("/")[1], scope)));
  const archivedFiles = reuseArchive ? priorArchive.files : manifest.files.map((file, index) => ({ ...file, path: archivePrefix + index + "-" + file.sha256 }));
  const archiveManifest = { ...manifest, files: archivedFiles };
  // Link the backup plan before copying any original, including interrupted preparations.
  if (linkArchive) await linkArchive(archiveManifest);
  // Originals become linked, recoverable backups. Temporary uploads are never the only copy.
  for (let index = 0; index < manifest.files.length; index += 8) {
    await Promise.all(manifest.files.slice(index, index + 8).map(async (file, offset) => {
      const archive = archivedFiles[index + offset];
      const existing = await bucket.info(archive.path);
      if (!existing.error && existing.data?.size === file.size) return;
      const copied = await bucket.copy(file.path, archive.path);
      if (copied.error) throw new Error("The original report backup could not be saved. Keep the same files selected and retry.");
    }));
  }
  let totalBytes = 0;
  const put = async (value: unknown): Promise<VerifiedSourceCache> => {
    const compressed = gzipSync(JSON.stringify(value));
    totalBytes += compressed.length;
    if (totalBytes > MAX_PROCARE_STAGED_BYTES) throw new Error("The prepared source is too large for browser transfer. Request BEE setup help.");
    const sha256 = createHash("sha256").update(compressed).digest("hex");
    const path = scopedPrefix("school-import-cache", day, scope) + encodeURIComponent(batchId) + "-" + sha256 + ".gz";
    const existing = await bucket.info(path);
    if (existing.error || existing.data?.size !== compressed.length) {
      const uploaded = await bucket.upload(path, compressed, { upsert: false, contentType: "application/gzip", cacheControl: "0" });
      if (uploaded.error) throw new Error("The prepared source could not be saved. Keep the same files selected and retry.");
    }
    return { path, size: compressed.length, sha256 };
  };
  const pages: Array<{ startRow: number; rows: number; object: VerifiedSourceCache }> = [];
  // Store row-sized pages once. Resumes fetch their current page, not the full export.
  for (let start = 1; start < payload.parsedRows.length; start += 160) {
    const group = await Promise.all(Array.from({ length: Math.min(8, Math.ceil((payload.parsedRows.length - start) / 20)) }, async (_, index) => {
      const startRow = start + index * 20;
      const rows = payload.parsedRows.slice(startRow, startRow + 20);
      return { startRow, rows: rows.length, object: await put(rows) };
    }));
    pages.push(...group);
  }
  const cache = await put({ filename: payload.filename, sourceType: payload.sourceType, datasetCoverage: payload.datasetCoverage ?? null,
    sourceSha256, headers: payload.parsedRows[0], totalRows: payload.parsedRows.length - 1, pages, relationshipEvidence: payload.relationshipEvidence });
  return { cache, archiveManifest };
}

export async function readVerifiedImportSource<T extends { text: string }>(cache: VerifiedSourceCache, scope: StagedSourceScope, batchId: string, range?: { startRow: number; count: number }): Promise<T & { verifiedSourceSha256: string; partialSource: boolean; sourceRangeStart?: number; relationshipEvidence: RelationshipEvidence }> {
  await requireAssetHubBucket();
  const bucket = getSupabaseStorageClient().storage.from(ASSET_HUB_BUCKET);
  const get = async (object: VerifiedSourceCache) => {
    const day = object.path.split("/")[1];
    const expected = scopedPrefix("school-import-cache", day, scope) + encodeURIComponent(batchId) + "-" + object.sha256 + ".gz";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || object.path !== expected || !/^[a-f0-9]{64}$/.test(object.sha256) || !Number.isSafeInteger(object.size) || object.size <= 0 || object.size > MAX_PROCARE_STAGED_BYTES) throw new Error("The prepared source scope is invalid.");
    const { data, error } = await bucket.download(object.path);
    if (error || !data || data.size !== object.size) throw new Error("The prepared source has expired. Select the same reports again.");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== object.sha256) throw new Error("The prepared source integrity check failed.");
    return JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_PROCARE_EXPANDED_BYTES * 2 }).toString("utf8"));
  };
  const metadata = await get(cache);
  if (!metadata || !Array.isArray(metadata.headers) || !metadata.headers.every((header: unknown) => typeof header === "string") || !Array.isArray(metadata.pages)
    || !Number.isSafeInteger(metadata.totalRows) || metadata.totalRows < 1 || metadata.totalRows > 1_000_000 || !/^[a-f0-9]{64}$/.test(metadata.sourceSha256)) throw new Error("The prepared source is invalid.");
  const start = range?.startRow ?? 1;
  const end = range ? Math.min(start + range.count, metadata.totalRows + 1) : metadata.totalRows + 1;
  if (!Number.isSafeInteger(start) || start < 1 || start > metadata.totalRows + 1 || !Number.isSafeInteger(end) || end < start) throw new Error("The prepared source range is invalid.");
  const blank = metadata.headers.map(() => "");
  const parsedRows: string[][] = Array(metadata.totalRows + 1).fill(blank);
  parsedRows[0] = metadata.headers;
  const selected = metadata.pages.filter((page: { startRow: number; rows: number }) => page.startRow < end && page.startRow + page.rows > start);
  const covered = new Set<number>();
  for (let index = 0; index < selected.length; index += 8) {
    await Promise.all(selected.slice(index, index + 8).map(async (page: { startRow: number; rows: number; object: VerifiedSourceCache }) => {
      const rows = await get(page.object);
      if (!Array.isArray(rows) || rows.length !== page.rows || !rows.every(row => Array.isArray(row) && row.every(value => typeof value === "string"))) throw new Error("The prepared source page is invalid.");
      if (!Number.isSafeInteger(page.startRow) || page.startRow < 1 || !Number.isSafeInteger(page.rows) || page.rows < 1 || page.rows > 20 || page.startRow + page.rows > metadata.totalRows + 1) throw new Error("The prepared source page is invalid.");
      for (const [offset, row] of rows.entries()) { parsedRows[page.startRow + offset] = row; covered.add(page.startRow + offset); }
    }));
  }
  for (let row = start; row < end; row++) if (!covered.has(row)) throw new Error("The prepared source page is incomplete.");
  return { ...metadata, text: "Verified prepared source", parsedRows, verifiedSourceSha256: metadata.sourceSha256, partialSource: Boolean(range), sourceRangeStart: range?.startRow } as T & { verifiedSourceSha256: string; partialSource: boolean; sourceRangeStart?: number; relationshipEvidence: RelationshipEvidence };
}

export async function removeConsumedImportStaging(manifest: StagedSourceManifest) {
  const bucket = getSupabaseStorageClient().storage.from(ASSET_HUB_BUCKET);
  const result = await bucket.remove(manifest.files.map(file => file.path));
  if (result.error) console.warn("Temporary school import cleanup deferred to the scheduled retention job.");
}
