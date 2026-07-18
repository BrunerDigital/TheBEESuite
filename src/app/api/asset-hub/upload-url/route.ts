import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { buildAssetStorageKey, canManageAssetHub, CORPORATE_ASSET_TYPE, normalizeAssetCategory, safeAssetFileName } from "@/lib/asset-hub";
import { prisma } from "@/lib/prisma";
import { ASSET_HUB_BUCKET, createAssetHubUploadUrl } from "@/lib/supabase-storage";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageAssetHub(user.role)) return NextResponse.json({ error: "Executive asset access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const originalName = safeAssetFileName(String(body.name || "asset"));
  const size = Number(body.size || 0);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Select a non-empty file." }, { status: 400 });
  const contentType = String(body.contentType || "application/octet-stream").slice(0, 180);
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare upload." }, { status: 500 });
  }
}
