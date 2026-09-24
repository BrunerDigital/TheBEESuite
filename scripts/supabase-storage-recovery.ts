import "./load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { assertRestorePlanApproved, createStorageRestorePlan, storageProjectRef, validateRestoreTarget, type RestoreTargetBucket } from "../src/lib/storage-restore-plan";
import {
  STORAGE_BACKUP_MANIFEST,
  STORAGE_BACKUP_SCHEMA_VERSION,
  archivePathForSha256,
  sha256Hex,
  validateBucketId,
  validateStorageBackupManifest,
  validateStorageObjectPath,
  type StorageBackupBucket,
  type StorageBackupManifest,
  type StorageBackupObject,
} from "../src/lib/storage-recovery-archive";

type Command = "backup" | "verify" | "restore";

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  npm run storage:backup -- --output <archive-dir> [--bucket <id>]... [--prefix <path>]",
      "  npm run storage:verify -- --input <archive-dir>",
      "  npm run storage:restore -- --input <archive-dir> --target-project <ref> [--allow-existing-buckets] [--apply --expected-plan <sha256>]",
      "",
      "Backup env: SUPABASE_STORAGE_URL and SUPABASE_STORAGE_ADMIN_KEY",
      "Restore env: SUPABASE_RESTORE_URL and SUPABASE_RESTORE_ADMIN_KEY",
      "The legacy SUPABASE_SERVICE_ROLE_KEY names are accepted as fallbacks.",
    ].join("\n"),
  );
}

function valuesForFlag(args: string[], flag: string) {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) usage();
    values.push(value);
    index += 1;
  }
  return values;
}

function oneValue(args: string[], flag: string) {
  const values = valuesForFlag(args, flag);
  if (values.length !== 1) usage();
  return values[0];
}

function projectRefFromUrl(url: string) {
  return storageProjectRef(url);
}

function createStorageClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function requiredEnv(primary: string, fallback?: string) {
  const value = process.env[primary]?.trim() || (fallback ? process.env[fallback]?.trim() : undefined);
  if (!value) throw new Error(`Missing ${primary}${fallback ? ` (or ${fallback})` : ""}.`);
  return value;
}

function resolveArchivePath(root: string, archivePath: string) {
  const candidate = resolve(root, archivePath);
  const fromRoot = relative(root, candidate);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`Archive file resolves outside its root: ${archivePath}.`);
  }
  return candidate;
}

function metadataString(metadata: unknown, key: string) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function listObjectPaths(client: SupabaseClient, bucketId: string, rootPrefix: string) {
  const paths: string[] = [];
  const pending = [rootPrefix.replace(/^\/+|\/+$/g, "")];

  while (pending.length > 0) {
    const prefix = pending.shift() ?? "";
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.storage.from(bucketId).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Could not list ${bucketId}/${prefix}: ${error.message}`);
      for (const item of data ?? []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) paths.push(validateStorageObjectPath(path));
        else pending.push(path);
      }
      if ((data?.length ?? 0) < 1000) break;
    }
  }

  return paths.sort((left, right) => left.localeCompare(right));
}

async function ensureNewArchiveDirectory(root: string) {
  await mkdir(root, { recursive: true });
  if (!(await lstat(root)).isDirectory()) throw new Error(`Backup output must be a directory: ${root}.`);
  const entries = await readdir(root);
  if (entries.length > 0) throw new Error(`Backup output directory must be empty: ${root}.`);
}

async function readArchiveFile(root: string, archivePath: string) {
  const filePath = resolveArchivePath(root, archivePath);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Archive root must be a real directory.");
  const segments = archivePath.split("/");
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = resolve(current, segment);
    const entry = await lstat(current);
    if (entry.isSymbolicLink() || (index === segments.length - 1 ? !entry.isFile() || entry.nlink !== 1 : !entry.isDirectory())) {
      throw new Error(`Archive contains an unsafe file or link: ${archivePath}.`);
    }
  }
  return readFile(filePath);
}

async function writeArchiveObject(root: string, bytes: Buffer, sha256: string) {
  const archivePath = archivePathForSha256(sha256);
  const filePath = resolveArchivePath(root, archivePath);
  await mkdir(resolve(filePath, ".."), { recursive: true });
  try {
    const existing = await readFile(filePath);
    if (sha256Hex(existing) !== sha256) throw new Error(`Hash collision at ${archivePath}.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(filePath, bytes, { flag: "wx" });
  }
  return archivePath;
}

async function backup(args: string[]) {
  const output = resolve(oneValue(args, "--output"));
  const requestedBuckets = valuesForFlag(args, "--bucket").map(validateBucketId);
  const prefixes = valuesForFlag(args, "--prefix");
  if (prefixes.length > 1) usage();
  const prefix = prefixes[0] ? validateStorageObjectPath(prefixes[0].replace(/\/$/, "")) : "";
  const url = requiredEnv("SUPABASE_STORAGE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  projectRefFromUrl(url);
  const key = requiredEnv("SUPABASE_STORAGE_ADMIN_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  const client = createStorageClient(url, key);
  await ensureNewArchiveDirectory(output);

  const { data: availableBuckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError) throw new Error(`Could not list Storage buckets: ${bucketError.message}`);
  const availableById = new Map((availableBuckets ?? []).map((bucket) => [bucket.id, bucket]));
  const selectedIds = requestedBuckets.length > 0 ? requestedBuckets : [...availableById.keys()];
  const buckets: StorageBackupBucket[] = [];

  for (const id of selectedIds.sort((left, right) => left.localeCompare(right))) {
    const bucket = availableById.get(id);
    if (!bucket) throw new Error(`Storage bucket is unavailable or does not exist: ${id}.`);
    if (bucket.public) throw new Error(`Refusing to archive public Storage bucket: ${id}.`);
    const objectPaths = await listObjectPaths(client, id, prefix);
    const objects: StorageBackupObject[] = [];

    for (const path of objectPaths) {
      const { data, error } = await client.storage.from(id).download(path);
      if (error || !data) throw new Error(`Could not download ${id}/${path}: ${error?.message ?? "empty response"}`);
      const bytes = Buffer.from(await data.arrayBuffer());
      const sha256 = sha256Hex(bytes);
      const archivePath = await writeArchiveObject(output, bytes, sha256);

      const { data: metadataRows, error: metadataError } = await client.storage.from(id).list(
        path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
        { search: path.slice(path.lastIndexOf("/") + 1), limit: 100 },
      );
      if (metadataError) throw new Error(`Could not inspect ${id}/${path}: ${metadataError.message}`);
      const filename = path.slice(path.lastIndexOf("/") + 1);
      const metadata = metadataRows?.find((item) => item.name === filename)?.metadata;
      objects.push({
        path,
        archivePath,
        size: bytes.length,
        sha256,
        contentType: metadataString(metadata, "mimetype") ?? "application/octet-stream",
      });
    }

    buckets.push({
      id,
      public: false,
      fileSizeLimit: typeof bucket.file_size_limit === "number" ? bucket.file_size_limit : null,
      allowedMimeTypes: Array.isArray(bucket.allowed_mime_types) ? [...bucket.allowed_mime_types] : null,
      objects,
    });
  }

  const manifest: StorageBackupManifest = {
    schemaVersion: STORAGE_BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    sourceProjectRef: projectRefFromUrl(url),
    buckets,
    totals: {
      buckets: buckets.length,
      objects: buckets.reduce((sum, bucket) => sum + bucket.objects.length, 0),
      bytes: buckets.reduce(
        (sum, bucket) => sum + bucket.objects.reduce((bucketSum, object) => bucketSum + object.size, 0),
        0,
      ),
    },
  };
  validateStorageBackupManifest(manifest);
  await writeFile(resolve(output, STORAGE_BACKUP_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ command: "backup", projectRef: manifest.sourceProjectRef, output, ...manifest.totals }));
}

async function readAndVerifyArchive(input: string) {
  const raw = JSON.parse((await readArchiveFile(input, STORAGE_BACKUP_MANIFEST)).toString("utf8")) as unknown;
  const manifest = validateStorageBackupManifest(raw);
  const verifiedHashes = new Map<string, number>();
  for (const bucket of manifest.buckets) {
    for (const object of bucket.objects) {
      const verifiedSize = verifiedHashes.get(object.sha256);
      if (verifiedSize !== undefined && verifiedSize !== object.size) {
        throw new Error(`Integrity verification failed for ${bucket.id}/${object.path}.`);
      }
      if (verifiedSize !== undefined) continue;
      const file = await readArchiveFile(input, object.archivePath);
      if (file.length !== object.size || sha256Hex(file) !== object.sha256) {
        throw new Error(`Integrity verification failed for ${bucket.id}/${object.path}.`);
      }
      verifiedHashes.set(object.sha256, file.length);
    }
  }
  return manifest;
}

async function verify(args: string[]) {
  const input = resolve(oneValue(args, "--input"));
  const manifest = await readAndVerifyArchive(input);
  console.log(JSON.stringify({ command: "verify", sourceProjectRef: manifest.sourceProjectRef, input, ...manifest.totals }));
}

async function restore(args: string[]) {
  const input = resolve(oneValue(args, "--input"));
  const allowExistingBuckets = args.includes("--allow-existing-buckets");
  const manifest = await readAndVerifyArchive(input);
  const url = requiredEnv("SUPABASE_RESTORE_URL");
  const targetProjectRef = validateRestoreTarget(url, oneValue(args, "--target-project"), manifest.sourceProjectRef);
  const key = requiredEnv("SUPABASE_RESTORE_ADMIN_KEY", "SUPABASE_RESTORE_SERVICE_ROLE_KEY");
  const client = createStorageClient(url, key);
  const { data: targetBuckets, error: targetError } = await client.storage.listBuckets();
  if (targetError) throw new Error(`Could not list target Storage buckets: ${targetError.message}`);
  const existingById = new Map((targetBuckets ?? []).map((bucket) => [bucket.id, bucket]));

  // Inspect every selected bucket before the first write, including collisions
  // in later buckets that previously left an avoidably partial restore.
  const inspectedBuckets: RestoreTargetBucket[] = [];
  for (const bucket of manifest.buckets) {
    const existing = existingById.get(bucket.id);
    if (!existing) continue;
    if (!allowExistingBuckets || existing.public) {
      throw new Error(`Target bucket requires review and must be private: ${bucket.id}.`);
    }
    inspectedBuckets.push({ id: existing.id, public: existing.public, objectPaths: await listObjectPaths(client, bucket.id, "") });
  }
  const plan = createStorageRestorePlan(manifest, targetProjectRef, inspectedBuckets, allowExistingBuckets);
  if (!args.includes("--apply")) {
    console.log(JSON.stringify({ command: "restore-preview", ...plan }));
    return;
  }
  assertRestorePlanApproved(plan.fingerprint, oneValue(args, "--expected-plan"));
  // The archive may have changed while the target was inspected. Recheck it
  // before any bucket or object is created, then check each body on upload.
  const revalidatedManifest = await readAndVerifyArchive(input);
  const revalidatedPlan = createStorageRestorePlan(revalidatedManifest, targetProjectRef, inspectedBuckets, allowExistingBuckets);
  assertRestorePlanApproved(revalidatedPlan.fingerprint, plan.fingerprint);

  for (const bucket of manifest.buckets) {
    const existing = existingById.get(bucket.id);
    if (existing && !allowExistingBuckets) {
      throw new Error(`Target bucket already exists: ${bucket.id}. Pass --allow-existing-buckets after reviewing it.`);
    }
    if (existing?.public) throw new Error(`Refusing to restore into public target bucket: ${bucket.id}.`);
    if (!existing) {
      const { error } = await client.storage.createBucket(bucket.id, {
        public: false,
        fileSizeLimit: bucket.fileSizeLimit,
        allowedMimeTypes: bucket.allowedMimeTypes,
      });
      if (error) throw new Error(`Could not create target bucket ${bucket.id}: ${error.message}`);
    }

    for (const object of bucket.objects) {
      const body = await readArchiveFile(input, object.archivePath);
      if (body.length !== object.size || sha256Hex(body) !== object.sha256) {
        throw new Error(`Archive changed after plan verification: ${bucket.id}/${object.path}.`);
      }
      const { error } = await client.storage.from(bucket.id).upload(object.path, body, {
        contentType: object.contentType,
        upsert: false,
      });
      if (error) throw new Error(`Could not restore ${bucket.id}/${object.path}: ${error.message}`);
      const { data: restored, error: downloadError } = await client.storage.from(bucket.id).download(object.path);
      if (downloadError || !restored) {
        throw new Error(`Could not verify restored object ${bucket.id}/${object.path}: ${downloadError?.message ?? "empty response"}`);
      }
      const restoredBytes = Buffer.from(await restored.arrayBuffer());
      if (restoredBytes.length !== object.size || sha256Hex(restoredBytes) !== object.sha256) {
        throw new Error(`Restored object failed integrity verification: ${bucket.id}/${object.path}.`);
      }
    }
  }

  console.log(
    JSON.stringify({
      command: "restore",
      sourceProjectRef: manifest.sourceProjectRef,
      targetProjectRef: projectRefFromUrl(url),
      input,
      ...manifest.totals,
    }),
  );
}

async function main() {
  const [rawCommand, ...args] = process.argv.slice(2);
  const command = rawCommand as Command;
  if (command === "backup") return backup(args);
  if (command === "verify") return verify(args);
  if (command === "restore") return restore(args);
  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
