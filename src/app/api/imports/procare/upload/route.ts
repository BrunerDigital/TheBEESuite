import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { makeStagedSourceManifest, signStagedSourceManifest } from "@/lib/procare-staged-source";
import { ASSET_HUB_BUCKET, getSupabaseStorageClient, requireAssetHubBucket } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageOperations(user)) return NextResponse.json({ error: "Data imports are not allowed for this role." }, { status: 403 });
  const body = await request.json().catch(() => null) as { centerId?: unknown; files?: unknown } | null;
  const centerId = typeof body?.centerId === "string" ? body.centerId : "";
  if (!centerId || !canAccessCenter(user, centerId)) return NextResponse.json({ error: "Select a school you can access before uploading reports." }, { status: 403 });
  const center = await prisma.center.findFirst({ where: { id: centerId, status: { not: "closed" }, organization: { tenantId: user.tenantId } }, select: { id: true } });
  if (!center) return NextResponse.json({ error: "School not found." }, { status: 404 });
  let manifest;
  try {
    manifest = makeStagedSourceManifest({ userId: user.id, tenantId: user.tenantId, centerId }, body?.files);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the selected reports." }, { status: 400 });
  }
  const limit = await checkPersistentRateLimit({ key: `school-import-upload:${user.tenantId}:${user.id}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ error: "Too many report uploads. Keep your files selected and try again later." }, { status: 429 });
  try {
    // Require the existing private bucket. Uploads cannot create or reconfigure a provider.
    await requireAssetHubBucket();
    const receipt = signStagedSourceManifest(manifest, process.env.AUTH_SECRET || "");
    const client = getSupabaseStorageClient();
    const uploads: Array<{ signedUrl: string }> = [];
    for (let index = 0; index < manifest.files.length; index += 8) {
      const group = await Promise.all(manifest.files.slice(index, index + 8).map(async (file) => {
        const { data, error } = await client.storage.from(ASSET_HUB_BUCKET).createSignedUploadUrl(file.path, { upsert: false });
        if (error || !data?.signedUrl) throw new Error("Report staging failed.");
        return { signedUrl: data.signedUrl };
      }));
      uploads.push(...group);
    }
    return NextResponse.json({ receipt, expiresAt: manifest.expiresAt, uploads }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Secure report upload is unavailable. Your files remain selected; request setup help or retry." }, { status: 503 });
  }
}
