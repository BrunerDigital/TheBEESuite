import "./load-env";

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
  buildAssetStorageKey,
  CORPORATE_ASSET_TYPE,
  type AssetHubCategory,
} from "@/lib/asset-hub";
import { prisma } from "@/lib/prisma";
import {
  ASSET_HUB_BUCKET,
  ensureAssetHubBucket,
  getSupabaseStorageClient,
} from "@/lib/supabase-storage";

const IMPORT_BATCH = "kid-city-corporate-library-2026-07-28";
const DEFAULT_SOURCE =
  "D:\\Brenden Bruner\\Downloads\\Bee Suite Asset Hub 2026-07-28";
const DEFAULT_TENANT = "Kid City USA";

type CollectionConfig = {
  archive: string;
  category: AssetHubCategory;
  label: string;
  tags: string[];
};

const COLLECTIONS: Record<string, CollectionConfig> = {
  "1. General Forms & Documents (All States)": {
    archive:
      "1. General Forms & Documents (All States)-20260728T122152Z-1-001.zip",
    category: "documents",
    label: "General Forms & Documents",
    tags: ["general forms", "all states"],
  },
  "2. Facility Documents": {
    archive: "2. Facility Documents-20260728T122149Z-1-001.zip",
    category: "documents",
    label: "Facility Documents",
    tags: ["facility", "operations"],
  },
  "3. Enrollment Forms": {
    archive: "3. Enrollment Forms-20260728T122146Z-1-001.zip",
    category: "documents",
    label: "Enrollment Forms",
    tags: ["enrollment", "family forms"],
  },
  "4. Employee Forms": {
    archive: "4. Employee Forms-20260728T122133Z-1-001.zip",
    category: "documents",
    label: "Employee Forms",
    tags: ["employee", "human resources"],
  },
  "5. Brand Standard Audit (QA &Map to Success)": {
    archive:
      "5. Brand Standard Audit (QA &Map to Success)-20260728T122128Z-1-001.zip",
    category: "brand",
    label: "Brand Standards, QA & Map to Success",
    tags: ["brand standards", "quality assurance", "map to success"],
  },
  "6. Corporate Team Forms": {
    archive: "6. Corporate Team Forms-20260728T122124Z-1-001.zip",
    category: "documents",
    label: "Corporate Team Forms",
    tags: ["corporate team", "operations"],
  },
  "7. Binder System": {
    archive: "7. Binder System-20260728T122121Z-1-001.zip",
    category: "training",
    label: "Binder System",
    tags: ["binder system", "training"],
  },
  "Accreditation QRIS Etc": {
    archive: "Accreditation QRIS Etc-20260728T122119Z-1-001.zip",
    category: "training",
    label: "Accreditation & QRIS",
    tags: ["accreditation", "qris", "quality"],
  },
  "Directors 2026": {
    archive: "Directors 2026-20260728T122117Z-1-001.zip",
    category: "training",
    label: "Director Resources 2026",
    tags: ["directors", "2026", "operations"],
  },
  "ILLNESS POSTINGS": {
    archive: "ILLNESS POSTINGS-20260728T122115Z-1-001.zip",
    category: "flyers",
    label: "Illness Postings",
    tags: ["illness", "health", "postings"],
  },
  "Medical Resources": {
    archive: "Medical Resources-20260728T122111Z-1-001.zip",
    category: "documents",
    label: "Medical Resources",
    tags: ["medical", "health", "action plan"],
  },
};

type SourceFile = {
  absolutePath: string;
  collectionFolder: string;
  config: CollectionConfig;
  relativePath: string;
  sourceId: string;
  sourceName: string;
  displayName: string;
  contentType: string;
  size: number;
  sha256: string;
  tags: string[];
  description: string;
};

function argumentValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
    }),
  );
  return nested.flat();
}

function contentTypeFor(name: string) {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  throw new Error(`Unsupported asset type: ${name}`);
}

function uniqueTags(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function fileNameWithContext(name: string, context: string) {
  const extension = path.extname(name);
  const baseName = path.basename(name, extension);
  return `${baseName} - ${context}${extension}`;
}

async function buildManifest(sourceRoot: string): Promise<SourceFile[]> {
  const absoluteRoot = path.resolve(sourceRoot);
  const sourcePaths = (await walkFiles(absoluteRoot)).sort((left, right) =>
    left.localeCompare(right),
  );
  const fileNameCounts = new Map<string, number>();

  for (const sourcePath of sourcePaths) {
    const key = path.basename(sourcePath).toLowerCase();
    fileNameCounts.set(key, (fileNameCounts.get(key) ?? 0) + 1);
  }

  const manifest: SourceFile[] = [];
  for (const absolutePath of sourcePaths) {
    const relativePath = path
      .relative(absoluteRoot, absolutePath)
      .split(path.sep)
      .join("/");
    const [collectionFolder, ...nestedParts] = relativePath.split("/");
    const config = COLLECTIONS[collectionFolder];
    if (!config) {
      throw new Error(`Unexpected top-level collection: ${collectionFolder}`);
    }

    const sourceName = path.basename(absolutePath);
    const duplicateName = (fileNameCounts.get(sourceName.toLowerCase()) ?? 0) > 1;
    const nestedFolders = nestedParts.slice(0, -1);
    const context = nestedFolders.length
      ? nestedFolders.join(" - ")
      : config.label;
    const displayName = duplicateName
      ? fileNameWithContext(sourceName, context)
      : sourceName;
    const bytes = await readFile(absolutePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const details = nestedFolders.length
      ? `${config.label} / ${nestedFolders.join(" / ")}`
      : config.label;
    const tags = uniqueTags([
      ...config.tags,
      config.label,
      ...nestedFolders,
      path.extname(sourceName).slice(1),
    ]);
    const sourceId = createHash("sha256")
      .update(`${IMPORT_BATCH}\0${relativePath.toLowerCase()}`)
      .digest("hex");

    manifest.push({
      absolutePath,
      collectionFolder,
      config,
      relativePath,
      sourceId,
      sourceName,
      displayName,
      contentType: contentTypeFor(sourceName),
      size: (await stat(absolutePath)).size,
      sha256,
      tags,
      description: `Corporate resource from ${details}.`,
    });
  }

  return manifest;
}

function existingSourceId(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return typeof metadata.sourceId === "string" ? metadata.sourceId : null;
}

function metadataRecord(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, Prisma.JsonValue>;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const verify = process.argv.includes("--verify");
  const sourceRoot = path.resolve(argumentValue("--source") || DEFAULT_SOURCE);
  const tenantName = argumentValue("--tenant") || DEFAULT_TENANT;
  const manifest = await buildManifest(sourceRoot);

  const tenants = await prisma.tenant.findMany({
    where: { name: tenantName },
    select: { id: true, name: true },
  });
  if (tenants.length !== 1) {
    throw new Error(
      `Expected exactly one tenant named "${tenantName}", found ${tenants.length}.`,
    );
  }
  const tenant = tenants[0];
  const existingRows = await prisma.brandAsset.findMany({
    where: { tenantId: tenant.id, assetType: CORPORATE_ASSET_TYPE },
    select: { id: true, metadata: true, storageKey: true },
  });
  const existingSourceIds = new Set(
    existingRows
      .map((row) => existingSourceId(row.metadata))
      .filter((value): value is string => Boolean(value)),
  );
  const pending = manifest.filter(
    (sourceFile) => !existingSourceIds.has(sourceFile.sourceId),
  );
  const totalBytes = manifest.reduce((sum, sourceFile) => sum + sourceFile.size, 0);
  const duplicateDisplayNames =
    manifest.length -
    new Set(manifest.map((sourceFile) => sourceFile.displayName.toLowerCase()))
      .size;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        tenant: tenant.name,
        tenantId: tenant.id,
        sourceRoot,
        batch: IMPORT_BATCH,
        files: manifest.length,
        bytes: totalBytes,
        existing: manifest.length - pending.length,
        pending: pending.length,
        duplicateDisplayNames,
        categories: Object.fromEntries(
          [...new Set(manifest.map((sourceFile) => sourceFile.config.category))].map(
            (category) => [
              category,
              manifest.filter(
                (sourceFile) => sourceFile.config.category === category,
              ).length,
            ],
          ),
        ),
      },
      null,
      2,
    ),
  );

  if (verify) {
    const manifestBySourceId = new Map(
      manifest.map((sourceFile) => [sourceFile.sourceId, sourceFile]),
    );
    const importedRows = existingRows.filter((row) => {
      const sourceId = existingSourceId(row.metadata);
      return sourceId ? manifestBySourceId.has(sourceId) : false;
    });
    const importedSourceIds = importedRows
      .map((row) => existingSourceId(row.metadata))
      .filter((value): value is string => Boolean(value));
    const readyRows = importedRows.filter(
      (row) => metadataRecord(row.metadata)?.uploadStatus === "ready",
    );
    const storage = getSupabaseStorageClient();
    const storageFolder = `${tenant.id}/2026/07`;
    const { data: storedObjects, error: listError } = await storage.storage
      .from(ASSET_HUB_BUCKET)
      .list(storageFolder, { limit: 1000 });
    if (listError) {
      throw new Error(`Could not list imported storage objects: ${listError.message}`);
    }
    const storedNames = new Set(
      (storedObjects ?? []).filter((item) => item.id).map((item) => item.name),
    );
    const missingStorageObjects = importedRows.filter(
      (row) =>
        !row.storageKey || !storedNames.has(path.posix.basename(row.storageKey)),
    );
    const downloadChecks: Record<string, number> = {};

    for (const category of [
      ...new Set(manifest.map((sourceFile) => sourceFile.config.category)),
    ]) {
      const sample = importedRows.find((row) => {
        const sourceId = existingSourceId(row.metadata);
        return (
          sourceId &&
          manifestBySourceId.get(sourceId)?.config.category === category &&
          row.storageKey
        );
      });
      if (!sample?.storageKey) {
        throw new Error(`No stored sample was found for category ${category}.`);
      }
      const { data: signed, error: signedError } = await storage.storage
        .from(ASSET_HUB_BUCKET)
        .createSignedUrl(sample.storageKey, 60);
      if (signedError || !signed?.signedUrl) {
        throw new Error(
          `Could not sign a ${category} sample: ${signedError?.message || "missing URL"}`,
        );
      }
      const response = await fetch(signed.signedUrl, {
        headers: { Range: "bytes=0-0" },
      });
      downloadChecks[category] = response.status;
      if (!response.ok) {
        throw new Error(
          `Signed ${category} sample returned HTTP ${response.status}.`,
        );
      }
    }

    const audit = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        action: "asset_hub.bulk_imported",
        metadata: { path: ["importBatch"], equals: IMPORT_BATCH },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const result = {
      importedRows: importedRows.length,
      uniqueSourceIds: new Set(importedSourceIds).size,
      readyRows: readyRows.length,
      storageObjectsInFolder: storedNames.size,
      missingStorageObjects: missingStorageObjects.length,
      downloadChecks,
      auditRecorded: Boolean(audit),
      auditCreatedAt: audit?.createdAt.toISOString() ?? null,
    };
    console.log(JSON.stringify({ verification: result }, null, 2));

    if (
      result.importedRows !== manifest.length ||
      result.uniqueSourceIds !== manifest.length ||
      result.readyRows !== manifest.length ||
      result.missingStorageObjects !== 0 ||
      !result.auditRecorded
    ) {
      throw new Error("Asset Hub import verification did not pass.");
    }
  }

  if (!apply || pending.length === 0) return;

  await ensureAssetHubBucket();
  const storage = getSupabaseStorageClient();
  const createdAssetIds: string[] = [];
  const uploadedStorageKeys: string[] = [];

  try {
    for (let index = 0; index < pending.length; index += 1) {
      const sourceFile = pending[index];
      const storageKey = buildAssetStorageKey(
        tenant.id,
        sourceFile.displayName,
        new Date("2026-07-28T12:00:00Z"),
      );
      const bytes = await readFile(sourceFile.absolutePath);
      const { error: uploadError } = await storage.storage
        .from(ASSET_HUB_BUCKET)
        .upload(storageKey, bytes, {
          cacheControl: "3600",
          contentType: sourceFile.contentType,
          upsert: false,
        });
      if (uploadError) {
        throw new Error(
          `Storage upload failed for ${sourceFile.relativePath}: ${uploadError.message}`,
        );
      }
      uploadedStorageKeys.push(storageKey);

      try {
        const asset = await prisma.brandAsset.create({
          data: {
            tenantId: tenant.id,
            assetType: CORPORATE_ASSET_TYPE,
            storageKey,
            altText: sourceFile.displayName,
            metadata: {
              originalName: sourceFile.displayName,
              sourceOriginalName: sourceFile.sourceName,
              contentType: sourceFile.contentType,
              size: sourceFile.size,
              category: sourceFile.config.category,
              description: sourceFile.description,
              tags: sourceFile.tags,
              uploadedByName: "Kid City USA corporate library import",
              uploadStatus: "ready",
              importBatch: IMPORT_BATCH,
              sourceId: sourceFile.sourceId,
              sourceArchive: sourceFile.config.archive,
              sourceCollection: sourceFile.config.label,
              sourcePath: sourceFile.relativePath,
              sha256: sourceFile.sha256,
            } satisfies Prisma.InputJsonObject,
          },
        });
        createdAssetIds.push(asset.id);
      } catch (error) {
        await storage.storage.from(ASSET_HUB_BUCKET).remove([storageKey]);
        uploadedStorageKeys.pop();
        throw error;
      }

      if ((index + 1) % 25 === 0 || index + 1 === pending.length) {
        console.log(`Imported ${index + 1} of ${pending.length} files.`);
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "asset_hub.bulk_imported",
        resource: "BrandAsset",
        metadata: {
          importBatch: IMPORT_BATCH,
          sourceRoot,
          files: createdAssetIds.length,
          bytes: pending.reduce((sum, sourceFile) => sum + sourceFile.size, 0),
          categories: [...new Set(pending.map((item) => item.config.category))],
        } satisfies Prisma.InputJsonObject,
      },
    });
  } catch (error) {
    if (createdAssetIds.length) {
      await prisma.brandAsset.deleteMany({
        where: { id: { in: createdAssetIds } },
      });
    }
    if (uploadedStorageKeys.length) {
      const { error: cleanupError } = await storage.storage
        .from(ASSET_HUB_BUCKET)
        .remove(uploadedStorageKeys);
      if (cleanupError) {
        console.error(`Storage rollback warning: ${cleanupError.message}`);
      }
    }
    throw error;
  }

  console.log(
    `Completed ${IMPORT_BATCH}: ${createdAssetIds.length} assets added to ${tenant.name}.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
