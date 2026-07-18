import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canManageAssetHub, CORPORATE_ASSET_TYPE, readAssetMetadata } from "@/lib/asset-hub";
import { prisma } from "@/lib/prisma";
import { deleteAssetHubObject } from "@/lib/supabase-storage";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageAssetHub(user.role)) return NextResponse.json({ error: "Executive asset access is required." }, { status: 403 });
  const { id } = await params;
  const asset = await prisma.brandAsset.findFirst({ where: { id, tenantId: user.tenantId, assetType: CORPORATE_ASSET_TYPE } });
  if (!asset) return NextResponse.json({ error: "Asset was not found." }, { status: 404 });
  if (asset.storageKey) await deleteAssetHubObject(asset.storageKey);
  await prisma.brandAsset.delete({ where: { id: asset.id } });
  const metadata = readAssetMetadata(asset.metadata);
  await writeAuditLog(user, { action: "asset_hub.deleted", resource: "BrandAsset", resourceId: asset.id, metadata: { name: metadata.originalName } });
  return NextResponse.json({ ok: true });
}
