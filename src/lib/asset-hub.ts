import type { UserRole } from "@prisma/client";

export const CORPORATE_ASSET_TYPE = "corporate_asset";
export const ASSET_HUB_CATEGORIES = ["social", "brand", "flyers", "photos", "videos", "documents", "training", "other"] as const;
export type AssetHubCategory = (typeof ASSET_HUB_CATEGORIES)[number];
export const ASSET_HUB_MAX_BYTES = 100 * 1024 * 1024;
export const ASSET_HUB_MAX_PENDING_UPLOADS = 25;
export const ASSET_HUB_UPLOADS_PER_HOUR = 40;
export const ASSET_HUB_TENANT_UPLOADS_PER_HOUR = 100;

const contentTypesByExtension: Record<string, ReadonlySet<string>> = {
  jpg: new Set(["image/jpeg"]),
  jpeg: new Set(["image/jpeg"]),
  png: new Set(["image/png"]),
  gif: new Set(["image/gif"]),
  webp: new Set(["image/webp"]),
  mp4: new Set(["video/mp4"]),
  mov: new Set(["video/quicktime"]),
  webm: new Set(["video/webm"]),
  mp3: new Set(["audio/mpeg"]),
  wav: new Set(["audio/wav", "audio/x-wav"]),
  m4a: new Set(["audio/mp4", "audio/x-m4a"]),
  ogg: new Set(["audio/ogg"]),
  pdf: new Set(["application/pdf"]),
  txt: new Set(["text/plain"]),
  csv: new Set(["text/csv", "application/vnd.ms-excel"]),
  doc: new Set(["application/msword"]),
  docx: new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  xls: new Set(["application/vnd.ms-excel"]),
  xlsx: new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
  ppt: new Set(["application/vnd.ms-powerpoint"]),
  pptx: new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"]),
  key: new Set(["application/x-iwork-keynote-sffkey", "application/vnd.apple.keynote"]),
  numbers: new Set(["application/x-iwork-numbers-sffnumbers", "application/vnd.apple.numbers"]),
  zip: new Set(["application/zip", "application/x-zip-compressed"]),
};

const managerRoles = new Set<UserRole>(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"]);
const readerRoles = new Set<UserRole>([...managerRoles, "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"]);

export function canManageAssetHub(role: UserRole) { return managerRoles.has(role); }
export function canReadAssetHub(role: UserRole) { return readerRoles.has(role); }

export function normalizeAssetCategory(value: unknown): AssetHubCategory {
  return ASSET_HUB_CATEGORIES.includes(value as AssetHubCategory) ? value as AssetHubCategory : "other";
}

export function safeAssetFileName(value: string) {
  const cleaned = value.trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[. -]+/, "");
  return cleaned.slice(-140) || "asset";
}

export function normalizeAssetContentType(value: unknown) {
  return typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
}

export function validateAssetHubUpload(input: { name: string; contentType: unknown; size: unknown }) {
  const name = safeAssetFileName(input.name);
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  const contentType = normalizeAssetContentType(input.contentType);
  const size = Number(input.size);
  if (!Number.isSafeInteger(size) || size <= 0) {
    return { ok: false as const, error: "Select a non-empty file." };
  }
  if (size > ASSET_HUB_MAX_BYTES) {
    return { ok: false as const, error: "Each asset must be 100 MB or smaller." };
  }
  const allowedContentTypes = contentTypesByExtension[extension];
  if (!allowedContentTypes || !allowedContentTypes.has(contentType)) {
    return { ok: false as const, error: "This file type is not supported for the corporate asset library." };
  }
  return { ok: true as const, name, contentType, size };
}

export function buildAssetStorageKey(tenantId: string, originalName: string, now = new Date()) {
  const tenant = tenantId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 80) || "tenant";
  return `${tenant}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${globalThis.crypto.randomUUID()}-${safeAssetFileName(originalName)}`;
}

export function assetKind(contentType: string, name = "") {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.includes("presentation") || ["ppt", "pptx", "key"].includes(ext)) return "presentation";
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || ["xls", "xlsx", "csv", "numbers"].includes(ext)) return "spreadsheet";
  if (contentType.includes("zip") || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  return "document";
}

export function readAssetMetadata(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    originalName: typeof row.originalName === "string" ? row.originalName : "Untitled asset",
    contentType: typeof row.contentType === "string" ? row.contentType : "application/octet-stream",
    size: typeof row.size === "number" ? row.size : 0,
    category: normalizeAssetCategory(row.category),
    description: typeof row.description === "string" ? row.description : "",
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    uploadedByName: typeof row.uploadedByName === "string" ? row.uploadedByName : "Corporate team",
    uploadStatus: row.uploadStatus === "pending" ? "pending" as const : "ready" as const,
  };
}
