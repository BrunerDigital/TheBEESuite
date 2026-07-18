import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canReadAssetHub, CORPORATE_ASSET_TYPE, readAssetMetadata } from "@/lib/asset-hub";
import { prisma } from "@/lib/prisma";
import { createAssetHubSignedUrl } from "@/lib/supabase-storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canReadAssetHub(user.role)) return NextResponse.json({ error: "Asset Hub access is required." }, { status: 403 });
  const { id } = await params;
  const asset = await prisma.brandAsset.findFirst({ where: { id, tenantId: user.tenantId, assetType: CORPORATE_ASSET_TYPE } });
  if (!asset?.storageKey) return NextResponse.json({ error: "Asset was not found." }, { status: 404 });
  const metadata = readAssetMetadata(asset.metadata);
  const signedUrl = await createAssetHubSignedUrl(asset.storageKey, metadata.originalName);
  await writeAuditLog(user, { action: "asset_hub.downloaded", resource: "BrandAsset", resourceId: asset.id, metadata: { name: metadata.originalName } });
  return NextResponse.redirect(signedUrl);
}
