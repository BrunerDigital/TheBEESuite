import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canManageAssetHub, CORPORATE_ASSET_TYPE, readAssetMetadata, validateAssetHubUpload } from "@/lib/asset-hub";
import { prisma } from "@/lib/prisma";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { deleteAssetHubObject, getAssetHubObjectInfo } from "@/lib/supabase-storage";

export async function POST(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageAssetHub(user.role)) return NextResponse.json({ error: "Executive asset access is required." }, { status: 403 });
  const { assetId } = await request.json().catch(() => ({})) as { assetId?: string };
  const asset = assetId ? await prisma.brandAsset.findFirst({ where: { id: assetId, tenantId: user.tenantId, assetType: CORPORATE_ASSET_TYPE } }) : null;
  if (!asset) return NextResponse.json({ error: "Asset was not found." }, { status: 404 });
  const metadata = readAssetMetadata(asset.metadata);
  if (metadata.uploadStatus === "ready") return NextResponse.json({ ok: true, assetId: asset.id });
  if (!asset.storageKey) return NextResponse.json({ error: "Asset upload is incomplete." }, { status: 409 });

  const rejectUploadedObject = async (error: string) => {
    try {
      await deleteAssetHubObject(asset.storageKey as string);
    } catch {
      return NextResponse.json({ error: "The invalid upload could not be cleaned up safely. Try again shortly." }, { status: 409 });
    }
    await prisma.brandAsset.deleteMany({ where: { id: asset.id, tenantId: user.tenantId } });
    return NextResponse.json({ error }, { status: 400 });
  };

  let objectInfo: Awaited<ReturnType<typeof getAssetHubObjectInfo>>;
  try {
    objectInfo = await getAssetHubObjectInfo(asset.storageKey);
  } catch {
    return NextResponse.json({ error: "The uploaded asset could not be verified. Upload it again." }, { status: 409 });
  }
  const actual = validateAssetHubUpload({
    name: metadata.originalName,
    size: objectInfo.size,
    contentType: objectInfo.contentType,
  });
  if (!actual.ok) return rejectUploadedObject(actual.error);
  if (actual.size !== metadata.size || actual.contentType !== metadata.contentType) {
    return rejectUploadedObject("The uploaded file did not match the prepared asset. Upload it again.");
  }

  const updated = await prisma.brandAsset.update({
    where: { id: asset.id },
    data: {
      metadata: {
        ...(asset.metadata as Prisma.JsonObject),
        uploadStatus: "ready",
        verifiedSize: actual.size,
        verifiedContentType: actual.contentType,
        verifiedAt: new Date().toISOString(),
      },
    },
  });
  await writeAuditLog(user, { action: "asset_hub.uploaded", resource: "BrandAsset", resourceId: asset.id, metadata: { name: metadata.originalName, size: metadata.size, category: metadata.category } });
  return NextResponse.json({ ok: true, assetId: updated.id });
}
