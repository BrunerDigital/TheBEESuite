import { ASSET_HUB_BUCKET, getSupabaseStorageClient, requireAssetHubBucket } from "@/lib/supabase-storage";

export function expiredImportStagingDay(day: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = Date.parse(day + "T00:00:00Z");
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === day && date + 4 * 86_400_000 < now;
}

export async function cleanupExpiredImportStaging(dryRun = false, now = Date.now()) {
  await requireAssetHubBucket();
  const bucket = getSupabaseStorageClient().storage.from(ASSET_HUB_BUCKET);
  const paths: string[] = [];
  let listed = 0;
  const walk = async (prefix: string, depth: number) => {
    if (depth > 4 || listed >= 10_000) return;
    for (let offset = 0; listed < 10_000; offset += 100) {
      const result = await bucket.list(prefix, { limit: 100, offset });
      if (result.error) throw new Error("Temporary import storage could not be inspected.");
      const entries = result.data || [];
      listed += entries.length;
      for (const entry of entries) {
        if (!entry.name || entry.name.includes("/") || entry.name === "..") continue;
        const path = prefix + "/" + entry.name;
        if (entry.id) paths.push(path); else await walk(path, depth + 1);
      }
      if (entries.length < 100) break;
    }
  };
  // Only app-owned, expired temporary prefixes. Recoverable source archives and
  // every other corporate asset are outside this lifecycle.
  for (const root of ["school-imports", "school-import-cache"]) {
    const result = await bucket.list(root, { limit: 100 });
    if (result.error) throw new Error("Temporary import storage could not be inspected.");
    for (const folder of result.data || []) if (!folder.id && expiredImportStagingDay(folder.name, now)) await walk(root + "/" + folder.name, 0);
  }
  if (!dryRun) for (let index = 0; index < paths.length; index += 100) {
    const result = await bucket.remove(paths.slice(index, index + 100));
    if (result.error) throw new Error("Temporary import storage cleanup needs a retry.");
  }
  return { temporaryObjects: paths.length, removed: dryRun ? 0 : paths.length, dryRun };
}
