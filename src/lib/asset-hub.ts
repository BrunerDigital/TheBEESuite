import { randomUUID } from "node:crypto";
import type { UserRole } from "@prisma/client";

export const CORPORATE_ASSET_TYPE = "corporate_asset";
export const ASSET_HUB_CATEGORIES = ["social", "brand", "flyers", "photos", "videos", "documents", "training", "other"] as const;
export type AssetHubCategory = (typeof ASSET_HUB_CATEGORIES)[number];

const managerRoles = new Set<UserRole>(["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"]);
const readerRoles = new Set<UserRole>([...managerRoles, "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"]);

export function canManageAssetHub(role: UserRole) { return managerRoles.has(role); }
export function canReadAssetHub(role: UserRole) { return readerRoles.has(role); }

export function normalizeAssetCategory(value: unknown): AssetHubCategory {
  return ASSET_HUB_CATEGORIES.includes(value as AssetHubCategory) ? value as AssetHubCategory : "other";
}

export function safeAssetFileName(value: string) {
  const cleaned = value.trim().replace(/[\\/]+/g, "-").replace(/[^a-zA-Z0-9._ -]+/g, "").replace(/\s+/g, "-");
  return cleaned.slice(-140) || "asset";
}

export function buildAssetStorageKey(tenantId: string, originalName: string, now = new Date()) {
  const tenant = tenantId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 80) || "tenant";
  return `${tenant}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}-${safeAssetFileName(originalName)}`;
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
