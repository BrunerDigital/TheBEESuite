import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canManageAssetHub, CORPORATE_ASSET_TYPE, readAssetMetadata } from "@/lib/asset-hub";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageAssetHub(user.role)) return NextResponse.json({ error: "Executive asset access is required." }, { status: 403 });
  const { assetId } = await request.json().catch(() => ({})) as { assetId?: string };
  const asset = assetId ? await prisma.brandAsset.findFirst({ where: { id: assetId, tenantId: user.tenantId, assetType: CORPORATE_ASSET_TYPE } }) : null;
  if (!asset) return NextResponse.json({ error: "Asset was not found." }, { status: 404 });
  const metadata = readAssetMetadata(asset.metadata);
  const updated = await prisma.brandAsset.update({ where: { id: asset.id }, data: { metadata: { ...(asset.metadata as Prisma.JsonObject), uploadStatus: "ready" } } });
  await writeAuditLog(user, { action: "asset_hub.uploaded", resource: "BrandAsset", resourceId: asset.id, metadata: { name: metadata.originalName, size: metadata.size, category: metadata.category } });
  return NextResponse.json({ ok: true, assetId: updated.id });
}
