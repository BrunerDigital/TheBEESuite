import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import {
  ASSET_HUB_MAX_PENDING_UPLOADS,
  ASSET_HUB_TENANT_UPLOADS_PER_HOUR,
  ASSET_HUB_UPLOADS_PER_HOUR,
  buildAssetStorageKey,
  canManageAssetHub,
  CORPORATE_ASSET_TYPE,
  normalizeAssetCategory,
  validateAssetHubUpload,
} from "@/lib/asset-hub";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { ASSET_HUB_BUCKET, createAssetHubUploadUrl } from "@/lib/supabase-storage";

export async function POST(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageAssetHub(user.role)) return NextResponse.json({ error: "Executive asset access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const validated = validateAssetHubUpload({
    name: String(body.name || "asset"),
    size: body.size,
    contentType: body.contentType,
  });
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const { name: originalName, size, contentType } = validated;
  const rateLimit = await checkPersistentRateLimit({
    key: `asset-hub-upload:${user.tenantId}:${user.id}`,
    limit: ASSET_HUB_UPLOADS_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many asset uploads were prepared. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rateLimit.resetAt)) } },
    );
  }
  const tenantRateLimit = await checkPersistentRateLimit({
    key: `asset-hub-upload:tenant:${user.tenantId}`,
    limit: ASSET_HUB_TENANT_UPLOADS_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  if (!tenantRateLimit.ok) {
    return NextResponse.json(
      { error: "This account has prepared too many asset uploads. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(tenantRateLimit.resetAt)) } },
    );
  }
  const pendingUploads = await prisma.brandAsset.count({
    where: {
      tenantId: user.tenantId,
      assetType: CORPORATE_ASSET_TYPE,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      metadata: { path: ["uploadStatus"], equals: "pending" },
    },
  });
  if (pendingUploads >= ASSET_HUB_MAX_PENDING_UPLOADS) {
    return NextResponse.json({ error: "Too many asset uploads are still pending. Finish or retry those uploads first." }, { status: 429 });
  }
  const category = normalizeAssetCategory(body.category);
  const tags = Array.isArray(body.tags) ? body.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 20) : [];
  const description = String(body.description || "").trim().slice(0, 1000);
  const storageKey = buildAssetStorageKey(user.tenantId, originalName);
  const asset = await prisma.brandAsset.create({
    data: {
      tenantId: user.tenantId,
      assetType: CORPORATE_ASSET_TYPE,
      storageKey,
      altText: originalName,
      metadata: { originalName, contentType, size, category, tags, description, uploadedById: user.id, uploadedByName: user.name, uploadStatus: "pending" } satisfies Prisma.InputJsonObject,
    },
  });
  try {
    const signed = await createAssetHubUploadUrl(storageKey);
    return NextResponse.json({ assetId: asset.id, bucket: ASSET_HUB_BUCKET, storageKey, token: signed.token, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY });
  } catch (error) {
    await prisma.brandAsset.delete({ where: { id: asset.id } });
    console.error("asset_hub.upload_url.failed", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Could not prepare the secure asset upload." }, { status: 500 });
  }
}
