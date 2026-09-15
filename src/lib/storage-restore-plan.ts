import { sha256Hex, type StorageBackupManifest } from "./storage-recovery-archive";

// Recovery is rehearsed in a separate project before any production re-entry.
const PRODUCTION_PROJECT_REF = "nqjrlktoewiueiwrubas";

export function storageProjectRef(url: string) {
  const parsed = new URL(url);
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  if (!match || parsed.protocol !== "https:" || parsed.username || parsed.password
    || parsed.port || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Storage URL must be an HTTPS Supabase project origin.");
  }
  return match[1];
}

export function validateRestoreTarget(url: string, expectedProjectRef: string, sourceProjectRef: string) {
  const targetProjectRef = storageProjectRef(url);
  if (!/^[a-z0-9]{20}$/.test(expectedProjectRef) || targetProjectRef !== expectedProjectRef) {
    throw new Error("Restore URL does not match --target-project.");
  }
  if (targetProjectRef === sourceProjectRef || targetProjectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Restore requires an isolated project distinct from the source and production.");
  }
  return targetProjectRef;
}

export type RestoreTargetBucket = { id: string; public: boolean; objectPaths: string[] };

export function createStorageRestorePlan(
  manifest: StorageBackupManifest,
  targetProjectRef: string,
  targetBuckets: RestoreTargetBucket[],
  allowExistingBuckets: boolean,
) {
  const existingById = new Map(targetBuckets.map((bucket) => [bucket.id, bucket]));
  for (const bucket of manifest.buckets) {
    const existing = existingById.get(bucket.id);
    if (existing && !allowExistingBuckets) throw new Error(`Target bucket already exists: ${bucket.id}.`);
    if (existing?.public) throw new Error(`Refusing to restore into public target bucket: ${bucket.id}.`);
    const paths = new Set(existing?.objectPaths ?? []);
    for (const object of bucket.objects) {
      if (paths.has(object.path)) throw new Error(`Target object already exists: ${bucket.id}/${object.path}.`);
    }
  }
  const scope = {
    manifest,
    targetProjectRef,
    allowExistingBuckets,
    targetBuckets: targetBuckets
      .filter((bucket) => manifest.buckets.some((source) => source.id === bucket.id))
      .map((bucket) => ({ ...bucket, objectPaths: [...bucket.objectPaths].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return {
    fingerprint: sha256Hex(Buffer.from(JSON.stringify(scope))),
    sourceProjectRef: manifest.sourceProjectRef,
    targetProjectRef,
    ...manifest.totals,
    createBuckets: manifest.buckets.filter((bucket) => !existingById.has(bucket.id)).length,
  };
}

export function assertRestorePlanApproved(fingerprint: string, expectedFingerprint?: string) {
  if (!expectedFingerprint || expectedFingerprint !== fingerprint) {
    throw new Error("Restore plan changed or is unapproved. Preview again and pass its --expected-plan fingerprint.");
  }
}
