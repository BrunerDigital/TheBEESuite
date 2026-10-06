import { createHash } from "node:crypto";
import { ASSET_HUB_BUCKET, getSupabaseStorageClient, requireAssetHubBucket } from "@/lib/supabase-storage";
import { validateStagedSourceFiles, verifyStagedSourceManifest, type StagedSourceScope, type StagedSourceManifest } from "@/lib/procare-staged-source";

export async function readStagedSourceFiles(receipt: string, scope: StagedSourceScope) {
  const manifest = verifyStagedSourceManifest(receipt, scope, process.env.AUTH_SECRET || "");
  return { files: await readManifestFiles(manifest), manifest };
}

export async function readArchivedSourceFiles(manifest: StagedSourceManifest, scope: StagedSourceScope) {
  validateStagedSourceFiles(manifest.files);
  if (manifest.userId !== scope.userId || manifest.tenantId !== scope.tenantId || manifest.centerId !== scope.centerId || manifest.files.some(file => {
    const day = file.path.split("/")[1];
    const prefix = `school-import-archives/${day}/${encodeURIComponent(scope.tenantId)}/${encodeURIComponent(scope.centerId)}/${encodeURIComponent(scope.userId)}/`;
    return !/^\d{4}-\d{2}-\d{2}$/.test(day) || !file.path.startsWith(prefix);
  })) throw new Error("The original report backup scope is invalid.");
  return readManifestFiles(manifest);
}

async function readManifestFiles(manifest: StagedSourceManifest) {
  await requireAssetHubBucket();
  const client = getSupabaseStorageClient();
  const files: File[] = [];
  for (let index = 0; index < manifest.files.length; index += 8) {
    const group = await Promise.all(manifest.files.slice(index, index + 8).map(async file => {
    const { data: info, error: infoError } = await client.storage.from(ASSET_HUB_BUCKET).info(file.path);
    if (infoError || !info || info.size !== file.size) throw new Error("A report upload is incomplete or its size changed. Retry the upload with the same files.");
    const { data, error } = await client.storage.from(ASSET_HUB_BUCKET).download(file.path);
    if (error || !data || data.size !== file.size) throw new Error("A report could not be retrieved. Retry with the same selected files.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("A report changed after upload. Select the unchanged source reports again.");
    return new File([bytes], file.name);
    }));
    files.push(...group);
  }
  return files;
}
