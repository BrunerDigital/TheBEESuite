import { createHash } from "node:crypto";

export const STORAGE_BACKUP_SCHEMA_VERSION = 1;
export const STORAGE_BACKUP_MANIFEST = "manifest.json";

export type StorageBackupObject = {
  path: string;
  archivePath: string;
  size: number;
  sha256: string;
  contentType: string;
};

export type StorageBackupBucket = {
  id: string;
  public: false;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
  objects: StorageBackupObject[];
};

export type StorageBackupManifest = {
  schemaVersion: typeof STORAGE_BACKUP_SCHEMA_VERSION;
  createdAt: string;
  sourceProjectRef: string;
  buckets: StorageBackupBucket[];
  totals: {
    buckets: number;
    objects: number;
    bytes: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function expectNonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return Number(value);
}

export function sha256Hex(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateBucketId(value: string) {
  if (
    value.length > 100 ||
    value.startsWith(".") ||
    value.endsWith(".") ||
    value.includes("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Unsafe Storage bucket id: ${JSON.stringify(value)}.`);
  }
  return value;
}

export function validateStorageObjectPath(value: string) {
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe Storage object path: ${JSON.stringify(value)}.`);
  }
  return value;
}

export function archivePathForSha256(sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Object SHA-256 must be 64 lowercase hexadecimal characters.");
  }
  return `objects/${sha256.slice(0, 2)}/${sha256}.blob`;
}

export function validateStorageBackupManifest(value: unknown): StorageBackupManifest {
  if (!isRecord(value)) throw new Error("Storage backup manifest must be an object.");
  if (value.schemaVersion !== STORAGE_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported Storage backup schema version: ${String(value.schemaVersion)}.`);
  }

  const createdAt = expectString(value.createdAt, "createdAt");
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("createdAt must be an ISO timestamp.");
  const sourceProjectRef = expectString(value.sourceProjectRef, "sourceProjectRef");
  if (!/^[a-z0-9]{20}$/.test(sourceProjectRef)) {
    throw new Error("sourceProjectRef must be a Supabase project reference.");
  }
  if (!Array.isArray(value.buckets)) throw new Error("buckets must be an array.");

  const seenBuckets = new Set<string>();
  const seenObjects = new Set<string>();
  const buckets = value.buckets.map((rawBucket, bucketIndex): StorageBackupBucket => {
    if (!isRecord(rawBucket)) throw new Error(`buckets[${bucketIndex}] must be an object.`);
    const id = validateBucketId(expectString(rawBucket.id, `buckets[${bucketIndex}].id`));
    if (seenBuckets.has(id)) throw new Error(`Duplicate Storage bucket id: ${id}.`);
    seenBuckets.add(id);
    if (rawBucket.public !== false) {
      throw new Error(`Storage recovery archives may contain private buckets only: ${id}.`);
    }

    const fileSizeLimit =
      rawBucket.fileSizeLimit === null
        ? null
        : expectNonNegativeInteger(rawBucket.fileSizeLimit, `buckets[${bucketIndex}].fileSizeLimit`);
    const allowedMimeTypes =
      rawBucket.allowedMimeTypes === null
        ? null
        : Array.isArray(rawBucket.allowedMimeTypes) && rawBucket.allowedMimeTypes.every((item) => typeof item === "string")
          ? [...rawBucket.allowedMimeTypes]
          : (() => {
              throw new Error(`buckets[${bucketIndex}].allowedMimeTypes must be a string array or null.`);
            })();
    if (!Array.isArray(rawBucket.objects)) throw new Error(`buckets[${bucketIndex}].objects must be an array.`);

    const objects = rawBucket.objects.map((rawObject, objectIndex): StorageBackupObject => {
      if (!isRecord(rawObject)) {
        throw new Error(`buckets[${bucketIndex}].objects[${objectIndex}] must be an object.`);
      }
      const path = validateStorageObjectPath(
        expectString(rawObject.path, `buckets[${bucketIndex}].objects[${objectIndex}].path`),
      );
      const objectKey = `${id}\u0000${path}`;
      if (seenObjects.has(objectKey)) throw new Error(`Duplicate Storage object: ${id}/${path}.`);
      seenObjects.add(objectKey);

      const sha256 = expectString(rawObject.sha256, `buckets[${bucketIndex}].objects[${objectIndex}].sha256`);
      const expectedArchivePath = archivePathForSha256(sha256);
      const archivePath = expectString(
        rawObject.archivePath,
        `buckets[${bucketIndex}].objects[${objectIndex}].archivePath`,
      );
      if (archivePath !== expectedArchivePath) {
        throw new Error(`Archive path does not match SHA-256 for ${id}/${path}.`);
      }

      return {
        path,
        archivePath,
        size: expectNonNegativeInteger(rawObject.size, `buckets[${bucketIndex}].objects[${objectIndex}].size`),
        sha256,
        contentType: expectString(
          rawObject.contentType,
          `buckets[${bucketIndex}].objects[${objectIndex}].contentType`,
        ),
      };
    });

    return { id, public: false, fileSizeLimit, allowedMimeTypes, objects };
  });

  if (!isRecord(value.totals)) throw new Error("totals must be an object.");
  const totals = {
    buckets: expectNonNegativeInteger(value.totals.buckets, "totals.buckets"),
    objects: expectNonNegativeInteger(value.totals.objects, "totals.objects"),
    bytes: expectNonNegativeInteger(value.totals.bytes, "totals.bytes"),
  };
  const actualObjects = buckets.reduce((sum, bucket) => sum + bucket.objects.length, 0);
  const actualBytes = buckets.reduce(
    (sum, bucket) => sum + bucket.objects.reduce((bucketSum, object) => bucketSum + object.size, 0),
    0,
  );
  if (totals.buckets !== buckets.length || totals.objects !== actualObjects || totals.bytes !== actualBytes) {
    throw new Error("Storage backup totals do not match manifest contents.");
  }

  return {
    schemaVersion: STORAGE_BACKUP_SCHEMA_VERSION,
    createdAt,
    sourceProjectRef,
    buckets,
    totals,
  };
}
